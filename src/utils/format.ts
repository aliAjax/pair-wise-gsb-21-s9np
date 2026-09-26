const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(iso: string): string {
  const t = new Date(iso);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function fmtDateTime(iso: string): string {
  const t = new Date(iso);
  return `${fmtDate(iso)} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export const fmtHours = (n: number) => n.toFixed(1);
export const fmtDays = (n: number) => n.toFixed(1);

/** 可空数字输入:空串视为"不限",非法输入返回 null */
export function parseNullableNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
