import "./styles.css";
import { seedStore, useMaintenanceStore } from "./data/store";
import { ATA_CHAPTERS, CATEGORY_POLICIES } from "./data/reference";
import {
  healthOf,
  releaseDecision,
  type Deferral,
  type LimitSnapshot,
  type Rectification,
  type RectificationInput,
  type ReleaseEvent,
} from "./domain/deferral";
import FleetPanel from "./components/FleetPanel";
import DeferralForm, { type NewDeferralInput } from "./components/DeferralForm";
import DeferralBoard from "./components/DeferralBoard";

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function App() {
  const [store, setStore] = useMaintenanceStore();
  const now = Date.now();

  // 指标:在册飞机 / 监控中 / 临近到限 / 到限停场
  let monitoring = 0;
  let near = 0;
  let expired = 0;
  for (const d of store.deferrals) {
    const ac = store.aircraft.find((a) => a.id === d.aircraftId);
    if (!ac) continue;
    const h = healthOf(d, ac, now);
    if (h === "ok") monitoring += 1;
    else if (h === "near") near += 1;
    else if (h === "expired") expired += 1;
  }

  // 登记保留:已飞数据基准取本机当前累计
  const addDeferral = (input: NewDeferralInput): string => {
    const id = `D-${String(store.seq).padStart(4, "0")}`;
    setStore((s) => {
      const ac = s.aircraft.find((a) => a.id === input.aircraftId);
      if (!ac) return s;
      const at = new Date().toISOString();
      const d: Deferral = {
        id,
        aircraftId: input.aircraftId,
        ata: input.ata,
        category: input.category,
        title: input.title,
        description: input.description,
        melRef: input.melRef,
        deferredAt: at,
        deferredBy: input.deferredBy,
        baseHours: ac.hours,
        baseCycles: ac.cycles,
        limitDays: input.limitDays,
        limitHours: input.limitHours,
        limitCycles: input.limitCycles,
        status: "open",
        rectifications: [],
        limitHistory: [
          {
            at,
            by: input.deferredBy,
            basis: `初始登记 · ${input.melRef}`,
            kind: "初始",
            limitDays: input.limitDays,
            limitHours: input.limitHours,
            limitCycles: input.limitCycles,
          },
        ],
        events: [
          { at, actor: input.deferredBy, action: "保留登记", detail: `ATA ${input.ata} · ${input.category} 类 · ${input.title}` },
        ],
        closedAt: null,
      };
      return { ...s, seq: s.seq + 1, deferrals: [d, ...s.deferrals] };
    });
    return id;
  };

  // 排故登记:复检通过才关闭,不通过保持打开
  const rectify = (id: string, r: RectificationInput) => {
    setStore((s) => ({
      ...s,
      deferrals: s.deferrals.map((d) => {
        if (d.id !== id) return d;
        const at = new Date().toISOString();
        const pass = r.result === "pass";
        const rec: Rectification = { ...r, at };
        return {
          ...d,
          rectifications: [...d.rectifications, rec],
          status: pass ? "closed" : d.status,
          closedAt: pass ? at : d.closedAt,
          events: [
            ...d.events,
            {
              at,
              actor: r.worker,
              action: pass ? "排故关闭" : "复检不通过",
              detail: `件号 ${r.partNumber} · 复检${pass ? "通过" : "不通过"} · ${r.conclusion}`,
            },
          ],
        };
      }),
    }));
  };

  // 延长期限:值班工程师写明依据,旧期限存入沿革
  const extendLimit = (id: string, limits: LimitSnapshot, engineer: string, basis: string) => {
    setStore((s) => ({
      ...s,
      deferrals: s.deferrals.map((d) => {
        if (d.id !== id) return d;
        const at = new Date().toISOString();
        const parts = [`日历天 ${d.limitDays} → ${limits.limitDays} 天`];
        if (limits.limitHours != null) parts.push(`飞行小时期限 ${limits.limitHours}`);
        if (limits.limitCycles != null) parts.push(`循环期限 ${limits.limitCycles}`);
        return {
          ...d,
          ...limits,
          limitHistory: [...d.limitHistory, { ...limits, at, by: engineer, basis, kind: "延期" as const }],
          events: [...d.events, { at, actor: engineer, action: "延长期限", detail: `${parts.join(" · ")} · 依据:${basis}` }],
        };
      }),
    }));
  };

  // 重新打开:期限自本机当前飞行数据重新起算
  const reopenDeferral = (id: string, actor: string, reason: string) => {
    setStore((s) => ({
      ...s,
      deferrals: s.deferrals.map((d) => {
        if (d.id !== id) return d;
        const ac = s.aircraft.find((a) => a.id === d.aircraftId);
        const at = new Date().toISOString();
        return {
          ...d,
          status: "open" as const,
          closedAt: null,
          deferredAt: at,
          baseHours: ac ? ac.hours : d.baseHours,
          baseCycles: ac ? ac.cycles : d.baseCycles,
          limitHistory: [
            ...d.limitHistory,
            {
              limitDays: d.limitDays,
              limitHours: d.limitHours,
              limitCycles: d.limitCycles,
              at,
              by: actor,
              basis: reason,
              kind: "重开" as const,
            },
          ],
          events: [...d.events, { at, actor, action: "重新打开", detail: `重开原因:${reason} · 期限自当前飞行数据重新起算` }],
        };
      }),
    }));
  };

  // 更新本机飞行小时/循环
  const updateTotals = (id: string, hours: number, cycles: number) => {
    setStore((s) => ({
      ...s,
      aircraft: s.aircraft.map((a) => (a.id === id ? { ...a, hours, cycles } : a)),
    }));
  };

  // 签发放行:判定层复核,任一到限禁止签发
  const signRelease = (aircraftId: string, by: string) => {
    setStore((s) => {
      const ac = s.aircraft.find((a) => a.id === aircraftId);
      if (!ac) return s;
      if (!releaseDecision(ac, s.deferrals, Date.now()).canRelease) return s;
      const ev: ReleaseEvent = {
        id: `R-${String(s.seq).padStart(4, "0")}`,
        aircraftId,
        at: new Date().toISOString(),
        by,
        note: "航前放行",
      };
      return { ...s, seq: s.seq + 1, releases: [ev, ...s.releases] };
    });
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-07 · port 5107</p>
          <h1>航空维修检查清单</h1>
          <p className="subtitle">
            保留故障台账:按 ATA 章节登记缺陷类别与期限,自动比对已飞数据,任一期限到限即转停场、禁止签发放行;排故复检通过才关闭,延期与重开全程留痕可查。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS</strong>
          <span>资料 / 判定 / 本机保存 分层维护</span>
          <button
            className="reset-btn"
            onClick={() => {
              if (window.confirm("确定清空本机数据并恢复示例数据?")) setStore(seedStore());
            }}
          >
            重置示例数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="在册飞机" value={String(store.aircraft.length)} index={0} />
        <MetricCard label="监控中保留" value={String(monitoring)} index={1} />
        <MetricCard label="临近到限" value={String(near)} index={2} />
        <MetricCard label="到限停场" value={String(expired)} index={3} />
      </section>

      <FleetPanel
        aircraft={store.aircraft}
        deferrals={store.deferrals}
        releases={store.releases}
        now={now}
        onUpdateTotals={updateTotals}
        onSignRelease={signRelease}
      />

      <section className="workspace">
        <aside className="panel narrow">
          <h2>保留类别期限(资料)</h2>
          <div className="policy-list">
            {CATEGORY_POLICIES.map((p) => (
              <div className="policy-item" key={p.category}>
                <strong>
                  {p.label} · {p.repairDays} 天
                </strong>
                <p>{p.rule}</p>
              </div>
            ))}
          </div>
          <h2>ATA 章节</h2>
          <div className="chips muted">
            {ATA_CHAPTERS.map((c) => (
              <span key={c.code}>
                {c.code} {c.name}
              </span>
            ))}
          </div>
          <h2>角色</h2>
          <div className="chips">
            {["维修工程师", "放行人员", "值班工程师"].map((user) => (
              <span key={user}>{user}</span>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>新增保留</p>
              <h2>保留故障登记</h2>
            </div>
          </div>
          <DeferralForm aircraft={store.aircraft} onAdd={addDeferral} />
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>按飞机筛选 · 到限置顶</p>
            <h2>保留故障台账</h2>
          </div>
        </div>
        <DeferralBoard
          aircraft={store.aircraft}
          deferrals={store.deferrals}
          now={now}
          onRectify={rectify}
          onExtend={extendLimit}
          onReopen={reopenDeferral}
        />
      </section>
    </main>
  );
}

export default App;
