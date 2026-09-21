// 必须在读 process.env 之前显式加载 .env：
// assertJwtSecret() 在 NestFactory.create() 之前执行，而 ConfigModule 要到那时才初始化。
// 原先只是靠 data-source.ts 的副作用导入间接生效，太脆弱，这里写明。
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * 启动前强制校验 JWT_SECRET。
 *
 * 为什么必须做：.env.example 里带着占位串 `please-change-me-to-a-long-random-string`，
 * 它同时存在于公开仓库里。照抄部署 → 任何人都能用这个公开密钥伪造出
 * 任意 companyId + isSuperAdmin 的 token，租户隔离直接归零。
 * 配置缺失时 jsonwebtoken 只会抛一个模糊异常，不会有任何可读提示。
 */
function assertJwtSecret(): void {
  const secret = process.env.JWT_SECRET ?? '';
  if (!secret) {
    console.error('[启动中止] 未设置 JWT_SECRET。请执行：openssl rand -hex 32');
    process.exit(1);
  }
  if (secret.includes('please-change-me')) {
    console.error('[启动中止] JWT_SECRET 仍是 .env.example 里的占位值，必须替换为随机串。');
    process.exit(1);
  }
  if (secret.length < 32) {
    console.error(`[启动中止] JWT_SECRET 长度仅 ${secret.length}，至少需要 32 位随机字符。`);
    process.exit(1);
  }
}

/**
 * 启动时检查是否还有账号在用演示默认密码 `123456`。
 *
 * 种子数据里的 7 个演示账号（admin / zhangsan / lisi / wangwu / zhaoliu / t2admin / t2sales）
 * 密码全是 123456，其中 admin 和 t2admin 还带平台超管权限。
 * 这些账号是演示和作品集展示用的，**直接上线公网等于给系统装了一扇不锁的门**。
 *
 * 这里只**提醒**，不阻断启动、也不自动改密码 —— 自动改会把演示环境的账号弄失效，
 * 而阻断启动会让「先跑起来看看」的首次部署直接卡住。真正的强制手段是把
 * docs/部署指南.md 的「必须修改演示账号」做成上线检查项。
 *
 * 检测方式是对预置密码做一次 bcrypt 比对（不需要知道明文以外的任何信息），
 * 库里查不到这些用户名就直接跳过。
 */
async function warnDefaultPasswords(dataSource: DataSource): Promise<void> {
  const DEFAULT_PASSWORD = '123456';
  const SEEDED = ['admin', 't2admin', 'zhangsan', 'lisi', 'wangwu', 'zhaoliu', 't2sales'];

  try {
    const rows: Array<{ username: string; password: string; is_super_admin: number }> =
      await dataSource.query(
        `SELECT username, password, is_super_admin FROM sys_user
         WHERE username IN (${SEEDED.map(() => '?').join(',')}) AND status = 1`,
        SEEDED,
      );
    const stillDefault = rows.filter((r) => bcrypt.compareSync(DEFAULT_PASSWORD, r.password));
    if (!stillDefault.length) return;

    const names = stillDefault.map((r) => (r.is_super_admin ? `${r.username}(超管)` : r.username)).join('、');
    const logger = new Logger('安全提醒');
    logger.warn(`检测到 ${stillDefault.length} 个演示账号仍在使用默认密码 123456：${names}`);
    logger.warn('这些账号可以登录并操作全部数据。上线前请务必修改，做法见 docs/部署指南.md');
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        '当前是生产环境（NODE_ENV=production）却仍然保留默认密码 —— 这是一条直通后门，请立即修改。',
      );
    }
  } catch (err) {
    // 检查失败不影响启动，只是少一条提醒
    new Logger('安全提醒').debug(`默认密码检查跳过: ${(err as Error).message}`);
  }
}

async function bootstrap(): Promise<void> {
  assertJwtSecret();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  app.setGlobalPrefix('api');
  app.disable('x-powered-by');

  /**
   * 反向代理场景下 req.ip 才是真实客户端 IP，限流才有意义。
   * 默认关闭：开启后客户端可伪造 X-Forwarded-For 绕过按 IP 的限流，
   * 所以只有确实部署在 nginx 后面时才设 TRUST_PROXY=1。
   */
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  /**
   * 安全响应头。原先一个都没有：无 CSP / HSTS / X-Frame-Options / nosniff，
   * 页面可被任意站点 iframe 嵌套（点击劫持），响应体类型可被嗅探。
   */
  app.use(
    helmet({
      // 生产环境启用 CSP；开发环境关闭，否则 Swagger UI 的内联脚本会被拦掉
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
            },
          }
        : false,
      // 上传的图片要允许被前端（生产可能不同源）以 <img> 引用
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  /**
   * CORS 收紧。原先是裸的 app.enableCors()，等于 `Access-Control-Allow-Origin: *`，
   * 任意站点都能发起请求并读取响应（配合登录接口无限流即可做分布式撞库）。
   */
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * 上传文件静态目录。
   * `Content-Disposition: attachment` 让直接导航到 /uploads/xxx 变成下载而非渲染 ——
   * 这是图片型存储 XSS 的兜底防线（被 <img src> 引用时不受影响，仍正常显示）。
   * `nosniff` 阻止浏览器无视 Content-Type 去嗅探执行。
   */
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });

  // Swagger 仅非生产环境暴露：docs-json 会吐出完整接口清单，等于给攻击者送地图
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('企业 ERP 进销存管理系统 API')
      .setDescription('NestJS + TypeORM + MySQL，多租户行级隔离')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);

  // 启动后顺手检查演示账号是否还在用默认密码
  await warnDefaultPasswords(app.get(DataSource));
  logger.log(`API 服务已启动: http://localhost:${port}/api`);
  if (!isProd) logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
  logger.log(`CORS 允许来源: ${corsOrigins.join(', ')}`);
}

bootstrap().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
