import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../common/exceptions/business.exception';
import type { ToolDescriptor } from './tool-registry.service';

export interface LlmToolCall {
  id: string;
  name: string;
  /** 参数 JSON 字符串 */
  arguments: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  /** 请求消息中的工具调用（标准 OpenAI 格式） */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  /** 思考模式模型的推理内容（带工具调用的 assistant 消息需原样回传） */
  reasoning_content?: string;
}

export interface LlmCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LlmChatResult {
  content: string | null;
  toolCalls: LlmToolCall[];
  /** 思考模式模型的推理内容（后续请求需回传） */
  reasoningContent?: string | null;
}

export interface LlmDelta {
  text?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/** 对话选项：思考强度与流式回调 */
export interface ChatOptions {
  /**
   * 思考强度（DeepSeek v4 思考模式）：low / medium / high / max。
   * 默认 high。仅对 DeepSeek 思考模型生效，其它服务商忽略。
   */
  reasoningEffort?: string;
  /** 流式文本增量回调（工具调用参数不回调） */
  onDelta?: (delta: LlmDelta) => void;
}

/** 模型客户端抽象：测试注入 FakeLlmClient，生产走 OpenAI 兼容协议 */
export interface AgentLlmClient {
  /**
   * 对话（支持流式）：opts.onDelta 每收到一段文本增量即回调（工具调用参数不回调）。
   * 实现可选择忽略 onDelta（非流式），但建议支持以获得流式体验。
   */
  chat(
    credentials: LlmCredentials,
    messages: LlmMessage[],
    tools: ToolDescriptor[],
    opts?: ChatOptions,
  ): Promise<LlmChatResult>;

  /** 连接测试：用最小请求验证 Key/地址/模型是否可用 */
  testConnection(credentials: LlmCredentials): Promise<ConnectionTestResult>;
}

/** OpenAI 兼容 Chat Completions 客户端（支持流式 + function calling） */
@Injectable()
export class DeepSeekLlmClient implements AgentLlmClient {
  private readonly logger = new Logger(DeepSeekLlmClient.name);
  private readonly timeoutMs = 60_000;

  async chat(
    credentials: LlmCredentials,
    messages: LlmMessage[],
    tools: ToolDescriptor[],
    opts?: ChatOptions,
  ): Promise<LlmChatResult> {
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    // DeepSeek v4 思考模式：默认开启思考，强度由 reasoning_effort 控制；
    // 思考模式下 temperature/top_p 等不生效，因此 DeepSeek 不发 temperature。
    // 非 DeepSeek（其它 OpenAI 兼容服务商）仍沿用原逻辑，发送 temperature 不加思考参数。
    const body: Record<string, unknown> = {
      model: credentials.model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 4096,
      stream: true,
    };
    if (this.isDeepSeek(credentials)) {
      // 思考强度：none=关闭思考（thinking.disabled，不设 reasoning_effort）
      //            low/high/max=开启思考 + reasoning_effort（默认 high）
      const effort = opts?.reasoningEffort || 'high';
      if (effort === 'none') {
        body.thinking = { type: 'disabled' };
      } else {
        body.thinking = { type: 'enabled' };
        body.reasoning_effort = effort;
      }
    } else {
      body.temperature = 0.2;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.error(`LLM 请求失败: ${(err as Error).message}`);
      throw new BusinessException('AI 服务暂时不可用，请稍后再试', 40030);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`LLM 返回 ${res.status}: ${text.slice(0, 300)}`);
      if (res.status === 401) {
        throw new BusinessException('API Key 无效，请检查配置', 40031);
      }
      if (res.status === 404 || text.includes('model')) {
        throw new BusinessException('模型名或接口地址不正确，请检查配置', 40041);
      }
      throw new BusinessException('AI 服务返回异常，请稍后再试', 40032);
    }

    if (!res.body) {
      throw new BusinessException('AI 服务无响应内容', 40032);
    }

    // 流式解析：data: {...} 逐行；累积文本增量、推理内容与工具调用参数
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoningContent = '';
    const toolCalls: Array<{ index: number; id: string; name: string; arguments: string }> = [];
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          finished = true;
          break;
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null;
                reasoning_content?: string | null;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            content += delta.content;
            opts?.onDelta?.({ text: delta.content });
          }
          if (delta.reasoning_content) {
            reasoningContent += delta.reasoning_content;
          }
          for (const tc of delta.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            let entry = toolCalls.find((t) => t.index === idx);
            if (!entry) {
              entry = { index: idx, id: '', name: '', arguments: '' };
              toolCalls.push(entry);
            }
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.arguments += tc.function.arguments;
          }
        } catch {
          // 忽略无法解析的中间行
        }
      }
    }

    return {
      content: content || null,
      toolCalls: toolCalls.map((t) => ({ id: t.id, name: t.name, arguments: t.arguments || '{}' })),
      reasoningContent: reasoningContent || null,
    };
  }

  async testConnection(credentials: LlmCredentials): Promise<ConnectionTestResult> {
    const url = `${credentials.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.apiKey}`,
        },
        body: JSON.stringify({
          model: credentials.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, message: '连接成功' };
      if (res.status === 401) return { ok: false, message: 'API Key 无效，请检查' };
      if (res.status === 404) {
        return { ok: false, message: '模型名或接口地址不存在，请检查' };
      }
      /**
       * 只回状态码，不回上游响应体。
       * 原先是 `服务返回错误（${res.status}）：${text.slice(0, 120)}` —— 由于
       * baseUrl 由用户自由填写，这个回显等于把服务器变成了内网探测代理：
       * 指向任意内网地址，就能把对方的响应内容读到客户端。
       */
      return { ok: false, message: `服务返回错误（HTTP ${res.status}），请检查接口地址与密钥` };
    } catch {
      return { ok: false, message: '无法连接服务，请检查 API 地址与网络' };
    }
  }

  /** 是否为 DeepSeek 官方端点：仅对 DeepSeek 发送 thinking/reasoning_effort（思考模式） */
  private isDeepSeek(credentials: LlmCredentials): boolean {
    return /deepseek\.com/i.test(credentials.baseUrl) || /^deepseek[-/]/i.test(credentials.model);
  }
}
