import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from '../tenant/tenant-context';
import { todayLocal } from '../common/utils/no-generator';
import type { DashboardSummary, RecentOrder, TopProduct, TrendPoint } from '@erp/shared';

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async summary(): Promise<DashboardSummary> {
    const companyId = TenantContext.companyId;
    const today = todayLocal();
    const month = today.slice(0, 7);

    const [todaySale, monthSale, todayOrders, pendingInbound, lowStock, productCount, receivable, payable] =
      await Promise.all([
        this.scalar(
          `SELECT COALESCE(SUM(total_amount),0) AS v FROM sale_outbound WHERE company_id=? AND outbound_date=?`,
          [companyId, today],
        ),
        this.scalar(
          `SELECT COALESCE(SUM(total_amount),0) AS v FROM sale_outbound WHERE company_id=? AND outbound_date LIKE ?`,
          [companyId, `${month}%`],
        ),
        this.scalar(
          `SELECT (SELECT COUNT(*) FROM sale_order WHERE company_id=? AND DATE(created_at)=CURDATE())
                 + (SELECT COUNT(*) FROM purchase_order WHERE company_id=? AND DATE(created_at)=CURDATE()) AS v`,
          [companyId, companyId],
        ),
        this.scalar(
          `SELECT COUNT(*) AS v FROM purchase_order WHERE company_id=? AND status='confirmed'`,
          [companyId],
        ),
        this.scalar(
          `SELECT COUNT(*) AS v FROM inventory i JOIN product p ON p.id=i.product_id AND p.company_id=i.company_id
           WHERE i.company_id=? AND i.quantity < p.safety_stock`,
          [companyId],
        ),
        this.scalar(`SELECT COUNT(*) AS v FROM product WHERE company_id=? AND status=1`, [companyId]),
        this.scalar(
          `SELECT COALESCE(SUM(total_amount),0) AS v FROM sale_order WHERE company_id=? AND status IN ('confirmed','outbound')`,
          [companyId],
        ),
        this.scalar(
          `SELECT COALESCE(SUM(total_amount),0) AS v FROM purchase_order WHERE company_id=? AND status IN ('confirmed','warehoused')`,
          [companyId],
        ),
      ]);

    const receive = await this.scalar(
      `SELECT COALESCE(SUM(amount),0) AS v FROM payment WHERE company_id=? AND type='receive'`,
      [companyId],
    );
    const pay = await this.scalar(
      `SELECT COALESCE(SUM(amount),0) AS v FROM payment WHERE company_id=? AND type='pay'`,
      [companyId],
    );

    return {
      todaySaleAmount: todaySale,
      monthSaleAmount: monthSale,
      todayOrderCount: todayOrders,
      pendingInboundCount: pendingInbound,
      lowStockCount: lowStock,
      productCount: productCount,
      receivable: Math.round((receivable - receive) * 100) / 100,
      payable: Math.round((payable - pay) * 100) / 100,
    };
  }

  /** 近 N 天销售趋势（按出库日） */
  async saleTrend(days = 30): Promise<TrendPoint[]> {
    const companyId = TenantContext.companyId;
    const rows = await this.dataSource.query<Array<{ d: string; amount: string; cnt: string }>>(
      `SELECT DATE(outbound_date) AS d, SUM(total_amount) AS amount, COUNT(*) AS cnt
       FROM sale_outbound WHERE company_id=? AND outbound_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(outbound_date) ORDER BY d ASC`,
      [companyId, days - 1],
    );
    const map = new Map(rows.map((r) => [String(r.d).slice(0, 10), r]));
    const result: TrendPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayLocal(d);
      const hit = map.get(key);
      result.push({
        date: key,
        amount: hit ? Number(hit.amount) : 0,
        count: hit ? Number(hit.cnt) : 0,
      });
    }
    return result;
  }

  /** 热销商品 TOP N（按出库数量） */
  async topProducts(limit = 10): Promise<TopProduct[]> {
    const companyId = TenantContext.companyId;
    const rows = await this.dataSource.query<Array<{ productId: string; productName: string; quantity: string; amount: string }>>(
      `SELECT i.product_id AS productId, i.product_name AS productName,
              SUM(i.quantity) AS quantity, SUM(i.amount) AS amount
       FROM sale_outbound_item i
       JOIN sale_outbound o ON o.id = i.outbound_id AND o.company_id = ?
       GROUP BY i.product_id, i.product_name
       ORDER BY quantity DESC LIMIT ?`,
      [companyId, limit],
    );
    return rows.map((r) => ({
      productId: Number(r.productId),
      productName: r.productName,
      quantity: Number(r.quantity),
      amount: Number(r.amount),
    }));
  }

  /** 最近单据（采购+销售合并） */
  async recentOrders(limit = 8): Promise<RecentOrder[]> {
    const companyId = TenantContext.companyId;
    const rows = await this.dataSource.query<
      Array<{ type: 'purchase' | 'sale'; orderNo: string; partnerName: string; amount: string; status: string; date: string }>
    >(
      `(SELECT 'purchase' AS type, order_no AS orderNo, supplier_name AS partnerName,
               total_amount AS amount, status, order_date AS date
        FROM purchase_order WHERE company_id=? )
       UNION ALL
       (SELECT 'sale', order_no, customer_name, total_amount, status, order_date FROM sale_order WHERE company_id=?)
       ORDER BY date DESC LIMIT ?`,
      [companyId, companyId, limit],
    );
    return rows.map((r) => ({
      type: r.type,
      orderNo: r.orderNo,
      partnerName: r.partnerName,
      amount: Number(r.amount),
      status: r.status as RecentOrder['status'],
      date: String(r.date).slice(0, 10),
    }));
  }

  private async scalar(sql: string, params: unknown[]): Promise<number> {
    const rows = await this.dataSource.query<Array<{ v: string | number }>>(sql, params);
    return Number(rows[0]?.v ?? 0);
  }
}
