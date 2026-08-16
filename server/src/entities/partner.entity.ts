import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';

@Entity('supplier')
@Unique(['companyId', 'code'])
export class SupplierEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  code: string;

  @Column({ length: 64 })
  name: string;

  @Column({ length: 32, nullable: true })
  contact: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 200, nullable: true })
  address: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('customer')
@Unique(['companyId', 'code'])
export class CustomerEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  code: string;

  @Column({ length: 64 })
  name: string;

  @Column({ length: 32, nullable: true })
  contact: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 200, nullable: true })
  address: string;

  @Column({ length: 32, nullable: true, comment: '客户等级' })
  level: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
