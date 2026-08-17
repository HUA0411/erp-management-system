import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfigEntity } from '../entities/ai-config.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { PermissionService } from '../permission/permission.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { AGENT_LLM_CLIENT } from './agent-llm-client.token';
import type { TenantContextData } from '../tenant/tenant-context';
import type { AiConfigPayload, AiConfigView } from '@erp/shared';
import type { AgentLlmClient, LlmCredentials } from './deepseek-llm.client';

/**
 * 公司级 AI 服务配置：每租户一条（company_id 唯一）。
 * 接口层只暴露掩码 Key（末 4 位），完整 Key 仅 getCredentials 内部使用。
 * 未配置即视为未启用——没有任何无 Key 的降级/模拟路径。
 */
@Injectable()
export class AiConfigService implements OnModuleInit {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    @InjectRepository(AiConfigEntity)
    private readonly configRepo: Repository<AiConfigEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    private readonly permissionService: PermissionService,
    @Inject(AGENT_LLM_CLIENT) private readonly llm: AgentLlmClient,
  ) {}

  /** 幂等补齐 ai:config 权限码（老库迁移后权限树中不存在） */
  async onModuleInit(): Promise<void> {
    const code = 'ai:config';
    const exists = await this.permissionRepo.findOne({ where: { code } });
    if (exists) return;
    const parent = await this.permissionRepo.findOne({ where: { code: 'system' } });
    await this.permissionRepo.insert({
      parentId: parent?.id ?? 0,
      name: 'AI 助手配置',
      code,
      type: 'button',
      sort: 0,
      status: 1,
    });
    this.logger.log('权限码 ai:config 已补齐');
  }

  async view(user: TenantContextData): Promise<AiConfigView> {
    const cfg = await this.configRepo.findOne({ where: { companyId: user.companyId } });
    return {
      configured: !!cfg,
      canConfigure: await this.canConfigure(user),
      provider: cfg?.provider ?? 'custom',
      baseUrl: cfg?.baseUrl ?? 'https://api.deepseek.com',
      model: cfg?.model ?? 'deepseek-chat',
      keyMasked: cfg ? this.maskKey(cfg.apiKey) : undefined,
    };
  }

  async save(user: TenantContextData, dto: AiConfigPayload): Promise<AiConfigView> {
    if (!(await this.canConfigure(user))) {
      throw new BusinessException('无权限配置 AI 服务', 40300);
    }
    const companyId = user.companyId;
    const existing = await this.configRepo.findOne({ where: { companyId } });

    const apiKey = dto.apiKey?.trim() || existing?.apiKey || '';
    if (!apiKey) {
      throw new BusinessException('请填写 API Key', 40033);
    }
    const next = {
      companyId,
      apiKey,
      provider: dto.provider?.trim() || existing?.provider || 'custom',
      baseUrl: dto.baseUrl?.trim() || existing?.baseUrl || 'https://api.deepseek.com',
      model: dto.model?.trim() || existing?.model || 'deepseek-chat',
      updatedBy: user.userId,
    };

    if (existing) {
      await this.configRepo.update({ id: existing.id }, next);
    } else {
      await this.configRepo.insert(next);
    }
    this.logger.log(`AI 配置已保存（租户 ${companyId}）`);
    return this.view(user);
  }

  /** 测试连接（不落库）：用表单配置（缺省回退到已存配置）发最小请求验证 */
  async test(user: TenantContextData, dto: AiConfigPayload): Promise<{ ok: boolean; message: string }> {
    if (!(await this.canConfigure(user))) {
      throw new BusinessException('无权限配置 AI 服务', 40300);
    }
    const existing = await this.configRepo.findOne({ where: { companyId: user.companyId } });
    const apiKey = dto.apiKey?.trim() || existing?.apiKey;
    if (!apiKey) return { ok: false, message: '请填写 API Key' };
    const baseUrl = dto.baseUrl?.trim() || existing?.baseUrl || 'https://api.deepseek.com';
    const model = dto.model?.trim() || existing?.model;
    if (!model) return { ok: false, message: '请填写模型名' };
    return this.llm.testConnection({ apiKey, baseUrl, model } satisfies LlmCredentials);
  }

  /** 服务内部取完整凭据（仅用于发起 LLM 请求，不对外暴露） */
  async getCredentials(companyId: number): Promise<LlmCredentials | null> {
    const cfg = await this.configRepo.findOne({ where: { companyId } });
    if (!cfg) return null;
    return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model };
  }

  private async canConfigure(user: TenantContextData): Promise<boolean> {
    if (user.isSuperAdmin) return true;
    const codes = await this.permissionService.getUserPermissionCodes(
      user.userId!,
      user.companyId,
    );
    return codes.includes('ai:config');
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '****';
    return `****${key.slice(-4)}`;
  }
}
