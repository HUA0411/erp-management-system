import type { AiPreviewRow } from '@erp/shared';

/** 工具执行上下文（含租户与权限信息） */
export interface ToolContext {
  companyId: number;
  userId?: number;
  username?: string;
  isSuperAdmin?: boolean;
}

/** 确认/结果卡片内容 */
export interface PreviewCard {
  title: string;
  rows: AiPreviewRow[];
}

export type ToolResult =
  | { type: 'data'; data: unknown }
  | { type: 'propose'; params: Record<string, unknown>; preview: PreviewCard }
  | { type: 'clarification'; question: string; options: string[] }
  | { type: 'error'; message: string };

export type ToolKind = 'read' | 'write' | 'interrupt';

/**
 * 业务工具（插件化单元）：
 * - read：查询，自动执行，结果喂回模型；
 * - write：修改，只生成提案（propose），由用户确认后以 execute 模式真正执行；
 * - interrupt：暂停对话，返回澄清卡片等待用户。
 * requiredPermission 映射系统权限码：无权限的用户连工具描述都看不到。
 */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema（供模型 function calling 校验参数） */
  schema: Record<string, unknown>;
  kind: ToolKind;
  requiredPermission?: string;
  handler(
    ctx: ToolContext,
    args: Record<string, unknown>,
    mode: 'propose' | 'execute',
  ): Promise<ToolResult>;
}
