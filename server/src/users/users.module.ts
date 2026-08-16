import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../entities/user.entity';
import { RoleEntity, UserRoleEntity } from '../entities/role.entity';
import { PermissionModule } from '../permission/permission.module';
import { LogsModule } from '../logs/logs.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserRoleEntity, RoleEntity]),
    PermissionModule,
    LogsModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
