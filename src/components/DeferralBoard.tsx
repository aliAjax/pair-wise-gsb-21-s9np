import { useState } from "react";
import {
  HEALTH_LABEL,
  healthOf,
  usageOf,
  type Aircraft,
  type Deferral,
  type Health,
  type LimitSnapshot,
  type RectificationInput,
} from "../domain/deferral";
import { ataName } from "../data/reference";
import { fmtDate, fmtDateTime, fmtDays, fmtHours, parseNullableNumber } from "../utils/format";

interface Props {
  aircraft: Aircraft[];
  deferrals: Deferral[];
  now: number;
  onRectify: (id: string, r: RectificationInput) => void;
  onExtend: (id: string, limits: LimitSnapshot, engineer: string, basis: string) => void;
  onReopen: (id: string, actor: string, reason: string) => void;
}

type PanelMode = "rectify" | "extend" | "history" | "reopen" | null;

const HEALTH_ORDER: Record<Health, number> = { expired: 0, near: 1, ok: 2, closed: 3 };

/** 保留故障台账:按飞机筛选,到限置顶,排故/延期/重开均留痕 */
export default function DeferralBoard({ aircraft, deferrals, now, onRectify, onExtend, onReopen }: Props) {
  const [acFilter, setAcFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState<"all" | Health>("all");
  const [panel, setPanel] = useState<{ id: string; mode: PanelMode }>({ id: "", mode: null });

  const acById = new Map(aircraft.map((a) => [a.id, a]));
  const toggle = (id: string, mode: PanelMode) =>
    setPanel((p) => (p.id === id && p.mode === mode ? { id: "", mode: null } : { id, mode }));

  const rows = deferrals.flatMap((d) => {
    const ac = acById.get(d.aircraftId);
    if (!ac) return [];
    if (acFilter !== "all" && d.aircraftId !== acFilter) return [];
    const health = healthOf(d, ac, now);
    if (healthFilter !== "all" && health !== healthFilter) return [];
    return [{ d, ac, health }];
  });
  rows.sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || b.d.deferredAt.localeCompare(a.d.deferredAt));

  const healthFilters: Array<"all" | Health> = ["all", "ok", "near", "expired", "closed"];

  return (
    <div>
      <div className="filter-row">
        <button className={acFilter === "all" ? "active" : ""} onClick={() => setAcFilter("all")}>
          全部飞机
        </button>
        {aircraft.map((ac) => (
          <button
            key={ac.id}
            className={acFilter === ac.id ? "active" : ""}
            onClick={() => setAcFilter(ac.id)}
          >
            {ac.id}
          </button>
        ))}
      </div>
      <div className="filter-row">
        {healthFilters.map((h) => (
          <button
            key={h}
            className={healthFilter === h ? "active" : ""}
            onClick={() => setHealthFilter(h)}
          >
            {h === "all" ? "全部状态" : HEALTH_LABEL[h]}
          </button>
        ))}
      </div>

      {rows.length === 0 && <p className="meta">当前筛选条件下没有保留项。</p>}

      <div className="deferral-list">
        {rows.map(({ d, ac, health }) => {
          const usage = usageOf(d, ac, now);
          const open = d.status === "open";
          const lastRect = d.rectifications[d.rectifications.length - 1];
          const expanded = panel.id === d.id ? panel.mode : null;
          return (
            <article key={d.id} className={`deferral-card health-${health}`}>
              <header>
                <div>
                  <strong>{d.id}</strong>
                  <span className="meta">
                    {ac.id} · {ac.model} · ATA {d.ata} {ataName(d.ata)}
                  </span>
                </div>
                <div className="badges">
                  <span className="badge cat">{d.category} 类</span>
                  <span className={`badge ${health}`}>{HEALTH_LABEL[health]}</span>
                </div>
              </header>

              <h3>{d.title}</h3>
              <p className="desc">{d.description}</p>
              <p className="meta">
                保留于 {fmtDateTime(d.deferredAt)} · 申请人 {d.deferredBy} · 依据 {d.melRef}
              </p>

              {open && (
                <>
                  <p className="usage-row">
                    已飞 <strong>{fmtHours(usage.hours)}</strong> 小时 · <strong>{usage.cycles}</strong> 循环 ·{" "}
                    <strong>{fmtDays(usage.days)}</strong> 天(自保留起)
                  </p>
                  <LimitBar label="日历天" used={usage.days} limit={d.limitDays} unit="天" health={health} fmt={fmtDays} />
                  {d.limitHours != null && (
                    <LimitBar label="飞行小时" used={usage.hours} limit={d.limitHours} unit="小时" health={health} fmt={fmtHours} />
                  )}
                  {d.limitCycles != null && (
                    <LimitBar
                      label="循环"
                      used={usage.cycles}
                      limit={d.limitCycles}
                      unit="循环"
                      health={health}
                      fmt={(v) => String(Math.round(v))}
                    />
                  )}
                </>
              )}

              {!open && lastRect && d.closedAt && (
                <div className="closed-note">
                  已于 {fmtDateTime(d.closedAt)} 关闭 · 件号 {lastRect.partNumber} · 工作者 {lastRect.worker} · 复检{" "}
                  {lastRect.recheckBy}:{lastRect.conclusion}
                </div>
              )}
              {open && lastRect?.result === "fail" && (
                <div className="fail-note">
                  最近复检不通过({fmtDate(lastRect.at)} · {lastRect.recheckBy}),需重新排故:{lastRect.conclusion}
                </div>
              )}

              <div className="card-actions">
                {open ? (
                  <>
                    <button className="primary-action" onClick={() => toggle(d.id, "rectify")}>
                      排故登记
                    </button>
                    <button onClick={() => toggle(d.id, "extend")}>延长期限</button>
                  </>
                ) : (
                  <button onClick={() => toggle(d.id, "reopen")}>重新打开</button>
                )}
                <button onClick={() => toggle(d.id, "history")}>期限与记录</button>
              </div>

              {expanded === "rectify" && (
                <RectifyForm
                  onSubmit={(r) => {
                    onRectify(d.id, r);
                    toggle(d.id, null);
                  }}
                  onCancel={() => toggle(d.id, null)}
                />
              )}
              {expanded === "extend" && (
                <ExtendForm
                  current={d}
                  onSubmit={(limits, engineer, basis) => {
                    onExtend(d.id, limits, engineer, basis);
                    toggle(d.id, null);
                  }}
                  onCancel={() => toggle(d.id, null)}
                />
              )}
              {expanded === "reopen" && (
                <ReopenForm
                  onSubmit={(actor, reason) => {
                    onReopen(d.id, actor, reason);
                    toggle(d.id, null);
                  }}
                  onCancel={() => toggle(d.id, null)}
                />
              )}
              {expanded === "history" && <HistoryView d={d} />}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function LimitBar({
  label,
  used,
  limit,
  unit,
  health,
  fmt,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  health: Health;
  fmt: (n: number) => string;
}) {
  const remaining = limit - used;
  const pct = Math.min(100, Math.max(0, (used / limit) * 100));
  return (
    <div className={`limit-bar ${health}`}>
      <div className="limit-bar-head">
        <span>{label}</span>
        <span>
          已用 {fmt(used)} / 期限 {fmt(limit)} {unit} ·{" "}
          {remaining > 0 ? (
            <strong>剩余 {fmt(remaining)} {unit}</strong>
          ) : (
            <strong className="over">已到限 {fmt(Math.abs(remaining))} {unit}</strong>
          )}
        </span>
      </div>
      <div className="limit-track">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 排故登记:件号、工作者、复检结论;复检通过才关闭 */
function RectifyForm({ onSubmit, onCancel }: { onSubmit: (r: RectificationInput) => void; onCancel: () => void }) {
  const [partNumber, setPartNumber] = useState("");
  const [worker, setWorker] = useState("");
  const [recheckBy, setRecheckBy] = useState("");
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [conclusion, setConclusion] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!partNumber.trim() || !worker.trim() || !recheckBy.trim() || !conclusion.trim()) {
      setError("请完整填写件号、工作者、复检人和复检结论。");
      return;
    }
    onSubmit({
      partNumber: partNumber.trim(),
      worker: worker.trim(),
      recheckBy: recheckBy.trim(),
      result,
      conclusion: conclusion.trim(),
    });
  };

  return (
    <div className="inline-form">
      <div className="field-grid">
        <label>
          <span>件号</span>
          <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="更换件/修理件件号" />
        </label>
        <label>
          <span>工作者</span>
          <input value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="排故工作者" />
        </label>
        <label>
          <span>复检人</span>
          <input value={recheckBy} onChange={(e) => setRecheckBy(e.target.value)} placeholder="复检人员" />
        </label>
        <label>
          <span>复检结论</span>
          <select value={result} onChange={(e) => setResult(e.target.value as "pass" | "fail")}>
            <option value="pass">通过(关闭保留项)</option>
            <option value="fail">不通过(保持打开)</option>
          </select>
        </label>
        <label className="span-2">
          <span>结论说明</span>
          <input value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="复检结论与测试情况" />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="hint">复检通过才关闭保留项;不通过则保留项保持打开并记录本次结论。</p>
      <div className="card-actions">
        <button className="primary-action" onClick={submit}>
          提交排故登记
        </button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 延长期限:值班工程师写明依据,旧期限自动存入沿革 */
function ExtendForm({
  current,
  onSubmit,
  onCancel,
}: {
  current: Deferral;
  onSubmit: (limits: LimitSnapshot, engineer: string, basis: string) => void;
  onCancel: () => void;
}) {
  const [days, setDays] = useState(String(current.limitDays));
  const [hours, setHours] = useState(current.limitHours == null ? "" : String(current.limitHours));
  const [cycles, setCycles] = useState(current.limitCycles == null ? "" : String(current.limitCycles));
  const [engineer, setEngineer] = useState("");
  const [basis, setBasis] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const d = Number(days);
    if (!Number.isFinite(d) || d <= 0) {
      setError("请填写有效的日历天期限。");
      return;
    }
    if ((hours.trim() !== "" && parseNullableNumber(hours) == null) || (cycles.trim() !== "" && parseNullableNumber(cycles) == null)) {
      setError("飞行小时/循环期限须为数字,或留空表示不限。");
      return;
    }
    if (!engineer.trim() || !basis.trim()) {
      setError("延长期限须由值班工程师签署并写明依据。");
      return;
    }
    onSubmit(
      { limitDays: d, limitHours: parseNullableNumber(hours), limitCycles: parseNullableNumber(cycles) },
      engineer.trim(),
      basis.trim(),
    );
  };

  return (
    <div className="inline-form">
      <div className="field-grid">
        <label>
          <span>新期限 · 日历天</span>
          <input value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label>
          <span>新期限 · 飞行小时(可空)</span>
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="留空表示不限" />
        </label>
        <label>
          <span>新期限 · 循环(可空)</span>
          <input value={cycles} onChange={(e) => setCycles(e.target.value)} placeholder="留空表示不限" />
        </label>
        <label>
          <span>值班工程师</span>
          <input value={engineer} onChange={(e) => setEngineer(e.target.value)} placeholder="签署人" />
        </label>
        <label className="span-2">
          <span>延期依据</span>
          <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="如:航材在途单号、MEL 延期条款" />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="hint">延期后旧期限自动存入期限沿革,仍可查询。</p>
      <div className="card-actions">
        <button className="primary-action" onClick={submit}>
          确认延期
        </button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 重新打开:已关闭项仍可办理,期限自当前飞行数据重新起算 */
function ReopenForm({ onSubmit, onCancel }: { onSubmit: (actor: string, reason: string) => void; onCancel: () => void }) {
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!actor.trim() || !reason.trim()) {
      setError("请填写办理人和重开原因。");
      return;
    }
    onSubmit(actor.trim(), reason.trim());
  };

  return (
    <div className="inline-form">
      <div className="field-grid">
        <label>
          <span>办理人</span>
          <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="重开办理人" />
        </label>
        <label>
          <span>重开原因</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如:故障复发、定检再次发现" />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="hint">重开后保留期限自本机当前飞行数据重新起算,原期限值保留在期限沿革中。</p>
      <div className="card-actions">
        <button className="primary-action" onClick={submit}>
          确认重开
        </button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 期限沿革与操作记录:旧期限、延期依据、全部操作可查 */
function HistoryView({ d }: { d: Deferral }) {
  return (
    <div className="history-view">
      <h4>期限沿革(旧期限可查)</h4>
      <ul>
        {[...d.limitHistory].reverse().map((r, i) => (
          <li key={i}>
            <strong>{r.kind}</strong> · {fmtDateTime(r.at)} · {r.by} · 期限 {r.limitDays} 天
            {r.limitHours != null ? ` / ${r.limitHours} 小时` : ""}
            {r.limitCycles != null ? ` / ${r.limitCycles} 循环` : ""}
            <p>依据:{r.basis}</p>
          </li>
        ))}
      </ul>
      <h4>操作记录</h4>
      <ul>
        {[...d.events].reverse().map((e, i) => (
          <li key={i}>
            <strong>{e.action}</strong> · {fmtDateTime(e.at)} · {e.actor}
            <p>{e.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
