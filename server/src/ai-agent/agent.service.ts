import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConversationEntity } from '../entities/ai-conversation.entity';
import { AiMessageEntity } from '../entities/ai-message.entity';
import { PermissionService } from '../permission/permission.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { AiConfigService } from './ai-config.service';
import { PendingActionsService } from './pending-actions.service';
import { ToolRegistryService } from './tool-registry.service';
import { AGENT_LLM_CLIENT } from './agent-llm-client.token';
import type { AgentLlmClient, LlmMessage } from './deepseek-llm.client';
import type { TenantContextData } from '../tenant/tenant-context';
import type { ToolContext } from './agent-tool';
import type { AiCard, AiChatResult, AiConversationBrief } from '@erp/shared';
import { formatDateTime } from '../common/utils/no-generator';

const MAX_ITERATIONS = 8;
const MAX_HISTORY = 20;

/** 流式事件：文本增量 / 交互卡片（前端实时渲染） */
export type AgentStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'card'; card: AiCard };

/**
 * 对话循环（DSH 式 agent 循环的 ERP 版）：
 * 推理 → 选工具 → 执行（读自动 / 写只出提案 / 澄清暂停）→ 观察 → 再推理。
 * 业务数据只进 tool 消息当数据，绝不进入 system prompt。
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  private readonly systemPrompt = `你是本企业 ERP 管理系统的 AI 助手，通过调用工具操作系统。

规则：
1. 用简体中文回答，语言简洁专业，不使用表情符号。
2. 查询类问题：优先调用只读工具获取实时数据，回答时注明数据来源（如"根据库存实时数据"）。
3. 写操作（新增/修改/删除商品、客户、供应商，创建/确认/取消/删除/出库/入库订单，库存调整，新建/确认盘点，登记/删除收付款）必须通过调用对应的写工具来生成操作提案。生成提案后明确告知用户需要点击"确定"按钮才会真正执行。
4. 重要执行规则：只用文字描述"提案"而没有调用写工具，提案不会真正生成，用户也无法确认——任何写操作都必须实际调用写工具，禁止只描述不调用。
5. 用户请求不明确（缺少对象、数量、范围，或存在多种理解）时：调用 ask_clarification 工具提问澄清并给出候选选项，不要猜测用户意图直接执行。
6. 严禁编造数据；工具未返回的信息不要臆测；工具报错时如实转述原因。
7. 涉及商品、供应商、客户时，先用查询工具拿到真实 ID 再引用。`;

  constructor(
    @Inject(AGENT_LLM_CLIENT) private readonly llm: AgentLlmClient,
    private readonly registry: ToolRegistryService,
    private readonly configService: AiConfigService,
    private readonly pendingActions: PendingActionsService,
    private readonly permissionService: PermissionService,
    @InjectRepository(AiConversationEntity)
    private readonly convRepo: Repository<AiConversationEntity>,
    @InjectRepository(AiMessageEntity)
    private readonly msgRepo: Repository<AiMessageEntity>,
  ) {}

  async chat(
    user: TenantContextData,
    dto: { message: string; conversationId?: number },
    emit?: (event: AgentStreamEvent) => void,
  ): Promise<AiChatResult> {
    const message = dto.message?.trim();
    if (!message) throw new BusinessException('请输入消息内容', 40039);

    // 硬性门槛：未配置 API Key 直接拒绝，无任何降级路径
    const credentials = await this.configService.getCredentials(user.companyId);
    if (!credentials) {
      throw new BusinessException('请先配置 AI 模型服务后再使用 AI 助手', 40040);
    }

    const companyId = user.companyId;
    let conversationId = dto.conversationId;
    if (conversationId) {
      const conv = await this.convRepo.findOne({
        where: { id: conversationId, companyId, userId: user.userId },
      });
      if (!conv) throw new BusinessException('会话不存在', 40411);
    } else {
      const r = await this.convRepo.insert({
        companyId,
        userId: user.userId,
        title: message.slice(0, 24),
      });
      conversationId = r.identifiers[0].id as number;
    }

    // 历史（最近 N 条）→ 上下文延续
    const history = await this.msgRepo.find({
      where: { conversationId, companyId },
      order: { id: 'ASC' },
      take: MAX_HISTORY,
    });

    const permissionCodes = user.isSuperAdmin
      ? ['*']
      : await this.permissionService.getUserPermissionCodes(user.userId!, companyId);

    const llmMessages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...history
        .filter((m) => m.content)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    const tools = this.registry.describeFor(permissionCodes);
    const ctx: ToolContext = {
      companyId,
      userId: user.userId,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
    };
    const cards: AiCard[] = [];
    let finalReply = '';
    let clarified = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await this.llm.chat(
        credentials,
        llmMessages,
        tools,
        emit
          ? (delta) => {
              if (delta.text) emit({ type: 'text', text: delta.text });
            }
          : undefined,
      );
      if (res.content) finalReply = res.content;

      if (!res.toolCalls.length) break;

      // 标准 OpenAI 协议：assistant 消息携带全部 tool_calls（须为标准格式，缺 type/function 会被 400 拒绝），
      // 随后逐条回填 tool 结果；思考模式模型（如 deepseek-v4-flash）还要求回传上一轮 reasoning_content
      const assistantMsg: LlmMessage = {
        role: 'assistant',
        content: res.content,
        tool_calls: res.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments },
        })),
      };
      if (res.reasoningContent) {
        assistantMsg.reasoning_content = res.reasoningContent;
      }
      llmMessages.push(assistantMsg);

      for (const call of res.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }

        // 写工具永远以 propose 模式执行：只生成提案，不真正执行
        const result = await this.registry.execute(call.name, ctx, args, 'propose', permissionCodes);

        if (result.type === 'data') {
          llmMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result.data),
          });
          continue;
        }

        if (result.type === 'propose') {
          const created = await this.pendingActions.create(
            ctx,
            call.name,
            result.params,
            result.preview,
          );
          const confirmationCard: AiCard = {
            type: 'confirmation',
            pendingId: created.id,
            title: result.preview.title,
            rows: result.preview.rows,
          };
          cards.push(confirmationCard);
          emit?.({ type: 'card', card: confirmationCard });
          llmMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({
              ok: true,
              pendingId: created.id,
              message: '提案已生成，等待用户确认。请告知用户点击"确定"按钮执行。',
            }),
          });
          continue;
        }

        if (result.type === 'clarification') {
          const clarificationCard: AiCard = {
            type: 'clarification',
            question: result.question,
            options: result.options,
          };
          cards.push(clarificationCard);
          emit?.({ type: 'card', card: clarificationCard });
          llmMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: true, message: '已向用户提问澄清，等待用户答复。' }),
          });
          clarified = true;
          continue;
        }

        // error
        llmMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: result.message }),
        });
      }

      if (clarified) break;
    }

    if (!finalReply) {
      if (cards.some((c) => c.type === 'clarification')) {
        finalReply = '请补充说明你的需求。';
      } else if (cards.some((c) => c.type === 'confirmation')) {
        finalReply = '已生成操作提案，请点击"确定"执行，或点击"取消"放弃。';
      } else {
        finalReply = '好的，已完成。';
      }
    }

    // 持久化对话（卡片随 assistant 消息保存，前端据此渲染）
    await this.msgRepo.insert({
      conversationId,
      companyId,
      role: 'user',
      content: message,
    });
    await this.msgRepo.insert({
      conversationId,
      companyId,
      role: 'assistant',
      content: finalReply,
      cards: cards.length ? JSON.stringify(cards) : undefined,
    });

    this.logger.log(
      `AI 对话完成：会话#${conversationId}，工具调用 ${llmMessages.filter((m) => m.role === 'tool').length} 次，卡片 ${cards.length} 张`,
    );
    return { conversationId, reply: finalReply, cards };
  }

  async conversations(user: TenantContextData): Promise<AiConversationBrief[]> {
    const rows = await this.convRepo.find({
      where: { companyId: user.companyId, userId: user.userId },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title ?? '对话',
      updatedAt: formatDateTime(c.updatedAt),
    }));
  }

  /** 加载某会话的完整消息历史（仅本人可见） */
  async conversationMessages(
    id: number,
    user: TenantContextData,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; cards: AiCard[] }>> {
    const conv = await this.convRepo.findOne({
      where: { id, companyId: user.companyId, userId: user.userId },
    });
    if (!conv) throw new BusinessException('会话不存在', 40411);
    const rows = await this.msgRepo.find({
      where: { conversationId: id, companyId: user.companyId },
      order: { id: 'ASC' },
    });
    return rows.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
      cards: m.cards ? (JSON.parse(m.cards) as AiCard[]) : [],
    }));
  }
}
