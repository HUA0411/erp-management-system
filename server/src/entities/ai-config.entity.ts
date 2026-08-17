import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * AI 服务配置：每租户一条（company_id 唯一）。
 * 完整 API Key 只存库，接口层只返回掩码（末 4 位）。
 */
@Entity('ai_config')
export class AiConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true, comment: '租户（每公司一条）' })
  companyId: number;

  @Column({ length: 255, comment: 'DeepSeek API Key' })
  apiKey: string;

  @Column({
    length: 32,
    default: 'custom',
    comment: '提供商标识：deepseek/zhipu/qwen/kimi/doubao/openai/claude/gemini/openrouter/custom',
  })
  provider: string;

  @Column({ length: 255, default: 'https://api.deepseek.com', comment: 'API 基地址（OpenAI 兼容）' })
  baseUrl: string;

  @Column({ length: 64, default: 'deepseek-chat', comment: '模型名' })
  model: string;

  @Column({ type: 'int', nullable: true, comment: '最近修改人' })
  updatedBy: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
