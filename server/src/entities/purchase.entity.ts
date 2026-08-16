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
import type { OrderStatus } from '@erp/shared';

@Entity('purchase_order')
@Unique(['companyId', 'orderNo'])
export class PurchaseOrderEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  orderNo: string;

  @Column({ type: 'int' })
  supplierId: number;

  @Column({ length: 64, comment: '冗余供应商名' })
  supplierName: string;

  @Column({ type: 'date' })
  orderDate: string;

  @Column(decimalColumn(12, 2, { comment: '订单总额' }))
  totalAmount: number;

  @Column(decimalColumn(12, 2, { comment: '已付金额' }))
  paidAmount: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: OrderStatus;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('purchase_order_item')
export class PurchaseOrderItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  orderId: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ length: 64, comment: '冗余商品名' })
  productName: string;

  @Column({ length: 64, nullable: true })
  spec: string;

  @Column({ length: 16, nullable: true })
  unit: string;

  @Column(decimalColumn(12, 2))
  quantity: number;

  @Column(decimalColumn(12, 2))
  price: number;

  @Column(decimalColumn(12, 2))
  amount: number;
}
