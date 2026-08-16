import 'dotenv/config';
import 'reflect-metadata';
import dataSource from '../database/data-source';
import { TenantEntity } from '../entities/tenant.entity';
import { SeedService } from './seed.service';

/** 业务数据表（清空后保留权限/角色/用户/租户模板） */
const BUSINESS_TABLES = [
  'product_category',
  'product',
  'supplier',
  'customer',
  'purchase_order',
  'purchase_order_item',
  'purchase_inbound',
  'purchase_inbound_item',
  'sale_order',
  'sale_order_item',
  'sale_outbound',
  'sale_outbound_item',
  'inventory',
  'inventory_record',
  'stocktake',
  'stocktake_item',
  'payment',
  'sys_operation_log',
];

/**
 * db:reset —— 清空全部业务数据，保留系统模板（权限树/角色/用户/租户）。
 * 传 --demo 参数则在清空后重新注入演示业务数据（等价于把系统恢复出厂并带演示数据）。
 */
async function main(): Promise<void> {
  const withDemo = process.argv.includes('--demo');
  await dataSource.initialize();
  console.log('[db:reset] 数据库连接成功');

  await dataSource.transaction(async (manager) => {
    // 1. 清空业务表
    for (const table of BUSINESS_TABLES) {
      await manager.query(`TRUNCATE TABLE \`${table}\``);
    }
    console.log(`[db:reset] 已清空 ${BUSINESS_TABLES.length} 张业务表`);

    // 2. 模板不存在时重建（全新库场景），保证 reset 后系统可用
    const demoExists = await manager.getRepository(TenantEntity).findOne({ where: { code: 'DEMO' } });
    if (!demoExists) {
      const seed = new SeedService(dataSource);
      await seed.seedTemplate(manager);
      console.log('[db:reset] 系统模板（权限/角色/用户/租户）已创建');
    } else {
      console.log('[db:reset] 系统模板已存在，保留');
    }

    // 3. 可选：重新注入演示业务数据
    if (withDemo) {
      const demo = await manager.getRepository(TenantEntity).findOne({ where: { code: 'DEMO' } });
      const seed = new SeedService(dataSource);
      await seed.seedBusiness(manager, demo!.id);
      console.log('[db:reset] 演示业务数据已重新注入');
    }
  });

  console.log(withDemo ? '[db:reset] 完成（含演示数据）' : '[db:reset] 完成（干净模板，可直接录入客户数据）');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('[db:reset] 失败:', err);
  process.exit(1);
});
