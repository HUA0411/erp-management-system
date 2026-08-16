import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrderEntity, PurchaseOrderItemEntity } from '../entities/purchase.entity';
import { PurchaseInboundEntity, PurchaseInboundItemEntity } from '../entities/inbound.entity';
import { SupplierEntity } from '../entities/partner.entity';
import { ProductEntity } from '../entities/product.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { LogsModule } from '../logs/logs.module';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseInboundsService } from './purchase-inbounds.service';
import { PurchaseInboundsController } from './purchase-inbounds.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrderEntity,
      PurchaseOrderItemEntity,
      PurchaseInboundEntity,
      PurchaseInboundItemEntity,
      SupplierEntity,
      ProductEntity,
    ]),
    InventoryModule,
    LogsModule,
  ],
  providers: [PurchaseOrdersService, PurchaseInboundsService],
  controllers: [PurchaseOrdersController, PurchaseInboundsController],
  exports: [PurchaseOrdersService, PurchaseInboundsService],
})
export class PurchaseModule {}
