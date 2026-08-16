import { EntityManager } from 'typeorm';

export function todayYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** 本地日期 YYYY-MM-DD */
export function todayLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 单号生成：前缀 + 日期 + 当日序号（如 PO202606010001）。
 * 依赖唯一索引兜底；并发冲突时由调用方捕获唯一键错误重试。
 */
export async function nextNo(
  manager: EntityManager,
  table: string,
  col: string,
  companyId: number,
  prefix: string,
  date: Date = new Date(),
): Promise<string> {
  const ymd = todayYmd(date);
  const like = `${prefix}${ymd}%`;
  const rows: Array<{ cnt: string | number }> = await manager.query(
    `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE company_id = ? AND \`${col}\` LIKE ?`,
    [companyId, like],
  );
  const seq = Number(rows[0]?.cnt ?? 0) + 1;
  return `${prefix}${ymd}${String(seq).padStart(4, '0')}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
