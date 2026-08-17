import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

/** AI 主动汇报（如缺货汇报），定时任务生成，前端按最新读取 */
@Entity('ai_report')
@Index(['companyId', 'type'])
export class AiReportEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32, comment: '汇报类型，如 LOW_STOCK' })
  type: string;

  @Column({ length: 128 })
  title: string;

  @Column({ type: 'text', comment: '汇报内容 JSON（AiPreviewRow[]）' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
