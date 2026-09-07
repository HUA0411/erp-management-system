import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationLogEntity } from '../entities/operation-log.entity';
import { LogsService } from './logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([OperationLogEntity])],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
