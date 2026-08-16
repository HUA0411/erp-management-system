import { Column } from 'typeorm';

/**
 * 所有业务实体（含用户/角色）的租户基类：强制携带 company_id 实现行级隔离。
 */
export abstract class TenantBaseEntity {
  @Column({ type: 'int', comment: '所属租户' })
  companyId: number;
}
