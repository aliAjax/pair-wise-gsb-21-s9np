// 资料层 —— ATA 章节、MEL 保留类别与默认期限、示例机队与台账种子数据。
// 仅存放基础资料，判定规则见 domain/deferral.ts，本机保存见 storage/ledgerStore.ts。

import type {
  Aircraft,
  Category,
  DeferralLimit,
  DeferredDefect,
  LedgerState,
  LimitUnit,
} from "../domain/deferral";

export const ATA_CHAPTERS: Array<{ code: string; name: string }> = [
  { code: "21", name: "空调" },
  { code: "24", name: "电源" },
  { code: "25", name: "设备/装饰" },
  { code: "27", name: "飞行操纵" },
  { code: "28", name: "燃油" },
  { code: "29", name: "液压" },
  { code: "32", name: "起落架" },
  { code: "33", name: "灯光" },
  { code: "34", name: "导航" },
  { code: "49", name: "APU" },
  { code: "72", name: "发动机" },
  { code: "79", name: "发动机滑油" },
];

export const MEL_CATEGORIES: Record<
  Category,
  { label: string; defaultLimit: DeferralLimit; note: string }
> = {
  A: { label: "A 类", defaultLimit: { unit: "DAYS", value: 3 }, note: "按 MEL 逐项规定的期限执行" },
  B: { label: "B 类", defaultLimit: { unit: "DAYS", value: 3 }, note: "3 个日历日内修复" },
  C: { label: "C 类", defaultLimit: { unit: "DAYS", value: 10 }, note: "10 个日历日内修复" },
  D: { label: "D 类", defaultLimit: { unit: "DAYS", value: 120 }, note: "120 个日历日内修复" },
};

export const UNIT_LABEL: Record<LimitUnit, string> = {
  DAYS: "日历天",
  FH: "飞行小时",
  FC: "循环",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  A: "A 类",
  B: "B 类",
  C: "C 类",
  D: "D 类",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 示例数据：日期相对当前生成，覆盖在控、临期、到限停场、已延期、已关闭等状态 */
export function buildSeedState(now: Date = new Date()): LedgerState {
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS).toISOString();

  const aircraft: Aircraft[] = [
    { registration: "B-6415", type: "A320", totalHours: 18240, totalCycles: 9460 },
    { registration: "B-2086", type: "B737", totalHours: 22610, totalCycles: 15230 },
    { registration: "B-651R", type: "ARJ21", totalHours: 5230, totalCycles: 3410 },
  ];

  const defects: DeferredDefect[] = [
    {
      id: "DD-SEED-01",
      aircraftReg: "B-6415",
      ataChapter: "25",
      category: "C",
      title: "后舱乘务员座椅靠背锁扣失效",
      description: "54 排乘务员座椅靠背无法锁定，已按 MEL 25-20 挂签保留。",
      raisedBy: "张明",
      raisedAt: daysAgo(9),
      limit: { unit: "DAYS", value: 10 },
      baseHours: 18240,
      baseCycles: 9460,
      status: "OPEN",
      extensions: [],
      history: [
        {
          at: daysAgo(9),
          actor: "张明",
          action: "登记保留",
          detail: "C 类 · ATA 25 · 期限 10 天",
        },
      ],
    },
    {
      id: "DD-SEED-02",
      aircraftReg: "B-6415",
      ataChapter: "79",
      category: "B",
      title: "2 号发动机滑油压力指示波动",
      description: "巡航阶段指示间歇波动，实测压力正常，按小时控制观察。",
      raisedBy: "刘洋",
      raisedAt: daysAgo(2),
      limit: { unit: "FH", value: 25 },
      baseHours: 18220,
      baseCycles: 9448,
      status: "OPEN",
      extensions: [],
      history: [
        {
          at: daysAgo(2),
          actor: "刘洋",
          action: "登记保留",
          detail: "B 类 · ATA 79 · 期限 25 小时",
        },
      ],
    },
    {
      id: "DD-SEED-03",
      aircraftReg: "B-2086",
      ataChapter: "32",
      category: "C",
      title: "前起落架舱门封严条局部脱落",
      description: "封严条边缘脱落约 15cm，不影响增压，按循环控制。",
      raisedBy: "陈洁",
      raisedAt: daysAgo(12),
      limit: { unit: "FC", value: 50 },
      baseHours: 22560,
      baseCycles: 15200,
      status: "OPEN",
      extensions: [
        {
          previousLimit: { unit: "FC", value: 30 },
          newLimit: { unit: "FC", value: 50 },
          reason: "依据 MEL 32-70-01 修订 3：封严条局部脱落不影响增压与操纵，允许按 50 循环控制",
          engineer: "李卫国（值班工程师）",
          extendedAt: daysAgo(5),
        },
      ],
      history: [
        {
          at: daysAgo(12),
          actor: "陈洁",
          action: "登记保留",
          detail: "C 类 · ATA 32 · 期限 30 循环",
        },
        {
          at: daysAgo(5),
          actor: "李卫国（值班工程师）",
          action: "期限延长",
          detail: "30 循环 → 50 循环 · 依据：MEL 32-70-01 修订 3",
        },
      ],
    },
    {
      id: "DD-SEED-04",
      aircraftReg: "B-2086",
      ataChapter: "24",
      category: "B",
      title: "备用电瓶容量低于放行标准",
      description: "容量测试 78%，低于 80% 标准，待更换电瓶。",
      raisedBy: "陈洁",
      raisedAt: daysAgo(4),
      limit: { unit: "DAYS", value: 3 },
      baseHours: 22610,
      baseCycles: 15230,
      status: "OPEN",
      extensions: [],
      history: [
        {
          at: daysAgo(4),
          actor: "陈洁",
          action: "登记保留",
          detail: "B 类 · ATA 24 · 期限 3 天",
        },
      ],
    },
    {
      id: "DD-SEED-05",
      aircraftReg: "B-651R",
      ataChapter: "27",
      category: "C",
      title: "副翼作动筒连接螺栓力矩复查",
      description: "定检发现左副翼作动筒连接螺栓力矩接近下限，挂保留观察。",
      raisedBy: "孙鹏",
      raisedAt: daysAgo(20),
      limit: { unit: "DAYS", value: 10 },
      baseHours: 5230,
      baseCycles: 3410,
      status: "CLOSED",
      closure: {
        partNumber: "NAS6604-8",
        worker: "王强",
        rectification: "更换连接螺栓并按手册复核力矩，功能测试正常",
        reviewer: "赵敏",
        reviewNote: "复检合格，同意关闭",
        closedAt: daysAgo(12),
      },
      extensions: [],
      history: [
        {
          at: daysAgo(20),
          actor: "孙鹏",
          action: "登记保留",
          detail: "C 类 · ATA 27 · 期限 10 天",
        },
        {
          at: daysAgo(13),
          actor: "王强",
          action: "排故登记",
          detail: "件号 NAS6604-8 · 更换连接螺栓并按手册复核力矩",
        },
        {
          at: daysAgo(12),
          actor: "赵敏",
          action: "复检通过 · 关闭",
          detail: "复检合格，同意关闭",
        },
      ],
    },
  ];

  return { aircraft, defects };
}
