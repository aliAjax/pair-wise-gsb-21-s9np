// 本机保存层 —— 台账在浏览器 localStorage 的读写，与资料层、判定层分开维护。
// 如需切换为 IndexedDB 或后端 API，仅需替换本模块。

import { buildSeedState } from "../data/reference";
import type { LedgerState } from "../domain/deferral";

const STORAGE_KEY = "hxwl07.deferred-ledger.v1";

function isLedgerState(value: unknown): value is LedgerState {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.aircraft) && Array.isArray(candidate.defects);
}

/** 读取本机台账；无存档或存档损坏时写入并返回种子数据 */
export function loadLedger(): LedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isLedgerState(parsed)) {
        return parsed;
      }
    }
  } catch {
    // 存档不可用时回落到种子数据
  }
  const seed = buildSeedState();
  saveLedger(seed);
  return seed;
}

export function saveLedger(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储已满或被禁用时保持内存态，不阻断操作
  }
}

/** 清空本机存档并恢复示例数据 */
export function resetLedger(): LedgerState {
  const seed = buildSeedState();
  saveLedger(seed);
  return seed;
}
