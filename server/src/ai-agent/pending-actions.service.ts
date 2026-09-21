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
 * 抢占租约：确认时先把提案置为 executing，超过这个时长仍未落终态
 * 就认定执行它的进程已经不在了（重启 / OOM / 连接断），由 reclaimStale() 回收。
 * 取 2 分钟——远大于任何一次工具执行（最长的是 AI 建单，秒级），
 * 又短到用户不用等太久就能重新发起。
 */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

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
    // 先回收僵死的 executing，保证列表里不会出现永远转圈的条目
    await this.reclaimStale(ctx.companyId, ctx.userId ?? 0);
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
    // 先把僵死的 executing 判失败，否则用户点了没反应也看不懂为什么
    await this.reclaimStale(user.companyId, user.userId ?? -1);

    const pending = await this.mustFindOwn(id, user);
    if (pending.expiresAt.getTime() < Date.now()) {
      throw new BusinessException('提案已过期，请重新发起', 40035);
    }
    // 快速失败：已处理过的提案直接拒绝（真正防并发靠下面的行锁）
    if (pending.status !== 'pending') {
      throw new BusinessException('该提案已处理，请重新发起', 40034);
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
    const params = JSON.parse(pending.params) as Record<string, unknown>;

    /**
     * 防重复执行 = 「先抢占，再执行」——**不要**用一个大事务把工具执行包起来。
     *
     * 曾经的做法是：`dataSource.transaction()` 里先 `SELECT ... FOR UPDATE` 锁住提案行，
     * 然后在事务里调工具，工具内部（sale/purchase/inventory 的 service）
     * 又各自 `this.dataSource.transaction(...)` —— 那是从连接池里**另取一条连接**新开的事务，
     * 两层互不相干。由此产生两个真问题：
     *
     *   1. 外层回滚撤不掉内层已经提交的写入。工具把库存扣了、出库单建了并提交，
     *      回到外层若因为任何原因失败（写状态失败、进程被杀、连接断），
     *      业务已落地，而提案仍是 pending —— 用户再点一次「确定」就是**重复执行一遍**。
     *   2. 一个请求同时占 2 条连接（池子 20 条），10 个并发确认就能把池子抽干，
     *      互相等对方的连接，请求永不返回也不释放。
     *
     * 现在改成标准的「抢占 + 租约」：
     *   ① 一条独立的原子 UPDATE 把 pending 改成 executing 并提交 —— 只有一个请求能改成功；
     *   ② 出了事务再跑工具（工具自己管自己的事务，全程只用 1 条连接，没有嵌套）；
     *   ③ 按结果写回 confirmed / failed。
     *
     * ①和③之间的进程崩溃会让提案停在 executing。这不是死状态：
     * reclaimStale() 会把「抢占超过 2 分钟仍未落终态」的提案判为失败并释放，
     * 用户可以重新发起。宁可让用户重来一次，也绝不重复执行。
     */
    const claimed = await this.pendingRepo.update(
      {
        id,
        companyId: ctx.companyId,
        userId: ctx.userId ?? -1,
        status: 'pending',
      },
      { status: 'executing', claimedAt: new Date() } as Partial<AiPendingActionEntity>,
    );
    if ((claimed.affected ?? 0) === 0) {
      // 并发双击时第二个请求走到这里（第一个已经把状态改成 executing）
      throw new BusinessException('该提案已处理，请重新发起', 40034);
    }

    const result = await this.registry.execute(pending.toolName, ctx, params, 'execute', permissionCodes);

    if (result.type === 'error') {
      // 失败态必须独立提交，不能被任何事务回滚带走 —— 否则提案卡在 pending，
      // 用户反复点、每次都是同样的报错，且没有任何失败痕迹。
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

  /**
   * 回收僵死的 executing 提案。
   *
   * 「抢占 + 执行 + 写回」中间如果进程被杀（部署重启、OOM），提案会停在 executing。
   * 超过 CLAIM_LEASE_MS 仍未落终态的，说明抢占它的那个进程已经不在了，
   * 判为 failed 并告知用户重新发起 —— never 自动重放，因为无法确定工具到底执行到哪一步。
   *
   * 幂等，可以随便调用；在列表和确认前各跑一次，保证用户看到的都是真实状态。
   */
  private async reclaimStale(companyId: number, userId: number): Promise<void> {
    await this.pendingRepo
      .createQueryBuilder()
      .update(AiPendingActionEntity)
      .set({
        status: 'failed',
        result: JSON.stringify({ error: '执行中断（服务重启或超时），请重新发起' }),
        confirmedAt: new Date(),
      })
      .where('company_id = :companyId AND user_id = :userId AND status = :status', {
        companyId,
        userId,
        status: 'executing',
      })
      .andWhere('claimed_at < :deadline', { deadline: new Date(Date.now() - CLAIM_LEASE_MS) })
      .execute();
  }

  /**
   * 取消提案。必须用条件 UPDATE 抢占，不能「先查状态再无条件改」。
   *
   * 为什么：confirm 持有该行的排他锁直到事务提交。并发的 cancel 先读到快照
   * status='pending' 通过校验，然后阻塞在 confirm 的行锁上，等 confirm 提交后
   * 把 status 覆盖成 cancelled —— 结果就是动作**已经执行了**（库存已扣），
   * 但审计记录显示「已取消」。条件 UPDATE 后这种情况 affectedRows = 0。
   */
  async cancel(id: number, user: TenantContextData): Promise<{ ok: boolean }> {
    await this.mustFindOwn(id, user);
    await this.reclaimStale(user.companyId, user.userId ?? -1);
    const result = await this.pendingRepo.update(
      { id, companyId: user.companyId, userId: user.userId ?? -1, status: 'pending' },
      { status: 'cancelled' },
    );
    if ((result.affected ?? 0) === 0) {
      throw new BusinessException('该提案已处理', 40038);
    }
    return { ok: true };
  }

  private async mustFindOwn(id: number, user: TenantContextData): Promise<AiPendingActionEntity> {
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
