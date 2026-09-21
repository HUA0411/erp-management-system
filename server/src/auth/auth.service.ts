import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { TenantEntity } from '../entities/tenant.entity';
import { UserEntity } from '../entities/user.entity';
import { RoleEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionService } from '../permission/permission.service';
import { BusinessException } from '../common/exceptions/business.exception';
import type { LoginResult, RoleBrief, UserInfo } from '@erp/shared';
import type { JwtPayload } from '../tenant/tenant.middleware';

/**
 * 固定的假 bcrypt 哈希（明文 'not-a-real-password'）。
 * 用户不存在时拿它跑一次比对，让「用户不存在」和「密码错误」两条路径耗时一致，
 * 消除可被用来枚举用户名的时序差。值本身没有意义，也不需要能对上任何密码。
 */
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/** 连续失败多少次锁定 */
const MAX_LOGIN_FAILURES = 5;
/** 锁定时长（毫秒） */
const LOGIN_LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly permissionService: PermissionService,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoleRepo: Repository<UserRoleEntity>,
  ) {}

  async login(companyCode: string, username: string, password: string): Promise<LoginResult> {
    /**
     * 三种失败（公司编码不存在 / 公司停用 / 用户不存在 / 密码错误）**必须返回完全一样的
     * 错误码和文案**，否则就是一台免费的枚举机器：
     * 攻击者拿一份公司名列表逐个试，凭 40101 和 40102 的差别就能筛出哪些公司真实存在，
     * 再针对性地去爆破用户名和密码。统一成一句「公司编码、用户名或密码错误」，
     * 攻击者什么额外信息都拿不到，而正常用户照样看得懂。
     */
    const genericFail = new BusinessException('公司编码、用户名或密码错误', 40101);

    const tenant = await this.tenantRepo.findOne({ where: { code: companyCode } });
    if (!tenant || tenant.status !== 1) {
      // 即使这里已经能判定失败，也要走一遍 bcrypt 再返回（见下）
      this.burnPasswordCompare(password);
      throw genericFail;
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.company_id = :cid', { cid: tenant.id })
      .andWhere('u.username = :username', { username })
      .getOne();

    /**
     * 时序攻击：`!user || !bcrypt.compareSync(...)` 是短路的 —— 用户不存在时直接跳过
     * bcrypt 比对（一次 bcrypt 约几十到上百毫秒，占了整个请求的绝大部分耗时）。
     * 于是「响应特别快」就等于「这个用户名不存在」，攻击者不用看任何错误文案就能
     * 把用户名一个个枚举出来。
     * 所以用户不存在时也对一个固定的假哈希跑一次同样的比对，让两条路径耗时一致。
     */
    const passwordOk = bcrypt.compareSync(password, user?.password ?? DUMMY_BCRYPT_HASH);
    if (!user || !passwordOk) {
      if (user) await this.recordLoginFailure(user);
      throw genericFail;
    }

    /**
     * 账号级锁定，跨进程有效。
     *
     * 控制器上的 @Throttle 是按 IP 计数、且计数器存在**单个 Node 进程的内存里**；
     * PM2 集群模式（ecosystem.config.js 里 instances: 'max'）起 N 个进程，
     * 实际放行量就变成 8×N，而且攻击者换 IP 就完全绕开。
     * 锁定写在数据库里，与进程数、来源 IP 都无关，直接掐死对某个账号的爆破。
     *
     * 注意：这条检查放在密码校验**之后** —— 只有密码正确才会看到「账号已锁定」，
     * 不知道密码的人依旧只拿到那句统一的错误，不泄漏账号是否存在。
     */
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new BusinessException(`账号因多次登录失败已被临时锁定，请 ${mins} 分钟后再试`, 40104);
    }
    if (user.status !== 1) {
      throw new BusinessException('账号已停用，请联系管理员', 40103);
    }
    await this.clearLoginFailures(user);

    const token = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      companyId: user.companyId,
      isSuperAdmin: !!user.isSuperAdmin,
      // 签发时的密码版本：后续请求据此判断 token 是否已被吊销
      pwdAt: user.pwdChangedAt ? new Date(user.pwdChangedAt).getTime() : 0,
    } satisfies JwtPayload);

    return { token, user: await this.buildUserInfo(user, tenant) };
  }

  /** 空跑一次 bcrypt，用于抹平「用户不存在」与「密码错误」的耗时差 */
  private burnPasswordCompare(password: string): void {
    bcrypt.compareSync(password, DUMMY_BCRYPT_HASH);
  }

  /**
   * 记一次登录失败，达到阈值就锁定账号。写库而不是写内存：
   * 内存计数器在 PM2 集群下每个进程各算一份，锁定就失效了。
   */
  private async recordLoginFailure(user: UserEntity): Promise<void> {
    const attempts = (user.failedAttempts ?? 0) + 1;
    const patch: Partial<UserEntity> = { failedAttempts: attempts };
    if (attempts >= MAX_LOGIN_FAILURES) {
      patch.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      patch.failedAttempts = 0; // 锁定期满后重新计数
      this.logger.warn(
        `账号 ${user.username} 连续登录失败 ${attempts} 次，已锁定至 ${patch.lockedUntil.toISOString()}`,
      );
    }
    await this.userRepo.update({ id: user.id }, patch);
  }

  private async clearLoginFailures(user: UserEntity): Promise<void> {
    if ((user.failedAttempts ?? 0) === 0 && !user.lockedUntil) return;
    await this.userRepo.update({ id: user.id }, { failedAttempts: 0, lockedUntil: null });
  }

  /** 根据 userId 构建用户信息（profile 用） */
  async buildUserInfo(user: UserEntity, tenant: TenantEntity): Promise<UserInfo> {
    const roleRows = await this.userRoleRepo.find({ where: { userId: user.id } });
    const roleIds = roleRows.map((r) => r.roleId);
    const roles: RoleBrief[] = roleIds.length
      ? (
          await this.roleRepo.find({
            where: { id: In(roleIds), companyId: user.companyId, status: 1 },
          })
        ).map((r) => ({ id: r.id, name: r.name, code: r.code }))
      : [];

    const permissions = await this.permissionService.getUserPermissionCodes(user.id, user.companyId);
    const menus = await this.permissionService.getMenuTreeForUser(user.id, user.companyId);

    return {
      id: user.id,
      companyId: user.companyId,
      companyCode: tenant.code,
      companyName: tenant.name,
      username: user.username,
      realName: user.realName ?? user.username,
      phone: user.phone ?? undefined,
      email: user.email ?? undefined,
      isSuperAdmin: !!user.isSuperAdmin,
      roles,
      permissions,
      menus,
    };
  }

  async getProfile(userId: number, companyId: number): Promise<UserInfo> {
    const user = await this.userRepo.findOne({ where: { id: userId, companyId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const tenant = await this.tenantRepo.findOne({ where: { id: companyId } });
    if (!tenant) throw new UnauthorizedException('租户不存在');
    return this.buildUserInfo(user, tenant);
  }

  async changePassword(userId: number, companyId: number, oldPassword: string, newPassword: string) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :uid', { uid: userId })
      .andWhere('u.company_id = :cid', { cid: companyId })
      .getOne();
    if (!user) throw new UnauthorizedException('用户不存在');
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      throw new BusinessException('原密码错误', 40104);
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    // 同时刷新 pwd_changed_at：本次及此前签发的所有 token 会在 5 秒内全部失效
    await this.userRepo.update({ id: user.id }, { password: hash, pwdChangedAt: new Date() });
    return { ok: true };
  }

  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });
  }
}
