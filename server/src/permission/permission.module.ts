import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity, RolePermissionEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';

@Module({
  imports: [
    // RoleEntity：superAdminRoleIds() 用来查超管角色，做授权时的提权防护
    TypeOrmModule.forFeature([PermissionEntity, RoleEntity, RolePermissionEntity, UserRoleEntity]),
  ],
  providers: [PermissionService],
  controllers: [PermissionController],
  exports: [PermissionService],
})
export class PermissionModule {}
