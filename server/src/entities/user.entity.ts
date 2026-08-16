import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

@Entity('sys_user')
@Unique(['companyId', 'username'])
export class UserEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32, comment: '登录名' })
  username: string;

  @Column({ length: 100, select: false, comment: 'bcrypt 哈希' })
  password: string;

  @Column({ length: 32, nullable: true })
  realName: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 64, nullable: true })
  email: string;

  @Column({ type: 'tinyint', default: 1, comment: '0停用 1启用' })
  status: number;

  @Column({ type: 'tinyint', default: 0, comment: '平台超管（跨租户运维）' })
  isSuperAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
