import { useState } from "react";
import { ATA_CHAPTERS, CATEGORY_POLICIES, policyOf } from "../data/reference";
import type { Aircraft, MelCategory } from "../domain/deferral";
import { parseNullableNumber } from "../utils/format";

export interface NewDeferralInput {
  aircraftId: string;
  ata: string;
  category: MelCategory;
  title: string;
  description: string;
  melRef: string;
  deferredBy: string;
  limitDays: number;
  limitHours: number | null;
  limitCycles: number | null;
}

interface Props {
  aircraft: Aircraft[];
  onAdd: (input: NewDeferralInput) => string;
}

/** 保留故障登记:按 ATA 章节记录类别与期限,已飞数据自本机当前累计起算 */
export default function DeferralForm({ aircraft, onAdd }: Props) {
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? "");
  const [ata, setAta] = useState(ATA_CHAPTERS[3].code);
  const [category, setCategory] = useState<MelCategory>("C");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [melRef, setMelRef] = useState("");
  const [deferredBy, setDeferredBy] = useState("");
  const [limitDays, setLimitDays] = useState(String(policyOf("C").repairDays));
  const [limitHours, setLimitHours] = useState("");
  const [limitCycles, setLimitCycles] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const onCategoryChange = (value: MelCategory) => {
    setCategory(value);
    setLimitDays(String(policyOf(value).repairDays));
  };

  const submit = () => {
    const days = Number(limitDays);
    if (!aircraftId || !ata || !title.trim() || !deferredBy.trim()) {
      setError("请完整填写飞机、ATA 章节、缺陷名称和申请人。");
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      setError("请填写有效的日历天期限。");
      return;
    }
    if (
      (limitHours.trim() !== "" && parseNullableNumber(limitHours) == null) ||
      (limitCycles.trim() !== "" && parseNullableNumber(limitCycles) == null)
    ) {
      setError("飞行小时/循环期限须为数字,或留空表示不限。");
      return;
    }
    const id = onAdd({
      aircraftId,
      ata,
      category,
      title: title.trim(),
      description: description.trim(),
      melRef: melRef.trim() || "—",
      deferredBy: deferredBy.trim(),
      limitDays: days,
      limitHours: parseNullableNumber(limitHours),
      limitCycles: parseNullableNumber(limitCycles),
    });
    setTitle("");
    setDescription("");
    setMelRef("");
    setError("");
    setDone(`已登记 ${id},已飞数据自本机当前累计起算。`);
  };

  const policy = policyOf(category);

  return (
    <div className="deferral-form">
      <div className="field-grid">
        <label>
          <span>飞机</span>
          <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)}>
            {aircraft.map((ac) => (
              <option key={ac.id} value={ac.id}>
                {ac.id} · {ac.model}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>ATA 章节</span>
          <select value={ata} onChange={(e) => setAta(e.target.value)}>
            {ATA_CHAPTERS.map((c) => (
              <option key={c.code} value={c.code}>
                ATA {c.code} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>保留类别</span>
          <select value={category} onChange={(e) => onCategoryChange(e.target.value as MelCategory)}>
            {CATEGORY_POLICIES.map((p) => (
              <option key={p.category} value={p.category}>
                {p.label} · 默认 {p.repairDays} 天
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>申请人</span>
          <input value={deferredBy} onChange={(e) => setDeferredBy(e.target.value)} placeholder="保留申请人" />
        </label>
        <label className="span-2">
          <span>缺陷名称</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如:1号电瓶充电器间歇性脱开" />
        </label>
        <label className="span-2">
          <span>缺陷描述</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="故障现象、运行限制与监控要求" />
        </label>
        <label>
          <span>MEL 依据条目</span>
          <input value={melRef} onChange={(e) => setMelRef(e.target.value)} placeholder="如:MEL 24-31-02" />
        </label>
        <label>
          <span>期限 · 日历天</span>
          <input value={limitDays} onChange={(e) => setLimitDays(e.target.value)} />
        </label>
        <label>
          <span>期限 · 飞行小时(可空)</span>
          <input value={limitHours} onChange={(e) => setLimitHours(e.target.value)} placeholder="留空表示不限" />
        </label>
        <label>
          <span>期限 · 循环(可空)</span>
          <input value={limitCycles} onChange={(e) => setLimitCycles(e.target.value)} placeholder="留空表示不限" />
        </label>
      </div>
      <p className="hint">
        {policy.label}:{policy.rule}。任一期限到限即转停场,不能签发放行。
      </p>
      {error && <p className="form-error">{error}</p>}
      {done && <p className="form-ok">{done}</p>}
      <div className="card-actions">
        <button className="primary-action" onClick={submit}>
          登记保留
        </button>
      </div>
    </div>
  );
}
