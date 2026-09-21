import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiChatDto {
  /**
   * 限长：ai_message.content 是 TEXT（65535 字节 ≈ 2.1 万汉字）。
   * 不限长的话，整轮 LLM 调用（真花钱）跑完之后写库才报 1406，
   * 回复全丢、用户只看到 500。宁可发之前就拒掉。
   */
  @IsString()
  @IsNotEmpty({ message: '请输入消息内容' })
  @MaxLength(8000, { message: '消息过长，请分段发送' })
  message: string;

  @IsOptional()
  @IsInt()
  conversationId?: number;

  /** 思考强度（DeepSeek v4 思考模式）：none=关闭思考 / low / high / max，默认 high */
  @IsOptional()
  @IsString()
  @IsIn(['none', 'low', 'high', 'max'], { message: '思考强度不合法' })
  reasoningEffort?: string;
}

export class AiConfigDto {
  /** 为空且已有配置时保留原 Key（仅用于更新 baseUrl/model 时） */
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255) // ai_config.base_url 是 varchar(255)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64) // ai_config.model 是 varchar(64)
  model?: string;
}
