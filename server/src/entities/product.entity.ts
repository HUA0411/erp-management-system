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

@Entity('product')
@Unique(['companyId', 'code'])
export class ProductEntity extends TenantBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', default: 0 })
  categoryId: number;

  @Column({ length: 32, comment: '商品编码' })
  code: string;

  @Column({ length: 64 })
  name: string;

  @Column({ length: 64, nullable: true, comment: '规格型号' })
  spec: string;

  @Column({ length: 16, nullable: true, comment: '单位' })
  unit: string;

  @Column(decimalColumn(12, 2, { comment: '采购价' }))
  purchasePrice: number;

  @Column(decimalColumn(12, 2, { comment: '销售价' }))
  salePrice: number;

  @Column(decimalColumn(12, 2, { comment: '安全库存，低于则预警' }))
  safetyStock: number;

  @Column({ type: 'int', nullable: true, comment: '默认供应商（可更换或解除绑定）' })
  supplierId: number;

  @Column({ length: 255, nullable: true, comment: '图片 URL' })
  image: string;

  @Column({ length: 255, nullable: true })
  remark: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
