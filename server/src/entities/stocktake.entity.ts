import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';
import { decimalColumn } from '../common/utils/decimal';
import type { StocktakeStatus } from '@erp/shared';

@Entity('stocktake')
@Unique(['companyId', 'stocktakeNo'])
export class StocktakeEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  stocktakeNo: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: StocktakeStatus;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('stocktake_item')
export class StocktakeItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  stocktakeId: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ length: 64 })
  productName: string;

  @Column(decimalColumn(12, 2, { comment: '账面数量' }))
  bookQty: number;

  @Column(decimalColumn(12, 2, { comment: '实盘数量' }))
  actualQty: number;

  @Column(decimalColumn(12, 2, { comment: '差异 = 实盘 - 账面' }))
  diffQty: number;
}
