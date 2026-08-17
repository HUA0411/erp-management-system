import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

/** AI 对话消息（user/assistant 文本 + 交互卡片 JSON） */
@Entity('ai_message')
@Index(['conversationId'])
export class AiMessageEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属会话' })
  conversationId: number;

  @Column({ type: 'varchar', length: 16, comment: 'user | assistant' })
  role: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'text', nullable: true, comment: '交互卡片 JSON 数组' })
  cards: string;

  @CreateDateColumn()
  createdAt: Date;
}
