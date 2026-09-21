import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity, RolePermissionEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/role.entity';
import { TenantContext } from '../tenant/tenant-context';
import { BusinessException } from '../common/exceptions/business.exception';

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
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
  /**
   * 修改权限（菜单名 / 图标 / 排序 / 前端路由）。
   *
   * 权限表是**全局的** —— `sys_permission` 没有 company_id，所有租户共用同一套菜单定义。
   * 而种子数据给每个租户的 SUPER_ADMIN 角色都授了 `system:permission:update`，
   * 意味着任意一个租户的管理员都能改掉**所有租户**看到的菜单名称、图标和前端路由。
   * 这不只是越权：改掉 `path` 还能把别的租户的用户导向任意前端路由。
   *
   * 所以这里再收一道 —— 只有平台超管（isSuperAdmin，跨租户运维账号）能改。
   */
  async updatePermission(id: number, patch: Partial<PermissionEntity>): Promise<void> {
    if (!TenantContext.get()?.isSuperAdmin) {
      throw new BusinessException('权限定义是平台级配置，仅平台超级管理员可修改', 40007);
    }
    await this.permissionRepo.update(
      { id },
      {
        name: patch.name,
        icon: patch.icon,
        sort: patch.sort,
        path: patch.path,
      },
    );
    this.invalidateAll();
    this.logger.log(`permission #${id} updated`);
  }

  async rolePermissionIds(roleId: number): Promise<number[]> {
    const rows = await this.rolePermissionRepo.find({ where: { roleId } });
    return rows.map((r) => r.permissionId);
  }

  /**
   * 批量版：一次查回多个角色的权限，返回 roleId → permissionIds 映射。
   * 角色列表页原先在循环里逐个 await 单角色版本，pageSize=100 就是 101 次查询。
   */
  async rolePermissionIdsBatch(roleIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (!roleIds.length) return map;
    const rows = await this.rolePermissionRepo.find({ where: { roleId: In(roleIds) } });
    for (const r of rows) {
      const list = map.get(r.roleId);
      if (list) list.push(r.permissionId);
      else map.set(r.roleId, [r.permissionId]);
    }
    return map;
  }

  /** 当前租户里超管角色的 id 列表（用于授权时的提权防护） */
  async superAdminRoleIds(companyId: number): Promise<number[]> {
    const rows = await this.roleRepo.find({ where: { companyId, code: 'SUPER_ADMIN' } });
    return rows.map((r) => r.id);
  }

  /**
   * 「先 delete 再 insert」必须包在一个事务里。
   * 两步是各自独立提交的：insert 阶段一旦失败（DB 抖动、字段超长、并发冲突），
   * delete 已经落地，角色就变成**零权限**，所有关联用户当场失去全部访问权，
   * 而且没有任何回滚路径。包进事务后要么全成、要么全不动。
   */
  async setRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RolePermissionEntity).delete({ roleId });
      if (permissionIds.length) {
        await manager
          .getRepository(RolePermissionEntity)
          .insert(permissionIds.map((permissionId) => ({ roleId, permissionId })));
      }
    });
    const userIds = await this.userRoleRepo.find({ where: { roleId } });
    userIds.forEach((u) => this.invalidateUser(u.userId));
  }

  async userRoleIds(userId: number): Promise<number[]> {
    const rows = await this.userRoleRepo.find({ where: { userId } });
    return rows.map((r) => r.roleId);
  }

  /** 同上：用户角色变更也必须原子，否则用户可能变成「无任何角色」 */
  async setUserRoles(userId: number, roleIds: number[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UserRoleEntity).delete({ userId });
      if (roleIds.length) {
        await manager.getRepository(UserRoleEntity).insert(roleIds.map((roleId) => ({ userId, roleId })));
      }
    });
    this.invalidateUser(userId);
  }

  async permissionEntitiesByIds(ids: number[]): Promise<PermissionEntity[]> {
    if (!ids.length) return [];
    return this.permissionRepo.find({ where: { id: In(ids), status: 1 } });
  }
}
