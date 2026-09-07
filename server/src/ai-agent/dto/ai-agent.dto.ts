import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AiChatDto {
  @IsString()
  @IsNotEmpty({ message: '请输入消息内容' })
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
  provider?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  model?: string;
}
