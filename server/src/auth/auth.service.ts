import { Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
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
    const tenant = await this.tenantRepo.findOne({ where: { code: companyCode } });
    if (!tenant || tenant.status !== 1) {
      throw new BusinessException('公司编码不存在或已停用', 40101);
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.company_id = :cid', { cid: tenant.id })
      .andWhere('u.username = :username', { username })
      .getOne();

    if (!user || !bcrypt.compareSync(password, user.password)) {
      throw new BusinessException('用户名或密码错误', 40102);
    }
    if (user.status !== 1) {
      throw new BusinessException('账号已停用，请联系管理员', 40103);
    }

    const token = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      companyId: user.companyId,
      isSuperAdmin: !!user.isSuperAdmin,
    } satisfies JwtPayload);

    return { token, user: await this.buildUserInfo(user, tenant) };
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

    const permissions = await this.permissionService.getUserPermissionCodes(
      user.id,
      user.companyId,
    );
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
    await this.userRepo.update({ id: user.id }, { password: hash });
    return { ok: true };
  }

  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });
  }
}
