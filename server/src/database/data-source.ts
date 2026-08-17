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
  },
  logging: false,
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
