import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

@Entity('sys_operation_log')
export class OperationLogEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  userId: number;

  @Column({ length: 32, nullable: true })
  username: string;

  @Column({ length: 32, comment: '模块' })
  module: string;

  @Column({ length: 64, comment: '动作' })
  action: string;

  @Column({ length: 8 })
  method: string;

  @Column({ length: 128 })
  path: string;

  @Column({ type: 'text', nullable: true, comment: '请求参数（截断）' })
  params: string;

  @Column({ length: 64, nullable: true })
  ip: string;

  @CreateDateColumn()
  createdAt: Date;
}
