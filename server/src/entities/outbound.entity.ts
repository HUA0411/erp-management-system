import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';
import { decimalColumn } from '../common/utils/decimal';

@Entity('sale_outbound')
@Unique(['companyId', 'outboundNo'])
export class SaleOutboundEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  outboundNo: string;

  @Column({ type: 'int', nullable: true })
  orderId: number;

  @Column({ type: 'int' })
  customerId: number;

  @Column({ length: 64 })
  customerName: string;

  @Column({ type: 'date' })
  outboundDate: string;

  @Column(decimalColumn(12, 2))
  totalAmount: number;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('sale_outbound_item')
export class SaleOutboundItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  outboundId: number;

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
