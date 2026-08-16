import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../entities/user.entity';
import { RoleEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionService } from '../permission/permission.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { PageResult, RoleBrief, UserItem } from '@erp/shared';

export interface UserQuery {
  page: number;
  pageSize: number;
  keyword?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    private readonly permissionService: PermissionService,
  ) {}

  async list(query: UserQuery): Promise<PageResult<UserItem>> {
    const { page, pageSize, keyword } = query;
    const companyId = TenantContext.companyId;

    const qb = this.userRepo.createQueryBuilder('u').where('u.company_id = :cid', { cid: companyId });
    if (keyword) {
      qb.andWhere('(u.username LIKE :kw OR u.real_name LIKE :kw OR u.phone LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    const [rows, total] = await qb
      .orderBy('u.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const userIds = rows.map((u) => u.id);
    const roleMap = await this.buildRoleMap(userIds);

    return {
      list: rows.map((u) => ({
        id: u.id,
        username: u.username,
        realName: u.realName ?? '',
        phone: u.phone ?? undefined,
        email: u.email ?? undefined,
        status: u.status,
        isSuperAdmin: !!u.isSuperAdmin,
        roles: roleMap.get(u.id) ?? [],
        createdAt: u.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      })),
      total,
      page,
      pageSize,
    };
  }

  private async buildRoleMap(userIds: number[]): Promise<Map<number, RoleBrief[]>> {
    const map = new Map<number, RoleBrief[]>();
    if (!userIds.length) return map;
    const companyId = TenantContext.companyId;
    const links = await this.userRoleRepo.find({ where: { userId: In(userIds) } });
    const roleIds = [...new Set(links.map((l) => l.roleId))];
    if (!roleIds.length) return map;
    const roles = await this.roleRepo.find({ where: { id: In(roleIds), companyId } });
    const roleById = new Map(roles.map((r) => [r.id, r]));
    for (const l of links) {
      const role = roleById.get(l.roleId);
      if (!role) continue;
      const arr = map.get(l.userId) ?? [];
      arr.push({ id: role.id, name: role.name, code: role.code });
      map.set(l.userId, arr);
    }
    return map;
  }

  async create(data: {
    username: string;
    password: string;
    realName?: string;
    phone?: string;
    email?: string;
    status?: number;
    roleIds?: number[];
  }): Promise<UserItem> {
    const companyId = TenantContext.companyId;
    const exists = await this.userRepo.findOne({ where: { companyId, username: data.username } });
    if (exists) throw new BusinessException('用户名已存在', 40002);

    const user = await this.userRepo.save(
      this.userRepo.create({
        companyId,
        username: data.username,
        password: bcrypt.hashSync(data.password, 10),
        realName: data.realName,
        phone: data.phone,
        email: data.email,
        status: data.status ?? 1,
      }),
    );
    if (data.roleIds?.length) await this.permissionService.setUserRoles(user.id, data.roleIds);
    this.logger.log(`user created: ${user.username}`);
    return this.findOneItem(user.id);
  }

  async update(
    id: number,
    data: { realName?: string; phone?: string; email?: string; status?: number; roleIds?: number[] },
  ): Promise<UserItem> {
    const companyId = TenantContext.companyId;
    const user = await this.userRepo.findOne({ where: { id, companyId } });
    if (!user) throw new BusinessException('用户不存在', 40400);
    if (user.isSuperAdmin && data.status === 0) {
      throw new BusinessException('不能停用平台超级管理员', 40003);
    }
    await this.userRepo.update({ id }, {
      realName: data.realName ?? user.realName,
      phone: data.phone ?? user.phone,
      email: data.email ?? user.email,
      status: data.status ?? user.status,
    });
    if (data.roleIds) await this.permissionService.setUserRoles(id, data.roleIds);
    return this.findOneItem(id);
  }

  async resetPassword(id: number, password: string): Promise<void> {
    const companyId = TenantContext.companyId;
    const user = await this.userRepo.findOne({ where: { id, companyId } });
    if (!user) throw new BusinessException('用户不存在', 40400);
    await this.userRepo.update({ id }, { password: bcrypt.hashSync(password, 10) });
    this.logger.log(`password reset for user #${id}`);
  }

  async remove(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    const me = TenantContext.userId;
    if (id === me) throw new BusinessException('不能删除自己', 40004);
    const user = await this.userRepo.findOne({ where: { id, companyId } });
    if (!user) throw new BusinessException('用户不存在', 40400);
    if (user.isSuperAdmin) throw new BusinessException('不能删除平台超级管理员', 40003);
    await this.userRepo.update({ id }, { status: 0 });
    this.logger.log(`user #${id} disabled`);
  }

  private async findOneItem(id: number): Promise<UserItem> {
    const user = await this.userRepo.findOne({ where: { id, companyId: TenantContext.companyId } });
    if (!user) throw new BusinessException('用户不存在', 40400);
    const roleMap = await this.buildRoleMap([user.id]);
    return {
      id: user.id,
      username: user.username,
      realName: user.realName ?? '',
      phone: user.phone ?? undefined,
      email: user.email ?? undefined,
      status: user.status,
      isSuperAdmin: !!user.isSuperAdmin,
      roles: roleMap.get(user.id) ?? [],
    };
  }
}
