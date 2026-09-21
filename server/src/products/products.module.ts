import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from '../entities/product.entity';
import { CategoryEntity } from '../entities/category.entity';
import { InventoryEntity } from '../entities/inventory.entity';
import { SupplierEntity } from '../entities/partner.entity';
import { LogsModule } from '../logs/logs.module';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [
    // SupplierEntity 用于校验商品的 supplierId 归属当前租户（跨租户引用防护）
    TypeOrmModule.forFeature([ProductEntity, CategoryEntity, InventoryEntity, SupplierEntity]),
    LogsModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
