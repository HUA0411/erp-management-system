import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

/** AI 对话会话（按用户+租户） */
@Entity('ai_conversation')
export class AiConversationEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '发起用户' })
  userId: number;

  @Column({ length: 64, nullable: true, comment: '会话标题（首条消息截断）' })
  title: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
