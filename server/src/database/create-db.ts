import 'dotenv/config';
import { createConnection } from 'mysql2/promise';

/** 连接时不指定 database，确保目标库存在（幂等） */
async function main(): Promise<void> {
  const conn = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  const db = process.env.DB_DATABASE || 'erp_system';
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${db}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  console.log(`[db:create] database "${db}" is ready`);
  await conn.end();
}

main().catch((err) => {
  console.error('[db:create] failed:', err.message);
  process.exit(1);
});
