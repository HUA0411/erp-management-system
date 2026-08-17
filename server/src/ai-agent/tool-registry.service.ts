import { Injectable } from '@nestjs/common';
import { TenantContext } from '../tenant/tenant-context';
import { BusinessException } from '../common/exceptions/business.exception';
import type { AgentTool, ToolContext, ToolResult } from './agent-tool';

/** 模型可见的工具描述（OpenAI function calling 格式） */
export interface ToolDescriptor {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * 工具注册表（插件化）：业务模块通过 register() 注入工具包，即"万物皆可插件"。
 * listFor/describeFor 按当前用户权限码过滤，无权限的工具对模型不可见。
 */
@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, AgentTool>();

  register(tools: AgentTool[]): void {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`工具重复注册: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  all(): AgentTool[] {
    return [...this.tools.values()];
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /** 按权限码过滤（'*' 视为全部，超管用） */
  listFor(permissionCodes: string[]): AgentTool[] {
    const all = permissionCodes.includes('*');
    return this.all().filter(
      (t) => !t.requiredPermission || all || permissionCodes.includes(t.requiredPermission),
    );
  }

  describeFor(permissionCodes: string[]): ToolDescriptor[] {
    return this.listFor(permissionCodes).map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.schema },
    }));
  }

  /**
   * 执行工具：在租户上下文内运行 handler，业务异常转为 error 结果而非抛出。
   * mode=propose 时写工具只产出提案内容；mode=execute 仅在用户确认后调用。
   */
  async execute(
    name: string,
    ctx: ToolContext,
    args: Record<string, unknown>,
    mode: 'propose' | 'execute',
    permissionCodes: string[],
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { type: 'error', message: `工具 ${name} 不存在` };
    if (
      tool.requiredPermission &&
      !ctx.isSuperAdmin &&
      !permissionCodes.includes(tool.requiredPermission)
    ) {
      return { type: 'error', message: `无权限使用工具 ${name}` };
    }
    try {
      return await TenantContext.run(
        {
          companyId: ctx.companyId,
          userId: ctx.userId,
          username: ctx.username,
          isSuperAdmin: ctx.isSuperAdmin,
        },
        () => tool.handler(ctx, args, mode),
      );
    } catch (err) {
      const message = err instanceof BusinessException ? err.message : '工具执行失败，请重试';
      return { type: 'error', message };
    }
  }
}
