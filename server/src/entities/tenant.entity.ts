import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenant')
export class TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32, unique: true, comment: '公司编码（登录用）' })
  code: string;

  @Column({ length: 64, comment: '公司名称' })
  name: string;

  @Column({ type: 'tinyint', default: 1, comment: '0停用 1启用' })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
