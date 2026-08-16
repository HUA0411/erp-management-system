import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';
import { decimalColumn } from '../common/utils/decimal';
import type { PartnerType, PaymentType } from '@erp/shared';

@Entity('payment')
@Unique(['companyId', 'docNo'])
export class PaymentEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  docNo: string;

  @Column({ type: 'varchar', length: 16, comment: 'pay=付款给供应商 receive=客户收款' })
  type: PaymentType;

  @Column({ type: 'varchar', length: 16 })
  partnerType: PartnerType;

  @Column({ type: 'int' })
  partnerId: number;

  @Column({ length: 64 })
  partnerName: string;

  @Column(decimalColumn(12, 2))
  amount: number;

  @Column({ length: 32, nullable: true, comment: '关联订单号' })
  orderNo: string;

  @Column({ type: 'date' })
  payDate: string;

  @Column({ length: 32, nullable: true, comment: '支付方式' })
  method: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}
