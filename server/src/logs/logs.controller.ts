import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LogsService } from './logs.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

/** 操作日志查询：分页 + 关键字 + 模块筛选（前端系统管理 → 操作日志） */
export class LogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  module?: string;
}

@ApiTags('操作日志')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @RequirePermissions('system:log:view')
  list(@Query() query: LogQueryDto) {
    return this.logsService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      module: query.module || undefined,
    });
  }
}
