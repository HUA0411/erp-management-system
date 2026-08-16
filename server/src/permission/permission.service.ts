import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/role.entity';
import { TenantContext } from '../tenant/tenant-context';

interface PermissionNode {
  id: number;
  parentId: number;
  name: string;
  code: string;
  type: 'menu' | 'button';
  path?: string;
  icon?: string;
  sort: number;
  children?: PermissionNode[];
}

/**
 * 权限服务：提供当前用户权限码（带 30s 内存 TTL 缓存，角色变更时主动失效）。
 * 生产多实例场景可替换为 Redis 缓存（见 README「Redis 升级路径」）。
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private readonly cache = new Map<string, { ts: number; codes: string[] }>();
  private readonly TTL_MS = 30_000;

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
  ) {}

  /** 查询用户拥有的全部权限码（角色→权限，去重） */
  async getUserPermissionCodes(userId: number, companyId: number): Promise<string[]> {
    const key = `${companyId}:${userId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.ts < this.TTL_MS) return hit.codes;

    const rows = await this.permissionRepo
      .createQueryBuilder('p')
      .innerJoin(RolePermissionEntity, 'rp', 'rp.permission_id = p.id')
      .innerJoin(UserRoleEntity, 'ur', 'ur.role_id = rp.role_id')
      .innerJoin('sys_role', 'r', 'r.id = rp.role_id AND r.company_id = :cid AND r.status = 1')
      .where('ur.user_id = :uid', { uid: userId, cid: companyId })
      .andWhere('p.status = 1')
      .select('DISTINCT p.code', 'code')
      .getRawMany<{ code: string }>();

    const codes = rows.map((r) => r.code);
    this.cache.set(key, { ts: Date.now(), codes });
    return codes;
  }

  /** 角色变更后调用，使该用户的权限缓存失效 */
  invalidateUser(userId: number): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${userId}`)) this.cache.delete(key);
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  /** 全部权限树（系统管理页/角色授权用） */
  async getAllTree(): Promise<PermissionNode[]> {
    const list = await this.permissionRepo.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'ASC' },
    });
    return this.buildTree(list);
  }

  /** 当前用户可见的菜单树（侧边栏动态渲染）：
   * 递归过滤：只保留 type=menu 的节点；父节点有权限或有可见子节点则保留 */
  async getMenuTreeForUser(userId: number, companyId: number): Promise<PermissionNode[]> {
    const all = await this.getAllTree();
    const codes = await this.getUserPermissionCodes(userId, companyId);
    const codeSet = new Set(codes);
    const isSuper = TenantContext.isSuperAdmin;

    const filterMenus = (nodes: PermissionNode[]): PermissionNode[] => {
      const result: PermissionNode[] = [];
      for (const n of nodes) {
        if (n.type !== 'menu') continue;
        const children = n.children?.length ? filterMenus(n.children) : [];
        const selfOk = isSuper || codeSet.has(n.code);
        if (selfOk || children.length > 0) {
          result.push({ ...n, children });
        }
      }
      return result;
    };

    return filterMenus(all);
  }

  private buildTree(list: PermissionNode[]): PermissionNode[] {
    const map = new Map<number, PermissionNode>();
    const roots: PermissionNode[] = [];
    for (const item of list) map.set(item.id, { ...item, children: [] });
    for (const item of map.values()) {
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(item);
      } else {
        roots.push(item);
      }
    }
    return roots;
  }

  /** 更新权限基本信息（名称/图标/排序/路由） */
  async updatePermission(id: number, patch: Partial<PermissionEntity>): Promise<void> {
    await this.permissionRepo.update({ id }, {
      name: patch.name,
      icon: patch.icon,
      sort: patch.sort,
      path: patch.path,
    });
    this.invalidateAll();
    this.logger.log(`permission #${id} updated`);
  }

  async rolePermissionIds(roleId: number): Promise<number[]> {
    const rows = await this.rolePermissionRepo.find({ where: { roleId } });
    return rows.map((r) => r.permissionId);
  }

  async setRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    await this.rolePermissionRepo.delete({ roleId });
    if (permissionIds.length) {
      await this.rolePermissionRepo.insert(
        permissionIds.map((permissionId) => ({ roleId, permissionId })),
      );
    }
    const userIds = await this.userRoleRepo.find({ where: { roleId } });
    userIds.forEach((u) => this.invalidateUser(u.userId));
  }

  async userRoleIds(userId: number): Promise<number[]> {
    const rows = await this.userRoleRepo.find({ where: { userId } });
    return rows.map((r) => r.roleId);
  }

  async setUserRoles(userId: number, roleIds: number[]): Promise<void> {
    const valid = await this.userRoleRepo.find({ where: { userId } });
    await this.userRoleRepo.delete({ userId });
    if (roleIds.length) {
      await this.userRoleRepo.insert(roleIds.map((roleId) => ({ userId, roleId })));
    }
    this.invalidateUser(userId);
  }

  async permissionEntitiesByIds(ids: number[]): Promise<PermissionEntity[]> {
    if (!ids.length) return [];
    return this.permissionRepo.find({ where: { id: In(ids), status: 1 } });
  }
}
