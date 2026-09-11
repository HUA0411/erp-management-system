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

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 本地时间格式化为 YYYY-MM-DD HH:mm:ss。
 * 不要用 toISOString()（那是 UTC，在 +08:00 会偏移 8 小时，纯日期列甚至会差一天）。
 */
export function formatDateTime(d: Date | string | number): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** 本地日期格式化为 YYYY-MM-DD（避免 toISOString 的 UTC 偏移） */
export function formatDate(d: Date | string | number): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 单号生成：前缀 + 日期 + 当日序号（如 PO202606010001）。
 *
 * 序号来自 seq_counter 计数表，用原子自增分配。
 *
 * 为什么不能用 `SELECT COUNT(*)+1`：并发下所有请求读到同一个 count、算出同一个单号，
 * 唯一索引挡下大部分，剩下的重试 —— 但重试也是同步的（大家一起重读、一起算出
 * 下一个号、再一起撞）。实测 8 个并发建单：3 个成功、5 个直接 500。
 *
 * 现在三步都在调用方的事务内：
 *   1. `INSERT ... ON DUPLICATE KEY UPDATE n = n + 1` 原子自增。
 *      该语句持有该行的排他锁直到事务提交，并发请求在这里串行排队，不会拿到同一个号。
 *   2. `SELECT ... FOR UPDATE` 读回。
 *      必须带 FOR UPDATE：普通 SELECT 在 REPEATABLE READ 下走一致性快照，
 *      可能读到别的并发事务提交之前的旧值 —— 那就等于又回到重复单号了。
 *      加锁读永远取最新已提交版本，且这把锁本来就在我们手里。
 *   3. 拼接单号。
 *
 * 事务回滚会浪费掉一个序号（出现跳号），这是序列的正常行为，也远好过重号。
 * 唯一索引 (company_id, 单号列) 保留作为最后一道兜底。
 *
 * 注意 table/col 只用来拼计数器名字（作为参数传入，不进 SQL 文本），
 * 所以这里没有任何动态标识符，不存在注入面。
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
  const counter = `${table}.${col}`;

  await manager.query(
    `INSERT INTO \`seq_counter\` (company_id, name, day, n)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE n = n + 1`,
    [companyId, counter, ymd],
  );

  const rows: Array<{ n: string | number }> = await manager.query(
    'SELECT n FROM `seq_counter` WHERE company_id = ? AND name = ? AND day = ? FOR UPDATE',
    [companyId, counter, ymd],
  );

  const seq = Number(rows[0]?.n ?? 1);
  return `${prefix}${ymd}${String(seq).padStart(4, '0')}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 等待若干毫秒（事务重试退避用） */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
