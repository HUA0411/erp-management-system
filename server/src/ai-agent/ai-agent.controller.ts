import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AgentService } from './agent.service';
import { AiConfigService } from './ai-config.service';
import { PendingActionsService } from './pending-actions.service';
import { AgentReportService } from './agent-report.service';
import { AiChatDto, AiConfigDto } from './dto/ai-agent.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BusinessException } from '../common/exceptions/business.exception';
import type { TenantContextData } from '../tenant/tenant-context';
import type { ToolContext } from './agent-tool';

/** 请求用户 → 工具上下文 */
function toCtx(user: TenantContextData): ToolContext {
  return {
    companyId: user.companyId,
    userId: user.userId,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
  };
}

@ApiTags('AI 助手')
@Controller('ai-agent')
export class AiAgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly configService: AiConfigService,
    private readonly pendingActions: PendingActionsService,
    private readonly reportService: AgentReportService,
  ) {}

  /** 配置状态（configured 为 false 时前端显示配置表单） */
  @Get('status')
  status(@CurrentUser() user: TenantContextData) {
    return this.configService.view(user);
  }

  /** 测试连接（不落库）：验证 Key/地址/模型是否可用 */
  @Post('config/test')
  testConfig(@CurrentUser() user: TenantContextData, @Body() dto: AiConfigDto) {
    return this.configService.test(user, dto);
  }

  /** 保存公司级 AI 配置（需 ai:config 权限或超管） */
  @Put('config')
  saveConfig(@CurrentUser() user: TenantContextData, @Body() dto: AiConfigDto) {
    return this.configService.save(user, dto);
  }

  /**
   * 对话（SSE 流式）：读自动执行、写生成提案、模糊先追问。
   * 事件：{type:'text',text} 文本增量 | {type:'card',card} 交互卡片 | {type:'done',data} 完成 | {type:'error',data} 错误
   */
  @Post('chat')
  @HttpCode(200)
  async chat(
    @Res() res: Response,
    @CurrentUser() user: TenantContextData,
    @Body() dto: AiChatDto,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx 等反代关闭缓冲，保证实时
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const write = (payload: unknown): void => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await this.agentService.chat(user, dto, (event) => write(event));
      write({ type: 'done', data: result });
    } catch (err) {
      write({ type: 'error', data: this.errorBody(err) });
    } finally {
      res.end();
    }
  }

  /** 我的待确认提案 */
  @Get('pending')
  pending(@CurrentUser() user: TenantContextData) {
    return this.pendingActions.listMine(toCtx(user));
  }

  /** 确认提案（仅提案人，走真实 service 执行） */
  @Post('pending/:id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantContextData) {
    return this.pendingActions.confirm(id, user);
  }

  /** 取消提案（零副作用） */
  @Post('pending/:id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantContextData) {
    return this.pendingActions.cancel(id, user);
  }

  /** 最近会话（操作时间线） */
  @Get('conversations')
  conversations(@CurrentUser() user: TenantContextData) {
    return this.agentService.conversations(user);
  }

  /** 某会话的完整消息历史（仅本人） */
  @Get('conversations/:id/messages')
  conversationMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: TenantContextData,
  ) {
    return this.agentService.conversationMessages(id, user);
  }

  /** 最新缺货汇报 */
  @Get('report/low-stock/latest')
  latestReport(@CurrentUser() user: TenantContextData) {
    return this.reportService.latestForCompany(user.companyId);
  }

  /** 手动刷新缺货汇报（重新扫描当前库存） */
  @Post('report/low-stock/refresh')
  refreshReport(@CurrentUser() user: TenantContextData) {
    return this.reportService.refreshForCompany(user.companyId);
  }

  private errorBody(err: unknown): { code: number; message: string } {
    if (err instanceof BusinessException) {
      const res = err.getResponse() as { code?: number; message?: string };
      return { code: typeof res.code === 'number' ? res.code : 40001, message: err.message };
    }
    return { code: 50000, message: '服务器内部错误' };
  }
}
