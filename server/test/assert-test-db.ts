/**
 * e2e 的「禁止打到生产库」硬闸门。
 *
 * 背景：原先 e2e 直连 .env 里的 `erp_system`，`beforeAll` 会执行
 * `DELETE FROM ai_config` 等清库操作。审计期间实测到：刚清掉的假 API Key
 * 在跑过一次 e2e 之后又出现，说明**每次跑测试都会覆盖真实业务库里的 AI 配置**，
 * 顺带污染操作日志和会话表。
 *
 * 这里不依赖任何人记得设环境变量 —— 库名不以 _test 结尾就直接拒绝执行。
 * 宁可测试跑不起来，也不能让一次手滑清空生产数据。
 */
const TEST_DB_SUFFIX = '_test';

export function assertTestDatabase(): void {
  const db = process.env.DB_DATABASE ?? '';
  if (db.endsWith(TEST_DB_SUFFIX)) return;

  const msg = [
    '',
    '=========================================================',
    ' 拒绝运行 e2e：目标数据库不是测试库',
    `   当前 DB_DATABASE = ${db || '(未设置)'}`,
    `   要求以 ${TEST_DB_SUFFIX} 结尾，例如 erp_system${TEST_DB_SUFFIX}`,
    '',
    ' 初始化测试库：',
    '   npm run test:e2e:init -w server',
    ' 然后：',
    '   npm run test:e2e -w server',
    '=========================================================',
    '',
  ].join('\n');
  console.error(msg);
  throw new Error(`e2e 拒绝连接非测试库：${db || '(未设置)'}`);
}
