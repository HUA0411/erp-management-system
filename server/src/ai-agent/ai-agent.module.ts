import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfigEntity } from '../entities/ai-config.entity';
import { AiConversationEntity } from '../entities/ai-conversation.entity';
import { AiMessageEntity } from '../entities/ai-message.entity';
import { AiPendingActionEntity } from '../entities/ai-pending-action.entity';
import { AiReportEntity } from '../entities/ai-report.entity';
import { ProductEntity } from '../entities/product.entity';
import { SupplierEntity, CustomerEntity } from '../entities/partner.entity';
import { InventoryEntity } from '../entities/inventory.entity';
import { PaymentEntity } from '../entities/payment.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseModule } from '../purchase/purchase.module';
import { SaleModule } from '../sale/sale.module';
import { FinanceModule } from '../finance/finance.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ProductsModule } from '../products/products.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { CustomersModule } from '../customers/customers.module';
import { PermissionModule } from '../permission/permission.module';
import { LogsModule } from '../logs/logs.module';
import { ToolRegistryService } from './tool-registry.service';
import { InventoryAgentTools } from './tools/inventory.tools';
import { SaleAgentTools } from './tools/sale.tools';
import { FinanceAgentTools } from './tools/finance.tools';
import { BaseAgentTools } from './tools/base.tools';
import { ClarifyToolBootstrap } from './tools/clarify.tool';
import { AiConfigService } from './ai-config.service';
import { PendingActionsService } from './pending-actions.service';
import { AgentReportService } from './agent-report.service';
import { AgentService } from './agent.service';
import { DeepSeekLlmClient } from './deepseek-llm.client';
import { AGENT_LLM_CLIENT } from './agent-llm-client.token';
import { AiAgentController } from './ai-agent.controller';

/**
 * AI 智能助手模块（DSH 式插件架构的 ERP 版）：
 * 工具注册表（插件化）+ agent 循环 + 提案确认 + 主动汇报。
 * 写操作永远停在提案上等用户确认，走真实 service 执行。
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      AiConfigEntity,
      AiConversationEntity,
      AiMessageEntity,
      AiPendingActionEntity,
      AiReportEntity,
      ProductEntity,
      SupplierEntity,
      CustomerEntity,
      InventoryEntity,
      PaymentEntity,
      PermissionEntity,
      TenantEntity,
    ]),
    InventoryModule,
    PurchaseModule,
    SaleModule,
    FinanceModule,
    DashboardModule,
    ProductsModule,
    SuppliersModule,
    CustomersModule,
    PermissionModule,
    LogsModule,
  ],
  providers: [
    ToolRegistryService,
    ClarifyToolBootstrap,
    BaseAgentTools,
    InventoryAgentTools,
    SaleAgentTools,
    FinanceAgentTools,
    AiConfigService,
    PendingActionsService,
    AgentReportService,
    DeepSeekLlmClient,
    { provide: AGENT_LLM_CLIENT, useClass: DeepSeekLlmClient },
    AgentService,
  ],
  controllers: [AiAgentController],
})
export class AiAgentModule {}
