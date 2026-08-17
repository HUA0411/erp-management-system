import { Injectable, OnModuleInit } from '@nestjs/common';
import { ToolRegistryService } from '../tool-registry.service';
import type { AgentTool } from '../agent-tool';

/**
 * 通用澄清工具：请求不明确时暂停对话，向用户提问（带候选选项）。
 * 这是"智能体不闷头干活"的关键——先问清楚，再决定是否操作。
 */
export function createClarifyTool(): AgentTool {
  return {
    name: 'ask_clarification',
    description:
      '当用户的请求不明确（缺少对象、数量、范围，或存在多种理解）时，调用本工具向用户提问澄清，并给出候选选项。不要在意图不清时直接执行任何操作。',
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题' },
        options: { type: 'array', items: { type: 'string' }, description: '2-4 个候选选项' },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
    kind: 'interrupt',
    async handler(_ctx, args) {
      const options = Array.isArray(args.options) ? args.options.map(String) : [];
      return {
        type: 'clarification',
        question: String(args.question ?? '请补充说明'),
        options: options.slice(0, 4),
      };
    },
  };
}

/** 澄清工具引导注册：模块启动时把通用交互工具注入注册表 */
@Injectable()
export class ClarifyToolBootstrap implements OnModuleInit {
  constructor(private readonly registry: ToolRegistryService) {}

  onModuleInit(): void {
    this.registry.register([createClarifyTool()]);
  }
}
