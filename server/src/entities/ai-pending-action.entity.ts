import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

/**
 * AI 写操作提案：写工具只生成提案，用户确认后执行。
 * 归属 = companyId + userId，仅提案人可确认/取消。
 */
@Entity('ai_pending_action')
@Index(['companyId', 'status'])
export class AiPendingActionEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '提案人（仅本人可确认）' })
  userId: number;

  @Column({ length: 32, nullable: true })
  username: string;

  @Column({ length: 64, comment: '工具名' })
  toolName: string;

  @Column({ type: 'text', comment: '执行参数 JSON' })
  params: string;

  @Column({ type: 'text', comment: '预览卡片 JSON' })
  preview: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'pending',
    comment: 'pending/confirmed/cancelled/failed',
  })
  status: string;

  @Column({ type: 'datetime', comment: '过期时间' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '确认时间' })
  confirmedAt: Date;

  @Column({ type: 'text', nullable: true, comment: '执行结果 JSON' })
  result: string;

  @CreateDateColumn()
  createdAt: Date;
}
