import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RoleEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionService } from '../permission/permission.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { TenantContext } from '../tenant/tenant-context';
import type { PageResult, RoleItem } from '@erp/shared';
import { formatDateTime } from '../common/utils/no-generator';

export interface RoleQuery {
  page: number;
  pageSize: number;
  keyword?: string;
}

export interface RoleWithPermissions extends RoleItem {
  permissionIds: number[];
  status: number;
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoleRepo: Repository<UserRoleEntity>,
    private readonly permissionService: PermissionService,
  ) {}

  async list(query: RoleQuery): Promise<PageResult<RoleWithPermissions>> {
    const { page, pageSize, keyword } = query;
    const companyId = TenantContext.companyId;
    const qb = this.roleRepo.createQueryBuilder('r').where('r.company_id = :cid', { cid: companyId });
    if (keyword) qb.andWhere('(r.name LIKE :kw OR r.code LIKE :kw)', { kw: `%${keyword}%` });

    const [rows, total] = await qb
      .orderBy('r.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const list: RoleWithPermissions[] = [];
    for (const r of rows) {
      const permissionIds = await this.permissionService.rolePermissionIds(r.id);
      list.push({
        id: r.id,
        name: r.name,
        code: r.code,
        remark: r.remark ?? undefined,
        status: r.status,
        permissionIds,
        createdAt: formatDateTime(r.createdAt),
      });
    }
    return { list, total, page, pageSize };
  }

  /** 全部角色（下拉选择用） */
  async allOptions(): Promise<RoleItem[]> {
    const rows = await this.roleRepo.find({
      where: { companyId: TenantContext.companyId, status: 1 },
      order: { id: 'ASC' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, remark: r.remark ?? undefined }));
  }

  async create(data: {
    name: string;
    code: string;
    remark?: string;
    permissionIds?: number[];
  }): Promise<RoleWithPermissions> {
    const companyId = TenantContext.companyId;
    const exists = await this.roleRepo.findOne({ where: { companyId, code: data.code } });
    if (exists) throw new BusinessException('角色编码已存在', 40005);

    const role = await this.roleRepo.save(
      this.roleRepo.create({
        companyId,
        name: data.name,
        code: data.code.toUpperCase(),
        remark: data.remark,
      }),
    );
    if (data.permissionIds?.length) {
      await this.permissionService.setRolePermissions(role.id, data.permissionIds);
    }
    this.logger.log(`role created: ${role.code}`);
    return this.findOne(role.id);
  }

  async update(
    id: number,
    data: { name?: string; remark?: string; status?: number; permissionIds?: number[] },
  ): Promise<RoleWithPermissions> {
    const companyId = TenantContext.companyId;
    const role = await this.roleRepo.findOne({ where: { id, companyId } });
    if (!role) throw new BusinessException('角色不存在', 40401);
    if (role.code === 'SUPER_ADMIN' && data.status === 0) {
      throw new BusinessException('不能停用超级管理员角色', 40006);
    }
    await this.roleRepo.update({ id }, {
      name: data.name ?? role.name,
      remark: data.remark ?? role.remark,
      status: data.status ?? role.status,
    });
    if (data.permissionIds) {
      await this.permissionService.setRolePermissions(id, data.permissionIds);
    }
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const companyId = TenantContext.companyId;
    const role = await this.roleRepo.findOne({ where: { id, companyId } });
    if (!role) throw new BusinessException('角色不存在', 40401);
    if (role.code === 'SUPER_ADMIN') throw new BusinessException('不能删除超级管理员角色', 40006);
    const used = await this.userRoleRepo.count({ where: { roleId: id } });
    if (used > 0) throw new BusinessException(`该角色已被 ${used} 个用户使用，请先解绑`, 40007);
    await this.roleRepo.delete({ id });
    await this.permissionService.setRolePermissions(id, []);
    this.logger.log(`role deleted: ${role.code}`);
  }

  async findOne(id: number): Promise<RoleWithPermissions> {
    const companyId = TenantContext.companyId;
    const role = await this.roleRepo.findOne({ where: { id, companyId } });
    if (!role) throw new BusinessException('角色不存在', 40401);
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      remark: role.remark ?? undefined,
      status: role.status,
      permissionIds: await this.permissionService.rolePermissionIds(id),
      createdAt: formatDateTime(role.createdAt),
    };
  }

  async userCountByRoleIds(roleIds: number[]): Promise<Map<number, number>> {
    if (!roleIds.length) return new Map();
    const rows = await this.userRoleRepo.find({ where: { roleId: In(roleIds) } });
    const map = new Map<number, number>();
    for (const r of rows) map.set(r.roleId, (map.get(r.roleId) ?? 0) + 1);
    return map;
  }
}
