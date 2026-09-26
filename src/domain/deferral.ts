// 判定层:保留故障的期限计算、到限判定与放行决策。
// 全部为纯函数,不依赖界面与存储,可独立维护、独立测试。

export type MelCategory = "A" | "B" | "C" | "D";
export type DeferralStatus = "open" | "closed";
export type RecheckResult = "pass" | "fail";
export type Health = "expired" | "near" | "ok" | "closed";

/** 在册飞机:登记机型、累计飞行小时与循环 */
export interface Aircraft {
  id: string; // 机号
  model: string; // 机型
  hours: number; // 累计飞行小时
  cycles: number; // 累计飞行循环
}

/** 期限快照:日历天必限,飞行小时/循环可不限 */
export interface LimitSnapshot {
  limitDays: number;
  limitHours: number | null;
  limitCycles: number | null;
}

/** 期限沿革:每次设立/延期/重开都留痕,旧期限仍可查 */
export interface LimitRevision extends LimitSnapshot {
  at: string;
  by: string; // 值班工程师
  basis: string; // 期限依据
  kind: "初始" | "延期" | "重开";
}

/** 排故登记:件号、工作者、复检结论 */
export interface Rectification {
  at: string;
  partNumber: string; // 件号
  worker: string; // 工作者
  recheckBy: string; // 复检人
  result: RecheckResult;
  conclusion: string; // 复检结论
}

export type RectificationInput = Omit<Rectification, "at">;

export interface DeferralEvent {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

/** 保留故障单 */
export interface Deferral extends LimitSnapshot {
  id: string;
  aircraftId: string;
  ata: string; // ATA 章节号
  category: MelCategory; // 保留类别
  title: string;
  description: string;
  melRef: string; // MEL 依据条目
  deferredAt: string; // 保留时间 ISO
  deferredBy: string;
  baseHours: number; // 保留时飞行小时基准
  baseCycles: number; // 保留时循环基准
  status: DeferralStatus;
  rectifications: Rectification[];
  limitHistory: LimitRevision[];
  events: DeferralEvent[];
  closedAt: string | null;
}

/** 航前放行记录 */
export interface ReleaseEvent {
  id: string;
  aircraftId: string;
  at: string;
  by: string;
  note: string;
}

export const DAY_MS = 24 * 3600 * 1000;

/** 临近到限阈值:剩余任一项低于阈值即提示关注 */
export const NEAR_LIMITS = { days: 1, hours: 10, cycles: 20 };

/** 已飞数据:自保留之日起已飞的日历天/小时/循环 */
export interface Usage {
  days: number;
  hours: number;
  cycles: number;
}

export interface Remaining {
  days: number;
  hours: number | null;
  cycles: number | null;
}

export function usageOf(d: Deferral, ac: Aircraft, now: number): Usage {
  return {
    days: Math.max(0, (now - Date.parse(d.deferredAt)) / DAY_MS),
    hours: Math.max(0, ac.hours - d.baseHours),
    cycles: Math.max(0, ac.cycles - d.baseCycles),
  };
}

export function remainingOf(d: Deferral, ac: Aircraft, now: number): Remaining {
  const u = usageOf(d, ac, now);
  return {
    days: d.limitDays - u.days,
    hours: d.limitHours == null ? null : d.limitHours - u.hours,
    cycles: d.limitCycles == null ? null : d.limitCycles - u.cycles,
  };
}

/** 任一到限:日历天、飞行小时、循环任一剩余归零即判到限 */
export function isExpired(d: Deferral, ac: Aircraft, now: number): boolean {
  if (d.status === "closed") return false;
  const r = remainingOf(d, ac, now);
  return r.days <= 0 || (r.hours != null && r.hours <= 0) || (r.cycles != null && r.cycles <= 0);
}

export function isNear(d: Deferral, ac: Aircraft, now: number): boolean {
  if (d.status === "closed" || isExpired(d, ac, now)) return false;
  const r = remainingOf(d, ac, now);
  return (
    r.days <= NEAR_LIMITS.days ||
    (r.hours != null && r.hours <= NEAR_LIMITS.hours) ||
    (r.cycles != null && r.cycles <= NEAR_LIMITS.cycles)
  );
}

export function healthOf(d: Deferral, ac: Aircraft, now: number): Health {
  if (d.status === "closed") return "closed";
  if (isExpired(d, ac, now)) return "expired";
  if (isNear(d, ac, now)) return "near";
  return "ok";
}

export const HEALTH_LABEL: Record<Health, string> = {
  expired: "到限停场",
  near: "临近到限",
  ok: "监控中",
  closed: "已关闭",
};

/** 放行决策:任一到限即转停场,不能签发放行 */
export interface ReleaseDecision {
  canRelease: boolean;
  blockers: Deferral[]; // 已到限项
  watchers: Deferral[]; // 临近到限项
  nextExpiry: { deferral: Deferral; remaining: Remaining } | null; // 最早到限的开放项
}

export function releaseDecision(ac: Aircraft, deferrals: Deferral[], now: number): ReleaseDecision {
  const open = deferrals.filter((d) => d.aircraftId === ac.id && d.status === "open");
  const blockers = open.filter((d) => isExpired(d, ac, now));
  const watchers = open.filter((d) => isNear(d, ac, now));
  let nextExpiry: ReleaseDecision["nextExpiry"] = null;
  for (const d of open) {
    if (isExpired(d, ac, now)) continue;
    const remaining = remainingOf(d, ac, now);
    if (!nextExpiry || remaining.days < nextExpiry.remaining.days) {
      nextExpiry = { deferral: d, remaining };
    }
  }
  return { canRelease: blockers.length === 0, blockers, watchers, nextExpiry };
}
