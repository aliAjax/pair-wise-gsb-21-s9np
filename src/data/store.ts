// 本机保存层:机队登记、保留故障台账与放行记录的本地持久化(localStorage)。
// 与资料层(reference.ts)、判定层(domain/deferral.ts)分开维护。

import { useEffect, useState } from "react";
import { DAY_MS } from "../domain/deferral";
import type { Aircraft, Deferral, ReleaseEvent } from "../domain/deferral";

export interface MaintenanceStore {
  aircraft: Aircraft[];
  deferrals: Deferral[];
  releases: ReleaseEvent[];
  seq: number; // 单据编号序列
}

const STORAGE_KEY = "hxwl07-deferral-ledger-v1";

/** 示例数据:日期相对当前时间播种,保证演示时剩余期限合理 */
export function seedStore(): MaintenanceStore {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const aircraft: Aircraft[] = [
    { id: "B-301A", model: "A320neo", hours: 12840.5, cycles: 7632 },
    { id: "B-702C", model: "B737-800", hours: 20315.0, cycles: 11890 },
    { id: "B-651R", model: "ARJ21-700", hours: 5420.0, cycles: 4810 },
  ];

  const deferrals: Deferral[] = [
    {
      id: "D-0001",
      aircraftId: "B-301A",
      ata: "24",
      category: "C",
      title: "1号电瓶充电器间歇性脱开",
      description: "航后检查发现 1 号电瓶充电器间歇脱开,按 MEL 保留,每航段检查电瓶电压。",
      melRef: "MEL 24-31-02",
      deferredAt: iso(now - 6 * DAY_MS),
      deferredBy: "张工",
      baseHours: 12820.0,
      baseCycles: 7602,
      limitDays: 10,
      limitHours: 80,
      limitCycles: null,
      status: "open",
      rectifications: [],
      limitHistory: [
        { at: iso(now - 6 * DAY_MS), by: "张工", basis: "初始登记 · MEL 24-31-02", kind: "初始", limitDays: 10, limitHours: 80, limitCycles: null },
      ],
      events: [
        { at: iso(now - 6 * DAY_MS), actor: "张工", action: "保留登记", detail: "ATA 24 · C 类 · 1号电瓶充电器间歇性脱开" },
      ],
      closedAt: null,
    },
    {
      id: "D-0002",
      aircraftId: "B-301A",
      ata: "32",
      category: "B",
      title: "右主起落架主轮磨耗接近限制",
      description: "主轮磨耗接近更换标准,航材已调拨,按 B 类保留并限制飞行小时与循环。",
      melRef: "MEL 32-45-01",
      deferredAt: iso(now - 1 * DAY_MS),
      deferredBy: "刘工",
      baseHours: 12833.0,
      baseCycles: 7620,
      limitDays: 3,
      limitHours: 15,
      limitCycles: 40,
      status: "open",
      rectifications: [],
      limitHistory: [
        { at: iso(now - 1 * DAY_MS), by: "刘工", basis: "初始登记 · MEL 32-45-01", kind: "初始", limitDays: 3, limitHours: 15, limitCycles: 40 },
      ],
      events: [
        { at: iso(now - 1 * DAY_MS), actor: "刘工", action: "保留登记", detail: "ATA 32 · B 类 · 右主起落架主轮磨耗接近限制" },
      ],
      closedAt: null,
    },
    {
      id: "D-0003",
      aircraftId: "B-702C",
      ata: "27",
      category: "A",
      title: "副翼作动器测试异常",
      description: "副翼作动测试响应延迟,按 A 类保留,期限 1 个日历天。",
      melRef: "MEL 27-11-04",
      deferredAt: iso(now - 1.5 * DAY_MS),
      deferredBy: "陈工",
      baseHours: 20309.0,
      baseCycles: 11882,
      limitDays: 1,
      limitHours: 6,
      limitCycles: null,
      status: "open",
      rectifications: [],
      limitHistory: [
        { at: iso(now - 1.5 * DAY_MS), by: "陈工", basis: "初始登记 · MEL 27-11-04", kind: "初始", limitDays: 1, limitHours: 6, limitCycles: null },
      ],
      events: [
        { at: iso(now - 1.5 * DAY_MS), actor: "陈工", action: "保留登记", detail: "ATA 27 · A 类 · 副翼作动器测试异常" },
      ],
      closedAt: null,
    },
    {
      id: "D-0004",
      aircraftId: "B-651R",
      ata: "21",
      category: "C",
      title: "右空调组件流量偏低",
      description: "右组件出口流量低于正常值,单组件可维持运行,按 C 类保留。",
      melRef: "MEL 21-52-03",
      deferredAt: iso(now - 3 * DAY_MS),
      deferredBy: "陈工",
      baseHours: 5411.0,
      baseCycles: 4802,
      limitDays: 12,
      limitHours: 50,
      limitCycles: null,
      status: "open",
      rectifications: [],
      limitHistory: [
        { at: iso(now - 3 * DAY_MS), by: "陈工", basis: "初始登记 · MEL 21-52-03", kind: "初始", limitDays: 10, limitHours: 50, limitCycles: null },
        { at: iso(now - 1 * DAY_MS), by: "值班工程师 王工", basis: "航材组件在途(PO HX-2026-118),按 MEL 21-52-03 延期条款延长 2 天", kind: "延期", limitDays: 12, limitHours: 50, limitCycles: null },
      ],
      events: [
        { at: iso(now - 3 * DAY_MS), actor: "陈工", action: "保留登记", detail: "ATA 21 · C 类 · 右空调组件流量偏低" },
        { at: iso(now - 1 * DAY_MS), actor: "值班工程师 王工", action: "延长期限", detail: "日历天期限 10 → 12 天 · 依据:航材组件在途(PO HX-2026-118)" },
      ],
      closedAt: null,
    },
    {
      id: "D-0005",
      aircraftId: "B-301A",
      ata: "30",
      category: "C",
      title: "机翼防冰活门卡阻",
      description: "左机翼防冰活门地面测试卡阻,按 C 类保留,限非结冰条件运行。",
      melRef: "MEL 30-11-01",
      deferredAt: iso(now - 9 * DAY_MS),
      deferredBy: "张工",
      baseHours: 12795.0,
      baseCycles: 7580,
      limitDays: 10,
      limitHours: null,
      limitCycles: null,
      status: "closed",
      rectifications: [
        {
          at: iso(now - 2 * DAY_MS),
          partNumber: "AV30-2210 防冰活门",
          worker: "李强",
          recheckBy: "赵检",
          result: "pass",
          conclusion: "活门更换后地面功能测试正常,渗漏检查合格。",
        },
      ],
      limitHistory: [
        { at: iso(now - 9 * DAY_MS), by: "张工", basis: "初始登记 · MEL 30-11-01", kind: "初始", limitDays: 10, limitHours: null, limitCycles: null },
      ],
      events: [
        { at: iso(now - 9 * DAY_MS), actor: "张工", action: "保留登记", detail: "ATA 30 · C 类 · 机翼防冰活门卡阻" },
        { at: iso(now - 2 * DAY_MS), actor: "李强", action: "排故关闭", detail: "件号 AV30-2210 防冰活门 · 复检通过 · 活门更换后地面功能测试正常,渗漏检查合格。" },
      ],
      closedAt: iso(now - 2 * DAY_MS),
    },
  ];

  const releases: ReleaseEvent[] = [
    { id: "R-0006", aircraftId: "B-301A", at: iso(now - 0.8 * DAY_MS), by: "周敏", note: "航前放行" },
  ];

  return { aircraft, deferrals, releases, seq: 7 };
}

function load(): MaintenanceStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MaintenanceStore;
      if (Array.isArray(parsed.aircraft) && Array.isArray(parsed.deferrals)) return parsed;
    }
  } catch {
    // 数据损坏时重新播种
  }
  return seedStore();
}

export function useMaintenanceStore() {
  const [store, setStore] = useState<MaintenanceStore>(() => load());
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // 存储不可用时仅保留在内存
    }
  }, [store]);
  return [store, setStore] as const;
}
