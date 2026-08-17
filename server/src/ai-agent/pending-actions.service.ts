import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPendingActionEntity } from '../entities/ai-pending-action.entity';
import { PermissionService } from '../permission/permission.service';
import { LogsService } from '../logs/logs.service';
import { ToolRegistryService } from './tool-registry.service';
import { BusinessException } from '../common/exceptions/business.exception';
import type { TenantContextData } from '../tenant/tenant-context';
import type { AiPendingAction } from '@erp/shared';
import type { PreviewCard, ToolContext } from './agent-tool';
import { formatDateTime } from '../common/utils/no-generator';

const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * 写操作提案生命周期：模型/工具只生成提案（propose），
 * 用户确认后以 execute 模式走真实 service（事务、校验、审计全部继承）。
 * 归属 = companyId + userId，仅提案人可确认/取消；过期自动失效。
 */
@Injectable()
export class PendingActionsService {
  constructor(
    @InjectRepository(AiPendingActionEntity)
    private readonly pendingRepo: Repository<AiPendingActionEntity>,
    private readonly registry: ToolRegistryService,
    private readonly permissionService: PermissionService,
    private readonly logsService: LogsService,
  ) {}

  async create(
    ctx: ToolContext,
    toolName: string,
    params: Record<string, unknown>,
    preview: PreviewCard,
  ): Promise<{ id: number }> {
    const result = await this.pendingRepo.insert({
      companyId: ctx.companyId,
      userId: ctx.userId ?? 0,
      username: ctx.username,
      toolName,
      params: JSON.stringify(params),
      preview: JSON.stringify(preview),
      status: 'pending',
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    });
    return { id: result.identifiers[0].id as number };
  }

  async listMine(ctx: ToolContext): Promise<AiPendingAction[]> {
    const rows = await this.pendingRepo.find({
      where: { companyId: ctx.companyId, userId: ctx.userId ?? 0, status: 'pending' },
      order: { id: 'DESC' },
      take: 20,
    });
    return rows.map((r) => this.toItem(r));
  }

  async confirm(
    id: number,
    user: TenantContextData,
  ): Promise<{
    ok: boolean;
    message: string;
    toolName: string;
    preview: PreviewCard;
    result: unknown;
  }> {
    const pending = await this.mustFindOwn(id, user);
    if (pending.status !== 'pending') {
      throw new BusinessException('该提案已处理，请重新发起', 40034);
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      throw new BusinessException('提案已过期，请重新发起', 40035);
    }

    const tool = this.registry.get(pending.toolName);
    if (!tool || tool.kind !== 'write') {
      throw new BusinessException('提案对应的操作不可执行', 40036);
    }

    // 二次校验权限（执行时仍以提案人身份）
    const permissionCodes = user.isSuperAdmin
      ? ['*']
      : await this.permissionService.getUserPermissionCodes(user.userId!, user.companyId);

    const ctx: ToolContext = {
      companyId: user.companyId,
      userId: user.userId,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
    };
    const result = await this.registry.execute(
      pending.toolName,
      ctx,
      JSON.parse(pending.params) as Record<string, unknown>,
      'execute',
      permissionCodes,
    );

    if (result.type === 'error') {
      await this.pendingRepo.update(
        { id },
        {
          status: 'failed',
          result: JSON.stringify({ error: result.message }),
          confirmedAt: new Date(),
        },
      );
      throw new BusinessException(result.message, 40037);
    }

    const data = result.type === 'data' ? result.data : null;
    await this.pendingRepo.update(
      { id },
      { status: 'confirmed', result: JSON.stringify(data), confirmedAt: new Date() },
    );
    await this.logsService.record('AI助手', `执行 ${pending.toolName}`, {
      pendingId: id,
      result: data,
    });
    return {
      ok: true,
      message: '操作已执行',
      toolName: pending.toolName,
      preview: JSON.parse(pending.preview) as PreviewCard,
      result: data,
    };
  }

  async cancel(id: number, user: TenantContextData): Promise<{ ok: boolean }> {
    const pending = await this.mustFindOwn(id, user);
    if (pending.status !== 'pending') {
      throw new BusinessException('该提案已处理', 40038);
    }
    await this.pendingRepo.update({ id }, { status: 'cancelled' });
    return { ok: true };
  }

  private async mustFindOwn(
    id: number,
    user: TenantContextData,
  ): Promise<AiPendingActionEntity> {
    const row = await this.pendingRepo.findOne({
      where: { id, companyId: user.companyId, userId: user.userId ?? -1 },
    });
    if (!row) throw new BusinessException('提案不存在', 40410);
    return row;
  }

  private toItem(r: AiPendingActionEntity): AiPendingAction {
    return {
      id: r.id,
      toolName: r.toolName,
      preview: JSON.parse(r.preview) as { title: string; rows: Array<{ label: string; value: string }> },
      status: r.status,
      expiresAt: formatDateTime(r.expiresAt),
      createdAt: formatDateTime(r.createdAt),
    };
  }
}
