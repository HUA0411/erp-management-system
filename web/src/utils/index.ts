/** 金额格式化 */
export function fmtMoney(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 数量格式化（最多 2 位小数，去尾零） */
export function fmtQty(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** 日期 YYYY-MM-DD */
export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 订单状态文案与标签类型 */
export const ORDER_STATUS: Record<string, { text: string; type: 'info' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  draft: { text: '草稿', type: 'info' },
  confirmed: { text: '已确认', type: 'primary' },
  warehoused: { text: '已入库', type: 'success' },
  outbound: { text: '已出库', type: 'success' },
  cancelled: { text: '已取消', type: 'danger' },
};

export const INVENTORY_TYPE: Record<string, { text: string; type: 'success' | 'danger' | 'warning' | 'info' }> = {
  init: { text: '期初', type: 'info' },
  in: { text: '入库', type: 'success' },
  out: { text: '出库', type: 'danger' },
  adjust: { text: '调整', type: 'warning' },
  stocktake: { text: '盘点', type: 'warning' },
};

export const PAYMENT_TYPE: Record<string, { text: string; type: 'success' | 'danger' }> = {
  receive: { text: '收款', type: 'success' },
  pay: { text: '付款', type: 'danger' },
};
