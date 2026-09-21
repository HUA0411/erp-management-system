import 'dotenv/config';
import { DataSource } from 'typeorm';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import { SnakeNamingStrategy } from './naming.strategy';
import { TenantSubscriber } from '../tenant/tenant.subscriber';
import { TenantEntity } from '../entities/tenant.entity';
import { UserEntity } from '../entities/user.entity';
import { RoleEntity, RolePermissionEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { OperationLogEntity } from '../entities/operation-log.entity';
import { CategoryEntity } from '../entities/category.entity';
import { ProductEntity } from '../entities/product.entity';
import { SupplierEntity, CustomerEntity } from '../entities/partner.entity';
import { PurchaseOrderEntity, PurchaseOrderItemEntity } from '../entities/purchase.entity';
import { SaleOrderEntity, SaleOrderItemEntity } from '../entities/sale.entity';
import { PurchaseInboundEntity, PurchaseInboundItemEntity } from '../entities/inbound.entity';
import { SaleOutboundEntity, SaleOutboundItemEntity } from '../entities/outbound.entity';
import { InventoryEntity, InventoryRecordEntity } from '../entities/inventory.entity';
import { StocktakeEntity, StocktakeItemEntity } from '../entities/stocktake.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { AiConfigEntity } from '../entities/ai-config.entity';
import { AiConversationEntity } from '../entities/ai-conversation.entity';
import { AiMessageEntity } from '../entities/ai-message.entity';
import { AiPendingActionEntity } from '../entities/ai-pending-action.entity';
import { AiReportEntity } from '../entities/ai-report.entity';

export const dataSourceOptions: MysqlConnectionOptions = {
  type: 'mysql',
  connectorPackage: 'mysql2',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'erp_system',
  entities: [
    TenantEntity,
    UserEntity,
    RoleEntity,
    RolePermissionEntity,
    UserRoleEntity,
    PermissionEntity,
    OperationLogEntity,
    CategoryEntity,
    ProductEntity,
    SupplierEntity,
    CustomerEntity,
    PurchaseOrderEntity,
    PurchaseOrderItemEntity,
    SaleOrderEntity,
    SaleOrderItemEntity,
    PurchaseInboundEntity,
    PurchaseInboundItemEntity,
    SaleOutboundEntity,
    SaleOutboundItemEntity,
    InventoryEntity,
    InventoryRecordEntity,
    StocktakeEntity,
    StocktakeItemEntity,
    PaymentEntity,
    AiConfigEntity,
    AiConversationEntity,
    AiMessageEntity,
    AiPendingActionEntity,
    AiReportEntity,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  subscribers: [TenantSubscriber],
  namingStrategy: new SnakeNamingStrategy(),
  charset: 'utf8mb4',
  timezone: '+08:00',
  extra: {
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectionLimit: 20,
    /**
     * 排队上限：池子满时最多允许 50 个请求排队，第 51 个**立刻**收到错误。
     *
     * mysql2 的默认值是 `waitForConnections: true` + `queueLimit: 0`，
     * 0 表示**无限排队**，而且 mysql2 3.x 已经没有 acquireTimeout 这个选项了
     * （传了会被忽略并打印 "Ignoring invalid configuration option" 警告），
     * 也就是说池子被占满后新请求会永远挂着：不报错、不返回、也不释放，只能重启进程。
     * queueLimit 是目前唯一可用的兜底 —— 它不能让等待超时，但能让过量的请求快速失败。
     *
     * 真正会让池子占满的是「AI 提案确认」的嵌套事务写法：外层事务占 1 条连接，
     * 工具内部又开一个事务再占 1 条，一个请求吃 2 条（见 pending-actions.service.ts）。
     * 要根治得让工具接受外层传入的 manager，而不是各开各的事务。
     */
    queueLimit: 50,
  },
  logging: false,
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
