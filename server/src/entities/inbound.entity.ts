import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';
import { decimalColumn } from '../common/utils/decimal';

@Entity('purchase_inbound')
@Unique(['companyId', 'inboundNo'])
export class PurchaseInboundEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  inboundNo: string;

  @Column({ type: 'int', nullable: true, comment: '关联采购订单，直接入库为空' })
  orderId: number;

  @Column({ type: 'int' })
  supplierId: number;

  @Column({ length: 64 })
  supplierName: string;

  @Column({ type: 'date' })
  inboundDate: string;

  @Column(decimalColumn(12, 2))
  totalAmount: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('purchase_inbound_item')
export class PurchaseInboundItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  inboundId: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ length: 64 })
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
