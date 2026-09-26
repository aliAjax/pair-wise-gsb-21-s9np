import { useState } from "react";
import {
  releaseDecision,
  type Aircraft,
  type Deferral,
  type ReleaseEvent,
} from "../domain/deferral";
import { fmtDateTime, fmtDays, fmtHours } from "../utils/format";

interface Props {
  aircraft: Aircraft[];
  deferrals: Deferral[];
  releases: ReleaseEvent[];
  now: number;
  onUpdateTotals: (id: string, hours: number, cycles: number) => void;
  onSignRelease: (aircraftId: string, by: string) => void;
}

/** 机队与航前放行:任一保留项到限即转停场,禁止签发放行 */
export default function FleetPanel(props: Props) {
  return (
    <section className="panel fleet-panel">
      <div className="section-heading">
        <div>
          <p>机队与放行</p>
          <h2>航前放行状态</h2>
        </div>
      </div>
      <div className="fleet-grid">
        {props.aircraft.map((ac) => (
          <AircraftCard key={ac.id} ac={ac} {...props} />
        ))}
      </div>
    </section>
  );
}

function AircraftCard({
  ac,
  deferrals,
  releases,
  now,
  onUpdateTotals,
  onSignRelease,
}: Props & { ac: Aircraft }) {
  const decision = releaseDecision(ac, deferrals, now);
  const grounded = !decision.canRelease;
  const openCount = deferrals.filter((d) => d.aircraftId === ac.id && d.status === "open").length;
  const lastRelease = releases.find((r) => r.aircraftId === ac.id);

  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(String(ac.hours));
  const [cycles, setCycles] = useState(String(ac.cycles));
  const [err, setErr] = useState("");
  const [releaser, setReleaser] = useState("");

  const saveTotals = () => {
    const h = Number(hours);
    const c = Number(cycles);
    if (!Number.isFinite(h) || !Number.isFinite(c) || h < ac.hours || c < ac.cycles) {
      setErr("新数据不得小于当前累计值。");
      return;
    }
    onUpdateTotals(ac.id, h, c);
    setEditing(false);
    setErr("");
  };

  const statusClass = grounded ? "danger" : decision.watchers.length > 0 ? "watch" : "ok";
  const statusText = grounded
    ? "停场 · 保留故障到限"
    : decision.watchers.length > 0
      ? "可放行 · 有临近项"
      : "可放行";

  return (
    <article className={`fleet-card ${statusClass}`}>
      <header>
        <div>
          <strong>{ac.id}</strong>
          <span className="meta">{ac.model}</span>
        </div>
        <span className={`badge ${statusClass}`}>{statusText}</span>
      </header>

      <dl className="totals">
        <div>
          <dt>飞行小时</dt>
          <dd>{fmtHours(ac.hours)}</dd>
        </div>
        <div>
          <dt>循环</dt>
          <dd>{ac.cycles}</dd>
        </div>
        <div>
          <dt>开放保留</dt>
          <dd>{openCount} 项</dd>
        </div>
      </dl>

      {grounded ? (
        <div className="blocker-list">
          {decision.blockers.map((b) => (
            <p key={b.id}>
              {b.id} · ATA {b.ata} {b.title} 已到限,转停场。
            </p>
          ))}
        </div>
      ) : decision.nextExpiry ? (
        <p className="next-expiry">
          最早到限:{decision.nextExpiry.deferral.id}(ATA {decision.nextExpiry.deferral.ata})· 剩{" "}
          {fmtDays(decision.nextExpiry.remaining.days)} 天
          {decision.nextExpiry.remaining.hours != null &&
            ` / ${fmtHours(decision.nextExpiry.remaining.hours)} 小时`}
          {decision.nextExpiry.remaining.cycles != null &&
            ` / ${Math.round(decision.nextExpiry.remaining.cycles)} 循环`}
        </p>
      ) : (
        <p className="next-expiry">无开放保留项。</p>
      )}

      <div className="release-row">
        <input
          placeholder="放行员"
          value={releaser}
          onChange={(e) => setReleaser(e.target.value)}
        />
        <button
          className="primary-action"
          disabled={grounded || !releaser.trim()}
          title={grounded ? "存在到限保留项,禁止签发放行" : "签发航前放行"}
          onClick={() => {
            onSignRelease(ac.id, releaser.trim());
            setReleaser("");
          }}
        >
          签发放行
        </button>
      </div>
      {grounded && <p className="form-error">存在到限保留项,不能签发放行。</p>}
      <p className="meta">
        最近放行:
        {lastRelease ? `${fmtDateTime(lastRelease.at)} · ${lastRelease.by} · ${lastRelease.note}` : "暂无记录"}
      </p>

      {editing ? (
        <div className="inline-form">
          <div className="field-grid">
            <label>
              <span>最新飞行小时</span>
              <input value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
            <label>
              <span>最新循环</span>
              <input value={cycles} onChange={(e) => setCycles(e.target.value)} />
            </label>
          </div>
          {err && <p className="form-error">{err}</p>}
          <div className="card-actions">
            <button className="primary-action" onClick={saveTotals}>
              保存
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setErr("");
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="card-actions">
          <button
            onClick={() => {
              setHours(String(ac.hours));
              setCycles(String(ac.cycles));
              setEditing(true);
            }}
          >
            更新飞行数据
          </button>
        </div>
      )}
    </article>
  );
}
