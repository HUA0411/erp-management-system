import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';
import { decimalColumn } from '../common/utils/decimal';
import type { InventoryRecordType } from '@erp/shared';

@Entity('inventory')
@Unique(['companyId', 'productId'])
export class InventoryEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  @Column(decimalColumn(12, 2, { comment: '当前库存数量' }))
  quantity: number;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('inventory_record')
export class InventoryRecordEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ length: 64, comment: '冗余商品名（列表免 join）' })
  productName: string;

  @Column({ type: 'varchar', length: 16 })
  type: InventoryRecordType;

  @Column(decimalColumn(12, 2, { comment: '本次变动数量（出库为负）' }))
  quantity: number;

  @Column(decimalColumn(12, 2, { comment: '变动后结余' }))
  balanceAfter: number;

  @Column({ length: 32, comment: '来源类型，如 SALE_OUTBOUND' })
  refType: string;

  @Column({ length: 64, comment: '来源单号' })
  refNo: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ length: 32, nullable: true })
  operator: string;

  @CreateDateColumn()
  createdAt: Date;
}
