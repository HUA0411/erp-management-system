import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiReportEntity } from '../entities/ai-report.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { InventoryService } from '../inventory/inventory.service';
import { TenantContext } from '../tenant/tenant-context';
import type { AiReport } from '@erp/shared';
import { formatDateTime } from '../common/utils/no-generator';

/** 缺货汇报：定时扫描 + 手动触发；确定性生成（不调用 LLM，零成本可靠） */
@Injectable()
export class AgentReportService {
  private readonly logger = new Logger(AgentReportService.name);

  constructor(
    @InjectRepository(AiReportEntity) private readonly reportRepo: Repository<AiReportEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    private readonly inventoryService: InventoryService,
  ) {}

  /** 每日 08:30 为所有启用租户生成缺货汇报（如需改时间，修改下方 cron 表达式） */
  @Cron('0 30 8 * * *', { name: 'ai-low-stock-report' })
  async handleCron(): Promise<void> {
    const tenants = await this.tenantRepo.find({ where: { status: 1 } });
    for (const tenant of tenants) {
      try {
        await TenantContext.run({ companyId: tenant.id }, async () => {
          await this.insertReportIfAny(tenant.id);
        });
      } catch (err) {
        this.logger.error(`租户 ${tenant.id} 缺货汇报生成失败: ${(err as Error).message}`);
      }
    }
    this.logger.log(`缺货汇报定时任务完成（${tenants.length} 个租户）`);
  }

  /** 手动触发当前租户汇报（前端"刷新汇报"用） */
  async refreshForCompany(companyId: number): Promise<AiReport | null> {
    await TenantContext.run({ companyId }, async () => {
      await this.insertReportIfAny(companyId);
    });
    return this.latestForCompany(companyId);
  }

  async latestForCompany(companyId: number): Promise<AiReport | null> {
    const row = await this.reportRepo.findOne({
      where: { companyId, type: 'LOW_STOCK' },
      order: { id: 'DESC' },
    });
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      content: JSON.parse(row.content) as Array<{ label: string; value: string }>,
      createdAt: formatDateTime(row.createdAt),
    };
  }

  private async insertReportIfAny(companyId: number): Promise<void> {
    const list = await this.inventoryService.alerts();
    if (!list.length) return; // 无缺货不生成
    const today = new Date().toLocaleDateString('zh-CN');
    await this.reportRepo.insert({
      companyId,
      type: 'LOW_STOCK',
      title: `缺货汇报（${today}）`,
      content: JSON.stringify(
        list.slice(0, 100).map((i) => ({
          label: `${i.productName}（${i.productCode}）`,
          value: `库存 ${i.quantity} / 安全线 ${i.safetyStock}`,
        })),
      ),
    });
  }
}
