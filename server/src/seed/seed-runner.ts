import 'dotenv/config';
import 'reflect-metadata';
import dataSource from '../database/data-source';
import { SeedService } from './seed.service';

async function main(): Promise<void> {
  await dataSource.initialize();
  console.log('[seed] 数据库连接成功');
  const seedService = new SeedService(dataSource);
  await seedService.seed();
  await dataSource.destroy();
  console.log('[seed] 完成');
}

main().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
