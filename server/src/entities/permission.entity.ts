import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { PermissionType } from '@erp/shared';

/** 权限（菜单+按钮）全局模板，与租户无关，所有公司共用同一套权限体系 */
@Entity('sys_permission')
export class PermissionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', default: 0 })
  parentId: number;

  @Column({ length: 32 })
  name: string;

  @Column({ length: 64, unique: true, comment: '权限码，如 sale:order:outbound' })
  code: string;

  @Column({ type: 'varchar', length: 16 })
  type: PermissionType;

  @Column({ length: 128, nullable: true, comment: '前端路由路径' })
  path: string;

  @Column({ length: 32, nullable: true, comment: '图标名' })
  icon: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;
}
