import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 更新权限（菜单名 / 图标 / 排序 / 前端路由）。
 *
 * 为什么必须要有这个类：原来写的是内联对象类型
 * `@Body() body: { name?: string; icon?: string; sort?: number; path?: string }`，
 * TS 编译后 `design:paramtypes` 是 `Object`，而 Nest 的 ValidationPipe 对
 * `metatype === Object` 会**整个跳过**校验（validation.pipe.js 的 toValidate() 直接 return false），
 * whitelist 与长度校验全部失效 —— 超长 name/path 会一路写到 MySQL 才报
 * 1406 Data too long / 1366 Incorrect integer value，前端只看到 500。
 * 这是全项目唯一一个没有 DTO 的请求体。
 */
export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  path?: string;
}
