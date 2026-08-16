import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '../entities/payment.entity';
import { SupplierEntity, CustomerEntity } from '../entities/partner.entity';
import { PurchaseOrderEntity } from '../entities/purchase.entity';
import { SaleOrderEntity } from '../entities/sale.entity';
import { LogsModule } from '../logs/logs.module';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      SupplierEntity,
      CustomerEntity,
      PurchaseOrderEntity,
      SaleOrderEntity,
    ]),
    LogsModule,
  ],
  providers: [FinanceService],
  controllers: [FinanceController],
  exports: [FinanceService],
})
export class FinanceModule {}
