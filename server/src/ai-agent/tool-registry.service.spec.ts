import { ToolRegistryService } from './tool-registry.service';
import type { AgentTool, ToolResult } from './agent-tool';

function makeTool(name: string, kind: AgentTool['kind'], requiredPermission?: string): AgentTool {
  return {
    name,
    description: `工具 ${name}`,
    schema: { type: 'object', properties: {}, additionalProperties: false },
    kind,
    requiredPermission,
    async handler(): Promise<ToolResult> {
      return { type: 'data', data: { name } };
    },
  };
}

describe('ToolRegistryService（插件化工具注册表）', () => {
  let registry: ToolRegistryService;

  beforeEach(() => {
    registry = new ToolRegistryService();
  });

  it('按权限码过滤：无权限的工具不可见', () => {
    registry.register([
      makeTool('free', 'read'),
      makeTool('adjust', 'write', 'inventory:adjust'),
      makeTool('po', 'write', 'purchase:order:create'),
    ]);

    expect(registry.listFor([]).map((t) => t.name)).toEqual(['free']);
    expect(registry.listFor(['inventory:adjust']).map((t) => t.name)).toEqual([
      'free',
      'adjust',
    ]);
    // 超管（*）可见全部
    expect(registry.listFor(['*']).map((t) => t.name)).toEqual(['free', 'adjust', 'po']);
  });

  it('describeFor 生成的描述同样按权限过滤', () => {
    registry.register([makeTool('free', 'read'), makeTool('secret', 'write', 'inventory:adjust')]);
    const desc = registry.describeFor([]);
    expect(desc).toHaveLength(1);
    expect(desc[0].function.name).toBe('free');
  });

  it('无权限执行工具返回 error 而非抛出', async () => {
    registry.register([makeTool('adjust', 'write', 'inventory:adjust')]);
    const res = await registry.execute('adjust', { companyId: 1, userId: 1 }, {}, 'propose', []);
    expect(res.type).toBe('error');
    if (res.type === 'error') expect(res.message).toContain('无权限');
  });

  it('handler 抛出的业务异常转为 error 结果', async () => {
    registry.register([
      {
        name: 'boom',
        description: 'boom',
        schema: { type: 'object', properties: {}, additionalProperties: false },
        kind: 'read',
        async handler(): Promise<ToolResult> {
          throw new Error('内部错误');
        },
      },
    ]);
    const res = await registry.execute('boom', { companyId: 1 }, {}, 'propose', ['*']);
    expect(res.type).toBe('error');
    if (res.type === 'error') expect(res.message).toBe('工具执行失败，请重试');
  });

  it('重复注册同名工具直接报错（插件冲突保护）', () => {
    registry.register([makeTool('dup', 'read')]);
    expect(() => registry.register([makeTool('dup', 'read')])).toThrow('工具重复注册');
  });
});
