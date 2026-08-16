import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaleOrderEntity, SaleOrderItemEntity } from '../entities/sale.entity';
import { SaleOutboundEntity, SaleOutboundItemEntity } from '../entities/outbound.entity';
import { CustomerEntity } from '../entities/partner.entity';
import { ProductEntity } from '../entities/product.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { LogsModule } from '../logs/logs.module';
import { SaleOrdersService } from './sale-orders.service';
import { SaleOrdersController } from './sale-orders.controller';
import { SaleOutboundsService } from './sale-outbounds.service';
import { SaleOutboundsController } from './sale-outbounds.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaleOrderEntity,
      SaleOrderItemEntity,
      SaleOutboundEntity,
      SaleOutboundItemEntity,
      CustomerEntity,
      ProductEntity,
    ]),
    InventoryModule,
    LogsModule,
  ],
  providers: [SaleOrdersService, SaleOutboundsService],
  controllers: [SaleOrdersController, SaleOutboundsController],
  exports: [SaleOrdersService, SaleOutboundsService],
})
export class SaleModule {}
