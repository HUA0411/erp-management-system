import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import dataSource from '../src/database/data-source';
import { AGENT_LLM_CLIENT } from '../src/ai-agent/agent-llm-client.token';
import type {
  AgentLlmClient,
  ConnectionTestResult,
  LlmChatResult,
  LlmDelta,
  LlmMessage,
  LlmCredentials,
} from '../src/ai-agent/deepseek-llm.client';
import type { ToolDescriptor } from '../src/ai-agent/tool-registry.service';

/** 可编程假模型：每个对话消耗一个脚本（多次响应序列），并记录每次收到的工具描述 */
class FakeLlmClient implements AgentLlmClient {
  private scripts: LlmChatResult[][];
  private current: LlmChatResult[] = [];
  seenToolLists: ToolDescriptor[][] = [];

  constructor(scripts: LlmChatResult[][]) {
    this.scripts = [...scripts];
  }

  async chat(
    _credentials: LlmCredentials,
    _messages: LlmMessage[],
    tools: ToolDescriptor[],
    onDelta?: (delta: LlmDelta) => void,
  ): Promise<LlmChatResult> {
    this.seenToolLists.push(tools);
    if (!this.current.length) {
      this.current = this.scripts.shift() ?? [{ content: '好的', toolCalls: [] }];
    }
    const res = this.current.shift() ?? { content: '好的', toolCalls: [] };
    if (onDelta && res.content) {
      // 模拟流式分片
      onDelta({ text: res.content.slice(0, 5) });
      onDelta({ text: res.content.slice(5) });
    }
    return res;
  }

  async testConnection(_credentials: LlmCredentials): Promise<ConnectionTestResult> {
    return { ok: true, message: '连接成功' };
  }
}

const call = (id: string, name: string, args: string): LlmChatResult => ({
  content: null,
  toolCalls: [{ id, name, arguments: args }],
});

/** 解析 SSE 文本为事件数组 */
const parseSse = (text: string): Array<Record<string, unknown>> =>
  text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => {
      try {
        return JSON.parse(l.slice(5).trim()) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

describe('AI 助手 e2e（真实 MySQL + FakeLlmClient）', () => {
  let app: INestApplication;
  let fake: FakeLlmClient;

  beforeAll(async () => {
    // 清理 AI 相关表，保证测试可重复运行
    await dataSource.initialize();
    await dataSource.query('DELETE FROM ai_message');
    await dataSource.query('DELETE FROM ai_pending_action');
    await dataSource.query('DELETE FROM ai_conversation');
    await dataSource.query('DELETE FROM ai_report');
    await dataSource.query('DELETE FROM ai_config');
    await dataSource.destroy();

    fake = new FakeLlmClient([
      // 用例5：zhaoliu 澄清脚本（单响应：澄清后循环即停止，不会请求第二次）
      [call('c1', 'ask_clarification', '{"question":"你想补充哪个商品？","options":["商品A","商品B"]}')],
      // 用例6：admin 缺货查询（读流程）
      [call('c2', 'query_low_stock', '{}'), { content: '根据库存实时数据，当前有 3 个商品低于安全库存。', toolCalls: [] }],
      // 用例7：admin 补库存 +5（写流程 → 提案）
      [
        call('c3', 'adjust_stock', '{"productId":2,"delta":5,"remark":"AI 补货测试"}'),
        { content: '已生成库存调整提案，请点击确定执行。', toolCalls: [] },
      ],
      // 用例9：admin 补库存 +5 后取消
      [
        call('c4', 'adjust_stock', '{"productId":2,"delta":5,"remark":"AI 补货测试-取消"}'),
        { content: '已生成库存调整提案，请点击确定执行。', toolCalls: [] },
      ],
      // 用例10：admin 补库存 +5（跨租户用例，仅生成提案不确认）
      [
        call('c5', 'adjust_stock', '{"productId":2,"delta":5,"remark":"AI 补货测试-跨租户"}'),
        { content: '已生成库存调整提案，请点击确定执行。', toolCalls: [] },
      ],
      // 用例11：admin 补库存 -99999999（确认时业务失败）
      [
        call('c6', 'adjust_stock', '{"productId":2,"delta":-99999999}'),
        { content: '已生成库存调整提案，请点击确定执行。', toolCalls: [] },
      ],
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AGENT_LLM_CLIENT)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (companyCode: string, username: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ companyCode, username, password });

  const auth = (token: string) => (req: request.Test) =>
    req.set('Authorization', `Bearer ${token}`);

  const postChat = (token: string, body: Record<string, unknown>) =>
    auth(token)(request(app.getHttpServer()).post('/api/ai-agent/chat').send(body));

  /** 发送对话并返回事件数组（断言无 error 事件） */
  const chatEvents = async (
    token: string,
    body: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> => {
    const res = await postChat(token, body);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(res.text);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeUndefined();
    return events;
  };

  const getP002Qty = async (token: string): Promise<number> => {
    const res = await auth(token)(request(app.getHttpServer()).get('/api/inventory?page=1&pageSize=200'));
    const row = res.body.data.list.find((i: { productId: number }) => i.productId === 2);
    return Number(row?.quantity ?? 0);
  };

  it('未配置时 status.configured=false 且可配置', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const res = await auth(demo.body.data.token)(request(app.getHttpServer()).get('/api/ai-agent/status'));
    expect(res.body.code).toBe(0);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.canConfigure).toBe(true);
  });

  it('未配置 Key 时调用对话被拒绝（无降级路径）', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const res = await postChat(demo.body.data.token, { message: '有哪些缺货' });
    const events = parseSse(res.text);
    const errorEvent = events.find((e) => e.type === 'error') as { data?: { code?: number } };
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data?.code).toBe(40040);
  });

  it('配置测试：未配置时提示缺少 Key，配置后测试通过', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    // 缺 Key
    const noKey = await auth(demo.body.data.token)(
      request(app.getHttpServer()).post('/api/ai-agent/config/test').send({ baseUrl: 'x', model: 'y' }),
    );
    expect(noKey.body.code).toBe(0);
    expect(noKey.body.data.ok).toBe(false);

    // 带 Key 测试通过（Fake 返回 ok）
    const ok = await auth(demo.body.data.token)(
      request(app.getHttpServer()).post('/api/ai-agent/config/test').send({
        apiKey: 'sk-test-1',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      }),
    );
    expect(ok.body.code).toBe(0);
    expect(ok.body.data.ok).toBe(true);
  });

  it('无 ai:config 权限的用户不能保存配置', async () => {
    const zhaoliu = await login('DEMO', 'zhaoliu', '123456');
    const res = await auth(zhaoliu.body.data.token)(
      request(app.getHttpServer()).put('/api/ai-agent/config').send({ apiKey: 'sk-test-x' }),
    );
    expect(res.body.code).toBe(40300);
  });

  it('管理员保存配置：configured=true，Key 只回掩码，provider 回显', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const save = await auth(demo.body.data.token)(
      request(app.getHttpServer()).put('/api/ai-agent/config').send({
        apiKey: 'sk-test-1234567890',
        provider: 'zhipu',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4.6',
      }),
    );
    expect(save.body.code).toBe(0);
    expect(save.body.data.configured).toBe(true);
    expect(save.body.data.provider).toBe('zhipu');
    expect(save.body.data.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(save.body.data.model).toBe('glm-4.6');
    expect(save.body.data.keyMasked).toBe('****7890');
    expect(JSON.stringify(save.body.data)).not.toContain('sk-test-1234567890');

    const status = await auth(demo.body.data.token)(request(app.getHttpServer()).get('/api/ai-agent/status'));
    expect(status.body.data.configured).toBe(true);
    expect(status.body.data.provider).toBe('zhipu');
    expect(JSON.stringify(status.body)).not.toContain('sk-test');
  });

  it('权限过滤：无写权限的用户，其工具列表不含写工具', async () => {
    const zhaoliu = await login('DEMO', 'zhaoliu', '123456');
    await chatEvents(zhaoliu.body.data.token, { message: '帮我补充库存' });
    const lastTools = fake.seenToolLists[fake.seenToolLists.length - 1] ?? [];
    const names = lastTools.map((t) => t.function.name);
    expect(names).not.toContain('adjust_stock');
    expect(names).not.toContain('create_purchase_order');
    expect(names).toContain('ask_clarification');
  });

  it('读流程：查询缺货自动执行并流式返回文本', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const events = await chatEvents(demo.body.data.token, { message: '今天有哪些缺货？' });
    // 有文本增量事件 + done 事件
    const textEvent = events.find((e) => e.type === 'text');
    expect(textEvent).toBeDefined();
    const done = events.find((e) => e.type === 'done') as { data?: { conversationId?: number; reply?: string; cards?: unknown[] } };
    expect(done).toBeDefined();
    expect(done.data?.conversationId).toBeGreaterThan(0);
    expect((done.data?.reply ?? '').length).toBeGreaterThan(0);
    expect(done.data?.cards).toHaveLength(0);
  });

  it('写流程：生成提案（库存不变），确认后执行（库存 +5 且写审计日志）', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const token = demo.body.data.token;
    const before = await getP002Qty(token);

    // 1. chat 生成提案（SSE 事件含 confirmation 卡片）
    const events = await chatEvents(token, { message: '给商品补充库存' });
    const cardEvent = events.find((e) => e.type === 'card') as { card?: { pendingId?: number } };
    expect(cardEvent).toBeDefined();
    const pendingId = cardEvent.card?.pendingId as number;
    expect(pendingId).toBeGreaterThan(0);

    // 2. 提案未确认前库存不变
    expect(await getP002Qty(token)).toBe(before);

    // 3. pending 列表可见
    const pendingList = await auth(token)(request(app.getHttpServer()).get('/api/ai-agent/pending'));
    expect(pendingList.body.data.some((p: { id: number }) => p.id === pendingId)).toBe(true);

    // 4. 确认后库存 +5
    const confirm = await auth(token)(
      request(app.getHttpServer()).post(`/api/ai-agent/pending/${pendingId}/confirm`),
    );
    expect(confirm.body.code).toBe(0);
    expect(confirm.body.data.ok).toBe(true);
    expect(await getP002Qty(token)).toBe(before + 5);

    // 5. 审计日志（logs 接口需分页参数）
    const logs = await auth(token)(
      request(app.getHttpServer()).get('/api/logs?page=1&pageSize=10&module=AI%E5%8A%A9%E6%89%8B'),
    );
    expect(logs.body.code).toBe(0);
    expect(
      logs.body.data.list.some((l: { action: string }) => l.action.includes('adjust_stock')),
    ).toBe(true);
  });

  it('取消提案零副作用：库存不变', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const token = demo.body.data.token;
    const before = await getP002Qty(token);

    const events = await chatEvents(token, { message: '给商品补充库存' });
    const cardEvent = events.find((e) => e.type === 'card') as { card?: { pendingId?: number } };
    const pendingId = cardEvent.card?.pendingId as number;

    const cancel = await auth(token)(
      request(app.getHttpServer()).post(`/api/ai-agent/pending/${pendingId}/cancel`),
    );
    expect(cancel.body.code).toBe(0);
    expect(await getP002Qty(token)).toBe(before);
  });

  it('跨租户：T2 无法确认 DEMO 的提案', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const demoToken = demo.body.data.token;
    const events = await chatEvents(demoToken, { message: '给商品补充库存' });
    const cardEvent = events.find((e) => e.type === 'card') as { card?: { pendingId?: number } };
    const pendingId = cardEvent.card?.pendingId as number;

    const t2 = await login('T2', 't2admin', '123456');
    const res = await auth(t2.body.data.token)(
      request(app.getHttpServer()).post(`/api/ai-agent/pending/${pendingId}/confirm`),
    );
    expect(res.body.code).toBe(40410);
  });

  it('确认时业务失败（超卖/负数）→ failed，库存不变', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const token = demo.body.data.token;
    const before = await getP002Qty(token);

    const events = await chatEvents(token, { message: '给商品补充库存' });
    const cardEvent = events.find((e) => e.type === 'card') as { card?: { pendingId?: number } };
    const pendingId = cardEvent.card?.pendingId as number;

    const confirm = await auth(token)(
      request(app.getHttpServer()).post(`/api/ai-agent/pending/${pendingId}/confirm`),
    );
    expect(confirm.body.code).toBe(40037);
    expect(confirm.body.message).toContain('库存不足');
    expect(await getP002Qty(token)).toBe(before);
  });

  it('对话历史：列表可查、消息可加载、跨用户隔离', async () => {
    const demo = await login('DEMO', 'admin', '123456');
    const token = demo.body.data.token;

    // 产生一次对话（fake 脚本耗尽后走兜底回复，仍会创建会话）
    const events = await chatEvents(token, { message: '测试历史记录' });
    const done = events.find((e) => e.type === 'done') as { data?: { conversationId?: number } };
    const cid = done.data?.conversationId as number;
    expect(cid).toBeGreaterThan(0);

    // 会话列表包含它
    const convs = await auth(token)(request(app.getHttpServer()).get('/api/ai-agent/conversations'));
    expect(convs.body.code).toBe(0);
    expect(convs.body.data.some((c: { id: number }) => c.id === cid)).toBe(true);

    // 加载消息：至少 user + assistant 两条
    const msgs = await auth(token)(
      request(app.getHttpServer()).get(`/api/ai-agent/conversations/${cid}/messages`),
    );
    expect(msgs.body.code).toBe(0);
    expect(msgs.body.data.length).toBeGreaterThanOrEqual(2);
    expect(msgs.body.data[0].role).toBe('user');

    // 跨用户隔离：zhaoliu 看不到 admin 的会话
    const zhaoliu = await login('DEMO', 'zhaoliu', '123456');
    const zr = await auth(zhaoliu.body.data.token)(
      request(app.getHttpServer()).get(`/api/ai-agent/conversations/${cid}/messages`),
    );
    expect(zr.body.code).toBe(40411);
  });
});
