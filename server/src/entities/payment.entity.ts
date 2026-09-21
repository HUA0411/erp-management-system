import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TenantBaseEntity } from '../tenant/tenant-base.entity';
import { decimalColumn } from '../common/utils/decimal';
import type { PartnerType, PaymentType } from '@erp/shared';

@Entity('payment')
@Unique(['companyId', 'docNo'])
@Unique(['companyId', 'requestId'])
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

  /**
   * 幂等键：前端在**打开登记弹窗时**生成一个 UUID，同一次填写提交多少次都带同一个值。
   *
   * 为什么需要：`(company_id, doc_no)` 唯一索引挡不住重复登记 —— docNo 是服务端每次
   * 现取的序号，两次请求必然不同号，两张单都会落库，往来账直接翻倍。
   * 真正的重复来源是「双击提交」「网络重试」「请求超时后用户再点一次」，
   * 这些场景下**业务意图只有一个**，所以要用客户端提供的幂等键去重。
   * 唯一索引放在数据库层，应用层即使判断失误也拦得住（errno 1062）。
   */
  @Column({ length: 64, nullable: true, comment: '幂等键（客户端生成 UUID）' })
  requestId: string;

  @Column({ type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn()
  createdAt: Date;
}
