import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { dataSourceOptions } from './database/data-source';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { PermissionModule } from './permission/permission.module';
import { LogsModule } from './logs/logs.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CustomersModule } from './customers/customers.module';
import { PurchaseModule } from './purchase/purchase.module';
import { SaleModule } from './sale/sale.module';
import { InventoryModule } from './inventory/inventory.module';
import { FinanceModule } from './finance/finance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SystemModule } from './system/system.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局默认限流：每 IP 每分钟 300 次。e2e 需要更高的上限，故支持环境变量覆盖。
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 300) },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...dataSourceOptions,
        host: config.get<string>('DB_HOST') || dataSourceOptions.host || 'localhost',
        port: parseInt(config.get<string>('DB_PORT') || '3306', 10),
        username: config.get<string>('DB_USERNAME') || dataSourceOptions.username || 'root',
        password: config.get<string>('DB_PASSWORD') || dataSourceOptions.password || '',
        database: config.get<string>('DB_DATABASE') || dataSourceOptions.database || 'erp_system',
        autoLoadEntities: false,
      }),
    }),
    AuthModule,
    PermissionModule,
    LogsModule,
    UsersModule,
    RolesModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    CustomersModule,
    PurchaseModule,
    SaleModule,
    InventoryModule,
    FinanceModule,
    DashboardModule,
    SystemModule,
    AiAgentModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    /**
     * 限流守卫必须显式注册才生效 —— 只有 ThrottlerModule.forRoot() 是死配置。
     * 之前这一行缺失，导致登录接口可以被无限次爆破（实测 350 次请求 0 拦截）。
     * 放在守卫链最前面：超限的请求不应该消耗 JWT 解析和权限查询。
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
