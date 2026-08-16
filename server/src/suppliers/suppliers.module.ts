import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierEntity } from '../entities/partner.entity';
import { PurchaseOrderEntity } from '../entities/purchase.entity';
import { LogsModule } from '../logs/logs.module';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SupplierEntity, PurchaseOrderEntity]), LogsModule],
  providers: [SuppliersService],
  controllers: [SuppliersController],
  exports: [SuppliersService],
})
export class SuppliersModule {}
