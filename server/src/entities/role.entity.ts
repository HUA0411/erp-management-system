import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

@Entity('sys_role')
@Unique(['companyId', 'code'])
export class RoleEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  name: string;

  @Column({ length: 32, comment: '角色编码，如 SUPER_ADMIN' })
  code: string;

  @Column({ length: 200, nullable: true })
  remark: string;

  @Column({ type: 'tinyint', default: 1, comment: '0停用 1启用' })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('sys_role_permission')
@Unique(['roleId', 'permissionId'])
export class RolePermissionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  roleId: number;

  @Column({ type: 'int' })
  permissionId: number;
}

@Entity('sys_user_role')
@Unique(['userId', 'roleId'])
export class UserRoleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  roleId: number;
}
