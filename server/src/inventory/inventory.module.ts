import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryEntity, InventoryRecordEntity } from '../entities/inventory.entity';
import { ProductEntity } from '../entities/product.entity';
import { StocktakeEntity, StocktakeItemEntity } from '../entities/stocktake.entity';
import { LogsModule } from '../logs/logs.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StocktakesService } from './stocktakes.service';
import { StocktakesController } from './stocktakes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryEntity,
      InventoryRecordEntity,
      ProductEntity,
      StocktakeEntity,
      StocktakeItemEntity,
    ]),
    LogsModule,
  ],
  providers: [InventoryService, StocktakesService],
  controllers: [InventoryController, StocktakesController],
  exports: [InventoryService],
})
export class InventoryModule {}
