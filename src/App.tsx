import { useEffect, useState } from "react";
import "./styles.css";
import { ATA_CHAPTERS, CATEGORY_LABEL, MEL_CATEGORIES, UNIT_LABEL } from "./data/reference";
import {
  NEAR_LIMIT,
  computeLimitState,
  evaluateAircraft,
  extendLimit,
  recordFlight,
  registerDefect,
  releaseVerdict,
  reopenDefect,
  reviewRectification,
  submitRectification,
} from "./domain/deferral";
import type {
  Aircraft,
  Category,
  DeferredDefect,
  DefectStatus,
  LedgerState,
  LimitState,
  LimitUnit,
} from "./domain/deferral";
import { loadLedger, resetLedger, saveLedger } from "./storage/ledgerStore";

const STATUS_META: Record<DefectStatus, { label: string; className: string }> = {
  OPEN: { label: "在控", className: "badge badge-open" },
  PENDING_REVIEW: { label: "待复检", className: "badge badge-pending" },
  CLOSED: { label: "已关闭", className: "badge badge-closed" },
};

const UNITS: LimitUnit[] = ["DAYS", "FH", "FC"];
const CATEGORIES: Category[] = ["A", "B", "C", "D"];

const fmtDate = (iso: string) => iso.slice(0, 10);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Hero({ onReset }: { onReset: () => void }) {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">hxwl-07 · port 5107 · 保留故障台</p>
        <h1>航空维修检查清单 · 保留故障台</h1>
        <p className="subtitle">
          按 ATA 章节登记保留故障，期限按日历天 / 飞行小时 / 循环控制，已飞数据随机队累计自动更新；
          任一到限即转停场，不能签放行。排故登记件号与工作者，复检通过方可关闭；
          延期须值班工程师写明依据，旧期限保留可查。
        </p>
      </div>
      <div className="stack-card">
        <span>数据说明</span>
        <strong>资料 / 判定 / 本机保存 分层维护</strong>
        <span>台账保存在本机浏览器，可离线使用</span>
        <button onClick={onReset}>恢复示例数据</button>
      </div>
    </section>
  );
}

function Metrics({ ledger, now }: { ledger: LedgerState; now: Date }) {
  const aircraftMap = new Map(ledger.aircraft.map((a) => [a.registration, a]));
  const openDefects = ledger.defects.filter((d) => d.status !== "CLOSED");
  const nearCount = openDefects.filter((d) => {
    const ac = aircraftMap.get(d.aircraftReg);
    if (!ac) return false;
    const s = computeLimitState(d, ac, now);
    return !s.expired && s.remaining <= NEAR_LIMIT[s.unit];
  }).length;
  const groundedCount = ledger.aircraft.filter(
    (ac) => evaluateAircraft(ac, ledger.defects, now).status === "GROUNDED",
  ).length;

  const cards = [
    { label: "在册飞机", value: String(ledger.aircraft.length), tone: "status-ok" },
    { label: "在控保留项", value: String(openDefects.length), tone: "status-ok" },
    { label: "临期项", value: String(nearCount), tone: "status-watch" },
    { label: "停场飞机", value: String(groundedCount), tone: "status-danger" },
  ];

  return (
    <section className="metrics-grid">
      {cards.map((card) => (
        <article key={card.label} className="metric-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <i className={card.tone} />
        </article>
      ))}
    </section>
  );
}

function FleetPanel({
  ledger,
  selected,
  onSelect,
  now,
}: {
  ledger: LedgerState;
  selected: string;
  onSelect: (reg: string) => void;
  now: Date;
}) {
  return (
    <aside className="panel narrow">
      <h2>机队（按飞机筛选）</h2>
      <div className="fleet-list">
        <button
          className={selected === "ALL" ? "fleet-card selected" : "fleet-card"}
          onClick={() => onSelect("ALL")}
        >
          <strong>全部飞机</strong>
          <span className="fleet-meta">查看机队放行状态总表</span>
        </button>
        {ledger.aircraft.map((ac) => {
          const evaluation = evaluateAircraft(ac, ledger.defects, now);
          const openCount = ledger.defects.filter(
            (d) => d.aircraftReg === ac.registration && d.status !== "CLOSED",
          ).length;
          return (
            <button
              key={ac.registration}
              className={selected === ac.registration ? "fleet-card selected" : "fleet-card"}
              onClick={() => onSelect(ac.registration)}
            >
              <strong>
                {ac.registration} · {ac.type}
              </strong>
              <span className="fleet-meta">
                累计 {ac.totalHours} 小时 / {ac.totalCycles} 循环 · 在控 {openCount} 项
              </span>
              <span className={evaluation.status === "GROUNDED" ? "badge badge-grounded" : "badge badge-ok"}>
                {evaluation.status === "GROUNDED" ? "停场" : "适航"}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function FleetOverview({ ledger, now }: { ledger: LedgerState; now: Date }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>放行判定</p>
          <h2>机队放行状态</h2>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>注册号</th>
            <th>机型</th>
            <th>累计小时</th>
            <th>累计循环</th>
            <th>在控保留项</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {ledger.aircraft.map((ac) => {
            const evaluation = evaluateAircraft(ac, ledger.defects, now);
            const openCount = ledger.defects.filter(
              (d) => d.aircraftReg === ac.registration && d.status !== "CLOSED",
            ).length;
            return (
              <tr key={ac.registration}>
                <td>{ac.registration}</td>
                <td>{ac.type}</td>
                <td>{ac.totalHours}</td>
                <td>{ac.totalCycles}</td>
                <td>{openCount}</td>
                <td>
                  <span className={evaluation.status === "GROUNDED" ? "badge badge-grounded" : "badge badge-ok"}>
                    {evaluation.status === "GROUNDED" ? "停场" : "适航"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">在左侧选择单机，可查看放行判定详情并登记飞行数据。</p>
    </section>
  );
}

function ReleasePanel({
  aircraft,
  defects,
  now,
  onAircraft,
}: {
  aircraft: Aircraft;
  defects: DeferredDefect[];
  now: Date;
  onAircraft: (next: Aircraft) => void;
}) {
  const [hours, setHours] = useState("");
  const [cycles, setCycles] = useState("");
  const [error, setError] = useState("");
  const verdict = releaseVerdict(aircraft, defects, now);

  const submitFlight = () => {
    try {
      onAircraft(recordFlight(aircraft, Number(hours), Number(cycles)));
      setHours("");
      setCycles("");
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>放行判定</p>
          <h2>
            {aircraft.registration} · {aircraft.type}
          </h2>
        </div>
        <span className="fleet-meta">
          累计 {aircraft.totalHours} 小时 / {aircraft.totalCycles} 循环
        </span>
      </div>

      <div className={verdict.allowed ? "verdict ok" : "verdict blocked"}>
        {verdict.allowed ? "✓ 可签放行：无到限保留项" : "✕ 转停场：存在到限保留项，不能签放行"}
      </div>

      {verdict.reasons.length > 0 && (
        <ul className="alert-list">
          {verdict.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      {verdict.evaluation.nearLimit.length > 0 && (
        <div className="near-list">
          <strong>临期提醒</strong>
          <ul>
            {verdict.evaluation.nearLimit.map(({ defect, state }) => (
              <li key={defect.id}>
                ATA {defect.ataChapter}「{defect.title}」剩余 {state.remaining} {UNIT_LABEL[state.unit]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="subpanel">
        <h4>登记飞行数据</h4>
        <p className="muted">登记后按小时 / 循环控制的保留项已飞数据同步更新，到限自动转停场。</p>
        <div className="form-row">
          <label>
            <span>本段飞行小时</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="如 2.5"
            />
          </label>
          <label>
            <span>本段循环</span>
            <input
              type="number"
              min="0"
              step="1"
              value={cycles}
              onChange={(e) => setCycles(e.target.value)}
              placeholder="如 1"
            />
          </label>
          <button className="primary-action align-end" onClick={submitFlight}>
            登记飞行
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </section>
  );
}

function RegisterForm({
  aircraft,
  defaultReg,
  now,
  onAdd,
}: {
  aircraft: Aircraft[];
  defaultReg: string;
  now: Date;
  onAdd: (defect: DeferredDefect) => void;
}) {
  const [reg, setReg] = useState(defaultReg === "ALL" ? (aircraft[0]?.registration ?? "") : defaultReg);
  const [ata, setAta] = useState(ATA_CHAPTERS[0]?.code ?? "21");
  const [category, setCategory] = useState<Category>("C");
  const [unit, setUnit] = useState<LimitUnit>(MEL_CATEGORIES.C.defaultLimit.unit);
  const [value, setValue] = useState(String(MEL_CATEGORIES.C.defaultLimit.value));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const applyCategory = (next: Category) => {
    setCategory(next);
    setUnit(MEL_CATEGORIES[next].defaultLimit.unit);
    setValue(String(MEL_CATEGORIES[next].defaultLimit.value));
  };

  const submit = () => {
    const ac = aircraft.find((a) => a.registration === reg);
    if (!ac) {
      setError("请选择飞机");
      return;
    }
    try {
      const defect = registerDefect(
        { aircraft: ac, ataChapter: ata, category, title, description, raisedBy, limit: { unit, value: Number(value) } },
        now,
      );
      onAdd(defect);
      setTitle("");
      setDescription("");
      setError("");
      setDone(`已登记保留项 ${defect.id}，期限 ${value} ${UNIT_LABEL[unit]}`);
    } catch (e) {
      setDone("");
      setError(errorText(e));
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>新增</p>
          <h2>登记保留故障</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>飞机注册号</span>
          <select value={reg} onChange={(e) => setReg(e.target.value)}>
            {aircraft.map((ac) => (
              <option key={ac.registration} value={ac.registration}>
                {ac.registration} · {ac.type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>ATA 章节</span>
          <select value={ata} onChange={(e) => setAta(e.target.value)}>
            {ATA_CHAPTERS.map((chapter) => (
              <option key={chapter.code} value={chapter.code}>
                ATA {chapter.code} · {chapter.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>保留类别（{MEL_CATEGORIES[category].note}）</span>
          <select value={category} onChange={(e) => applyCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>期限单位</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as LimitUnit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>期限值</span>
          <input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          <span>登记人</span>
          <input value={raisedBy} onChange={(e) => setRaisedBy(e.target.value)} placeholder="姓名" />
        </label>
        <label className="span-2">
          <span>缺陷标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="简要描述缺陷" />
        </label>
        <label className="span-2">
          <span>缺陷描述</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="故障现象、MEL 条款、挂签位置等" />
        </label>
      </div>
      <div className="form-footer">
        <button className="primary-action" onClick={submit}>
          登记保留
        </button>
        {error && <span className="error-text">{error}</span>}
        {done && <span className="success-text">{done}</span>}
      </div>
    </section>
  );
}

function LimitBar({ state }: { state: LimitState }) {
  const pct = state.limit > 0 ? Math.min(100, Math.max(0, (state.used / state.limit) * 100)) : 0;
  const tone = state.expired ? "danger" : state.remaining <= NEAR_LIMIT[state.unit] ? "warn" : "ok";
  return (
    <div className="limit-block">
      <div className="limit-track">
        <div className={`limit-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="limit-text">
        期限 {state.limit} {UNIT_LABEL[state.unit]} · 已消耗 {state.used} ·{" "}
        {state.expired
          ? `已到限，超出 ${Math.abs(state.remaining)} ${UNIT_LABEL[state.unit]}`
          : `剩余 ${state.remaining} ${UNIT_LABEL[state.unit]}`}
      </p>
    </div>
  );
}

function DefectCard({
  defect,
  aircraft,
  now,
  onChange,
}: {
  defect: DeferredDefect;
  aircraft: Aircraft;
  now: Date;
  onChange: (next: DeferredDefect) => void;
}) {
  const [panel, setPanel] = useState<"" | "rectify" | "review" | "extend" | "reopen" | "history">("");
  const [error, setError] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [worker, setWorker] = useState("");
  const [rectification, setRectification] = useState("");
  const [reviewPass, setReviewPass] = useState("pass");
  const [reviewer, setReviewer] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [extUnit, setExtUnit] = useState<LimitUnit>(defect.limit.unit);
  const [extValue, setExtValue] = useState(String(defect.limit.value));
  const [extReason, setExtReason] = useState("");
  const [extEngineer, setExtEngineer] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenActor, setReopenActor] = useState("");

  const state = computeLimitState(defect, aircraft, now);
  const expired = defect.status !== "CLOSED" && state.expired;
  const meta = STATUS_META[defect.status];

  const toggle = (next: typeof panel) => {
    setPanel(panel === next ? "" : next);
    setError("");
  };

  const run = (fn: () => DeferredDefect) => {
    try {
      onChange(fn());
      setPanel("");
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <article className={expired ? "defect-card expired" : "defect-card"}>
      <div className="defect-tags">
        <span className="badge badge-ata">ATA {defect.ataChapter}</span>
        <span className="badge badge-cat">{CATEGORY_LABEL[defect.category]}</span>
        <span className={meta.className}>{meta.label}</span>
        {expired && <span className="badge badge-expired">已到限 · 禁放行</span>}
      </div>
      <h3>{defect.title}</h3>
      <p className="defect-meta">
        {defect.id} · {defect.aircraftReg} · 登记人 {defect.raisedBy} · 登记于 {fmtDate(defect.raisedAt)}
      </p>
      {defect.description && <p className="defect-desc">{defect.description}</p>}

      {defect.status === "CLOSED" && defect.closure ? (
        <p className="closure-info">
          已关闭 · 件号 {defect.closure.partNumber} · 工作者 {defect.closure.worker} · 复检 {defect.closure.reviewer}
          ：{defect.closure.reviewNote} · {fmtDate(defect.closure.closedAt)}
        </p>
      ) : (
        <LimitBar state={state} />
      )}

      {defect.status === "PENDING_REVIEW" && defect.pendingFix && (
        <p className="pending-fix">
          排故待复检：件号 {defect.pendingFix.partNumber} · 工作者 {defect.pendingFix.worker} ·{" "}
          {defect.pendingFix.rectification}
        </p>
      )}

      <div className="defect-actions">
        {defect.status === "OPEN" && <button onClick={() => toggle("rectify")}>登记排故</button>}
        {defect.status === "PENDING_REVIEW" && <button onClick={() => toggle("review")}>复检结论</button>}
        {defect.status !== "CLOSED" && <button onClick={() => toggle("extend")}>申请延期</button>}
        {defect.status === "CLOSED" && <button onClick={() => toggle("reopen")}>重新打开</button>}
        <button onClick={() => toggle("history")}>历史与旧期限</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {panel === "rectify" && (
        <div className="subpanel">
          <h4>登记排故</h4>
          <div className="form-row">
            <label>
              <span>件号</span>
              <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="如 NAS6604-8" />
            </label>
            <label>
              <span>工作者</span>
              <input value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="姓名" />
            </label>
          </div>
          <label>
            <span>排故措施</span>
            <textarea value={rectification} onChange={(e) => setRectification(e.target.value)} placeholder="更换 / 修理内容及测试结果" />
          </label>
          <button
            className="primary-action"
            onClick={() => run(() => submitRectification(defect, { partNumber, worker, rectification }, now))}
          >
            提交排故，转待复检
          </button>
        </div>
      )}

      {panel === "review" && (
        <div className="subpanel">
          <h4>复检结论</h4>
          <div className="form-row">
            <label>
              <span>结论</span>
              <select value={reviewPass} onChange={(e) => setReviewPass(e.target.value)}>
                <option value="pass">通过 · 关闭</option>
                <option value="fail">不通过 · 退回排故</option>
              </select>
            </label>
            <label>
              <span>复检人</span>
              <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="姓名" />
            </label>
          </div>
          <label>
            <span>复检说明</span>
            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="复检结论依据" />
          </label>
          <button
            className="primary-action"
            onClick={() =>
              run(() => reviewRectification(defect, { pass: reviewPass === "pass", reviewer, note: reviewNote }, now))
            }
          >
            提交复检结论
          </button>
        </div>
      )}

      {panel === "extend" && (
        <div className="subpanel">
          <h4>申请延期（值班工程师）</h4>
          <p className="muted">
            当前期限 {defect.limit.value} {UNIT_LABEL[defect.limit.unit]}，延期后旧期限保留在历史中可查。
          </p>
          <div className="form-row">
            <label>
              <span>新期限单位</span>
              <select value={extUnit} onChange={(e) => setExtUnit(e.target.value as LimitUnit)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>新期限值</span>
              <input type="number" min="1" value={extValue} onChange={(e) => setExtValue(e.target.value)} />
            </label>
            <label>
              <span>值班工程师</span>
              <input value={extEngineer} onChange={(e) => setExtEngineer(e.target.value)} placeholder="姓名" />
            </label>
          </div>
          <label>
            <span>延期依据（必填）</span>
            <textarea value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder="引用 MEL 条款 / 厂家技术文件等依据" />
          </label>
          <button
            className="primary-action"
            onClick={() =>
              run(() => extendLimit(defect, { unit: extUnit, value: Number(extValue), reason: extReason, engineer: extEngineer }, now))
            }
          >
            确认延期
          </button>
        </div>
      )}

      {panel === "reopen" && (
        <div className="subpanel">
          <h4>重新打开</h4>
          <div className="form-row">
            <label>
              <span>经办人</span>
              <input value={reopenActor} onChange={(e) => setReopenActor(e.target.value)} placeholder="姓名" />
            </label>
            <label>
              <span>重开原因</span>
              <input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="如故障复发" />
            </label>
          </div>
          <button
            className="primary-action"
            onClick={() => run(() => reopenDefect(defect, { reason: reopenReason, actor: reopenActor }, now))}
          >
            确认重开
          </button>
        </div>
      )}

      {panel === "history" && (
        <div className="subpanel">
          <h4>延期记录（旧期限保留可查）</h4>
          {defect.extensions.length === 0 ? (
            <p className="muted">无延期记录</p>
          ) : (
            <ul className="history-list">
              {defect.extensions.map((ex, index) => (
                <li key={`${ex.extendedAt}-${index}`}>
                  <strong>
                    {ex.previousLimit.value} {UNIT_LABEL[ex.previousLimit.unit]} → {ex.newLimit.value}{" "}
                    {UNIT_LABEL[ex.newLimit.unit]}
                  </strong>
                  <span>
                    {ex.engineer} · {fmtDate(ex.extendedAt)}
                  </span>
                  <p>依据：{ex.reason}</p>
                </li>
              ))}
            </ul>
          )}
          <h4>操作轨迹</h4>
          <ul className="history-list">
            {[...defect.history].reverse().map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <strong>{event.action}</strong>
                <span>
                  {event.actor} · {fmtDate(event.at)}
                </span>
                {event.detail && <p>{event.detail}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function App() {
  const [ledger, setLedger] = useState<LedgerState>(() => loadLedger());
  const [selected, setSelected] = useState("ALL");
  const now = new Date();

  useEffect(() => {
    saveLedger(ledger);
  }, [ledger]);

  const aircraftMap = new Map(ledger.aircraft.map((a) => [a.registration, a]));
  const selectedAircraft = selected === "ALL" ? undefined : aircraftMap.get(selected);

  const visibleDefects = ledger.defects
    .filter((d) => selected === "ALL" || d.aircraftReg === selected)
    .map((d) => {
      const ac = aircraftMap.get(d.aircraftReg);
      const state = ac ? computeLimitState(d, ac, now) : undefined;
      const rank = d.status === "CLOSED" ? 2 : state?.expired ? 0 : 1;
      return { defect: d, rank };
    })
    .sort((a, b) => a.rank - b.rank || b.defect.raisedAt.localeCompare(a.defect.raisedAt))
    .map((entry) => entry.defect);

  const updateDefect = (next: DeferredDefect) =>
    setLedger((prev) => ({ ...prev, defects: prev.defects.map((d) => (d.id === next.id ? next : d)) }));
  const updateAircraft = (next: Aircraft) =>
    setLedger((prev) => ({ ...prev, aircraft: prev.aircraft.map((a) => (a.registration === next.registration ? next : a)) }));
  const addDefect = (defect: DeferredDefect) =>
    setLedger((prev) => ({ ...prev, defects: [defect, ...prev.defects] }));

  const handleReset = () => {
    if (window.confirm("恢复示例数据将清除本机保存的全部台账，继续？")) {
      setLedger(resetLedger());
    }
  };

  return (
    <main className="app-shell">
      <Hero onReset={handleReset} />
      <Metrics ledger={ledger} now={now} />

      <section className="workspace">
        <FleetPanel ledger={ledger} selected={selected} onSelect={setSelected} now={now} />
        {selectedAircraft ? (
          <ReleasePanel aircraft={selectedAircraft} defects={ledger.defects} now={now} onAircraft={updateAircraft} />
        ) : (
          <FleetOverview ledger={ledger} now={now} />
        )}
      </section>

      <RegisterForm key={selected} aircraft={ledger.aircraft} defaultReg={selected} now={now} onAdd={addDefect} />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>台账</p>
            <h2>
              保留故障台账{selected === "ALL" ? "（全部飞机）" : `（${selected}）`} · {visibleDefects.length} 项
            </h2>
          </div>
        </div>
        <div className="defect-list">
          {visibleDefects.length === 0 && <p className="muted">当前筛选下无保留项。</p>}
          {visibleDefects.map((defect) => {
            const ac = aircraftMap.get(defect.aircraftReg);
            if (!ac) return null;
            return <DefectCard key={defect.id} defect={defect} aircraft={ac} now={now} onChange={updateDefect} />;
          })}
        </div>
      </section>
    </main>
  );
}

export default App;
