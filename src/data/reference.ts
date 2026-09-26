// 资料层:MEL 保留类别期限与 ATA 章节等基础资料,单独维护,判定层只读引用。

import type { MelCategory } from "../domain/deferral";

export interface CategoryPolicy {
  category: MelCategory;
  label: string;
  repairDays: number; // 默认修复期限(日历天)
  rule: string;
}

/** MEL 修复期限类别资料 */
export const CATEGORY_POLICIES: CategoryPolicy[] = [
  { category: "A", label: "A 类", repairDays: 1, rule: "按 MEL 条款规定的期限修复,通常不超过 1 个日历天" },
  { category: "B", label: "B 类", repairDays: 3, rule: "自保留之日起 3 个连续日历天内修复" },
  { category: "C", label: "C 类", repairDays: 10, rule: "自保留之日起 10 个连续日历天内修复" },
  { category: "D", label: "D 类", repairDays: 120, rule: "自保留之日起 120 个连续日历天内修复" },
];

export function policyOf(category: MelCategory): CategoryPolicy {
  return CATEGORY_POLICIES.find((p) => p.category === category) ?? CATEGORY_POLICIES[2];
}

/** ATA 章节资料 */
export const ATA_CHAPTERS = [
  { code: "21", name: "空调" },
  { code: "22", name: "自动飞行" },
  { code: "23", name: "通信" },
  { code: "24", name: "电源" },
  { code: "25", name: "设备/装饰" },
  { code: "26", name: "防火" },
  { code: "27", name: "飞行操纵" },
  { code: "28", name: "燃油" },
  { code: "29", name: "液压" },
  { code: "30", name: "防冰防雨" },
  { code: "31", name: "指示/记录" },
  { code: "32", name: "起落架" },
  { code: "34", name: "导航" },
  { code: "35", name: "氧气" },
  { code: "36", name: "气源" },
  { code: "49", name: "APU" },
  { code: "71", name: "动力装置" },
  { code: "77", name: "发动机指示" },
];

export function ataName(code: string): string {
  return ATA_CHAPTERS.find((c) => c.code === code)?.name ?? "";
}
