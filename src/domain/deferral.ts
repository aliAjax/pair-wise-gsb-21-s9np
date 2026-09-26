// 判定层 —— 保留故障的期限计算、到限判定、放行结论与状态流转。
// 全部为纯函数，不依赖界面与本机保存，可独立维护与测试。

export type LimitUnit = "DAYS" | "FH" | "FC";
export type Category = "A" | "B" | "C" | "D";
export type DefectStatus = "OPEN" | "PENDING_REVIEW" | "CLOSED";
export type FleetStatus = "AIRWORTHY" | "GROUNDED";

/** 临期告警阈值：剩余量不超过该值即提示 */
export const NEAR_LIMIT: Record<LimitUnit, number> = {
  DAYS: 1,
  FH: 5,
  FC: 3,
};

export const UNIT_SHORT: Record<LimitUnit, string> = {
  DAYS: "天",
  FH: "小时",
  FC: "循环",
};

export interface Aircraft {
  registration: string; // 注册号
  type: string; // 机型
  totalHours: number; // 累计飞行小时
  totalCycles: number; // 累计循环
}

export interface DeferralLimit {
  unit: LimitUnit;
  value: number;
}

export interface LimitExtension {
  previousLimit: DeferralLimit; // 旧期限，保留可查
  newLimit: DeferralLimit;
  reason: string; // 延期依据
  engineer: string; // 值班工程师
  extendedAt: string;
}

export interface PendingFix {
  partNumber: string; // 件号
  worker: string; // 工作者
  rectification: string; // 排故措施
  submittedAt: string;
}

export interface ClosureRecord {
  partNumber: string;
  worker: string;
  rectification: string;
  reviewer: string; // 复检人
  reviewNote: string; // 复检结论
  closedAt: string;
}

export interface LedgerEvent {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface DeferredDefect {
  id: string;
  aircraftReg: string;
  ataChapter: string;
  category: Category;
  title: string;
  description: string;
  raisedBy: string;
  raisedAt: string;
  limit: DeferralLimit; // 当前有效期限
  baseHours: number; // 登记时飞机累计小时
  baseCycles: number; // 登记时飞机累计循环
  status: DefectStatus;
  pendingFix?: PendingFix;
  closure?: ClosureRecord;
  extensions: LimitExtension[];
  history: LedgerEvent[];
}

export interface LedgerState {
  aircraft: Aircraft[];
  defects: DeferredDefect[];
}

export interface LimitState {
  unit: LimitUnit;
  limit: number;
  used: number; // 已消耗（已飞数据 / 已过天数）
  remaining: number;
  expired: boolean;
}

export interface AircraftEvaluation {
  status: FleetStatus;
  blocking: Array<{ defect: DeferredDefect; state: LimitState }>;
  nearLimit: Array<{ defect: DeferredDefect; state: LimitState }>;
}

export interface ReleaseVerdict {
  allowed: boolean;
  evaluation: AircraftEvaluation;
  reasons: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
let idSeq = 0;

function makeId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function requireText(value: string, message: string): void {
  if (!value.trim()) {
    throw new Error(message);
  }
}

export function daysBetween(fromIso: string, to: Date): number {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) {
    return 0;
  }
  return Math.floor((to.getTime() - from) / DAY_MS);
}

function formatLimit(limit: DeferralLimit): string {
  return `${limit.value} ${UNIT_SHORT[limit.unit]}`;
}

/** 计算保留项的期限消耗：日历天按登记日期，小时/循环按登记时累计值与当前累计值之差 */
export function computeLimitState(
  defect: DeferredDefect,
  aircraft: Aircraft,
  now: Date,
): LimitState {
  let used: number;
  switch (defect.limit.unit) {
    case "DAYS":
      used = daysBetween(defect.raisedAt, now);
      break;
    case "FH":
      used = round1(aircraft.totalHours - defect.baseHours);
      break;
    case "FC":
      used = aircraft.totalCycles - defect.baseCycles;
      break;
  }
  used = Math.max(0, used);
  const remaining = round1(defect.limit.value - used);
  return {
    unit: defect.limit.unit,
    limit: defect.limit.value,
    used,
    remaining,
    expired: remaining <= 0,
  };
}

/** 单机评估：任一到限即转停场；未关闭的保留项均参与判定 */
export function evaluateAircraft(
  aircraft: Aircraft,
  defects: DeferredDefect[],
  now: Date,
): AircraftEvaluation {
  const blocking: AircraftEvaluation["blocking"] = [];
  const nearLimit: AircraftEvaluation["nearLimit"] = [];
  for (const defect of defects) {
    if (defect.aircraftReg !== aircraft.registration || defect.status === "CLOSED") {
      continue;
    }
    const state = computeLimitState(defect, aircraft, now);
    if (state.expired) {
      blocking.push({ defect, state });
    } else if (state.remaining <= NEAR_LIMIT[defect.limit.unit]) {
      nearLimit.push({ defect, state });
    }
  }
  return {
    status: blocking.length > 0 ? "GROUNDED" : "AIRWORTHY",
    blocking,
    nearLimit,
  };
}

/** 放行结论：存在到限保留项则不得签放行 */
export function releaseVerdict(
  aircraft: Aircraft,
  defects: DeferredDefect[],
  now: Date,
): ReleaseVerdict {
  const evaluation = evaluateAircraft(aircraft, defects, now);
  const reasons = evaluation.blocking.map(
    ({ defect, state }) =>
      `ATA ${defect.ataChapter}「${defect.title}」已到限（超出 ${Math.abs(state.remaining)} ${UNIT_SHORT[state.unit]}），未关闭不得放行`,
  );
  return { allowed: evaluation.status === "AIRWORTHY", evaluation, reasons };
}

export interface RegisterInput {
  aircraft: Aircraft;
  ataChapter: string;
  category: Category;
  title: string;
  description: string;
  raisedBy: string;
  limit: DeferralLimit;
}

/** 登记保留故障：记录登记时的小时/循环作为已飞数据基准 */
export function registerDefect(input: RegisterInput, now?: Date): DeferredDefect {
  requireText(input.title, "请填写缺陷标题");
  requireText(input.raisedBy, "请填写登记人");
  if (!Number.isFinite(input.limit.value) || input.limit.value <= 0) {
    throw new Error("期限值须为正数");
  }
  const at = nowIso(now);
  return {
    id: makeId("DD"),
    aircraftReg: input.aircraft.registration,
    ataChapter: input.ataChapter,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    raisedBy: input.raisedBy.trim(),
    raisedAt: at,
    limit: { ...input.limit },
    baseHours: input.aircraft.totalHours,
    baseCycles: input.aircraft.totalCycles,
    status: "OPEN",
    extensions: [],
    history: [
      {
        at,
        actor: input.raisedBy.trim(),
        action: "登记保留",
        detail: `${input.category} 类 · ATA ${input.ataChapter} · 期限 ${formatLimit(input.limit)}`,
      },
    ],
  };
}

/** 登记飞行数据：累计小时/循环增加后，按小时/循环控制的保留项已飞数据同步更新 */
export function recordFlight(aircraft: Aircraft, hours: number, cycles: number): Aircraft {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("飞行小时须为正数");
  }
  if (!Number.isInteger(cycles) || cycles <= 0) {
    throw new Error("循环须为正整数");
  }
  return {
    ...aircraft,
    totalHours: round1(aircraft.totalHours + hours),
    totalCycles: aircraft.totalCycles + cycles,
  };
}

export interface RectifyInput {
  partNumber: string;
  worker: string;
  rectification: string;
}

/** 登记排故：件号、工作者、措施齐全后转待复检 */
export function submitRectification(
  defect: DeferredDefect,
  input: RectifyInput,
  now?: Date,
): DeferredDefect {
  if (defect.status !== "OPEN") {
    throw new Error("仅在控状态的保留项可登记排故");
  }
  requireText(input.partNumber, "请填写件号");
  requireText(input.worker, "请填写工作者");
  requireText(input.rectification, "请填写排故措施");
  const at = nowIso(now);
  return {
    ...defect,
    status: "PENDING_REVIEW",
    pendingFix: {
      partNumber: input.partNumber.trim(),
      worker: input.worker.trim(),
      rectification: input.rectification.trim(),
      submittedAt: at,
    },
    history: [
      ...defect.history,
      {
        at,
        actor: input.worker.trim(),
        action: "排故登记",
        detail: `件号 ${input.partNumber.trim()} · ${input.rectification.trim()}`,
      },
    ],
  };
}

export interface ReviewInput {
  pass: boolean;
  reviewer: string;
  note: string;
}

/** 复检结论：通过方可关闭；不通过退回在控，重新排故 */
export function reviewRectification(
  defect: DeferredDefect,
  input: ReviewInput,
  now?: Date,
): DeferredDefect {
  if (defect.status !== "PENDING_REVIEW" || !defect.pendingFix) {
    throw new Error("该保留项不在待复检状态");
  }
  requireText(input.reviewer, "请填写复检人");
  const at = nowIso(now);
  const fix = defect.pendingFix;
  if (input.pass) {
    return {
      ...defect,
      status: "CLOSED",
      pendingFix: undefined,
      closure: {
        partNumber: fix.partNumber,
        worker: fix.worker,
        rectification: fix.rectification,
        reviewer: input.reviewer.trim(),
        reviewNote: input.note.trim() || "复检合格",
        closedAt: at,
      },
      history: [
        ...defect.history,
        {
          at,
          actor: input.reviewer.trim(),
          action: "复检通过 · 关闭",
          detail: input.note.trim() || "复检合格，同意关闭",
        },
      ],
    };
  }
  return {
    ...defect,
    status: "OPEN",
    pendingFix: undefined,
    history: [
      ...defect.history,
      {
        at,
        actor: input.reviewer.trim(),
        action: "复检不通过 · 退回排故",
        detail: input.note.trim() || "复检不合格，需重新排故",
      },
    ],
  };
}

export interface ExtendInput {
  unit: LimitUnit;
  value: number;
  reason: string;
  engineer: string;
}

/** 延长期限：值班工程师写明依据，旧期限进入延期记录保留可查 */
export function extendLimit(
  defect: DeferredDefect,
  input: ExtendInput,
  now?: Date,
): DeferredDefect {
  if (defect.status === "CLOSED") {
    throw new Error("已关闭的保留项不能延期，如需继续控制请重新打开");
  }
  requireText(input.reason, "请填写延期依据");
  requireText(input.engineer, "请填写值班工程师");
  if (!Number.isFinite(input.value) || input.value <= 0) {
    throw new Error("新期限值须为正数");
  }
  const at = nowIso(now);
  const newLimit: DeferralLimit = { unit: input.unit, value: input.value };
  return {
    ...defect,
    limit: newLimit,
    extensions: [
      ...defect.extensions,
      {
        previousLimit: { ...defect.limit },
        newLimit,
        reason: input.reason.trim(),
        engineer: input.engineer.trim(),
        extendedAt: at,
      },
    ],
    history: [
      ...defect.history,
      {
        at,
        actor: input.engineer.trim(),
        action: "期限延长",
        detail: `${formatLimit(defect.limit)} → ${formatLimit(newLimit)} · 依据：${input.reason.trim()}`,
      },
    ],
  };
}

export interface ReopenInput {
  reason: string;
  actor: string;
}

/** 重新打开：已关闭项可重开继续办理，原关闭结论作废并留痕 */
export function reopenDefect(
  defect: DeferredDefect,
  input: ReopenInput,
  now?: Date,
): DeferredDefect {
  if (defect.status !== "CLOSED") {
    throw new Error("仅已关闭的保留项可重新打开");
  }
  requireText(input.reason, "请填写重开原因");
  requireText(input.actor, "请填写经办人");
  const at = nowIso(now);
  const previous = defect.closure
    ? `原关闭结论作废（件号 ${defect.closure.partNumber} · 复检人 ${defect.closure.reviewer}）`
    : "原关闭结论作废";
  return {
    ...defect,
    status: "OPEN",
    closure: undefined,
    history: [
      ...defect.history,
      {
        at,
        actor: input.actor.trim(),
        action: "重新打开",
        detail: `${input.reason.trim()} · ${previous}`,
      },
    ],
  };
}
