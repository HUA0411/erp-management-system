import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionModule } from '../permission/permission.module';
import { LogsModule } from '../logs/logs.module';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, UserRoleEntity]),
    PermissionModule,
    LogsModule,
  ],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}
