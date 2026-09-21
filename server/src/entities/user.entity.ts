import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
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

  /** 密码最后修改时间：token 里带签发时的值，不一致即视为会话失效（改密码/重置密码后立即生效） */
  @Column({ type: 'datetime', precision: 6, nullable: true, comment: '密码最后修改时间，用于吊销旧 JWT' })
  pwdChangedAt: Date | null;

  /**
   * 连续登录失败次数。达到阈值即锁定账号，成功登录后清零。
   * 放在数据库而不是进程内存里：PM2 集群下每个进程各有一份内存计数器，
   * 那样实际放行量会变成「限制 × 进程数」，锁定形同虚设。
   */
  @Column({ type: 'int', default: 0, comment: '连续登录失败次数' })
  failedAttempts: number;

  @Column({ type: 'datetime', nullable: true, comment: '锁定截止时间' })
  lockedUntil: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
