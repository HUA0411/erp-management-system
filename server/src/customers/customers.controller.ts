import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('客户')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  @RequirePermissions('customer:view')
  list(@Query() query: PaginationDto & { status?: number }) {
    return this.customersService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status != null ? Number(query.status) : undefined,
    });
  }

  @Get('options')
  options(@Query('keyword') keyword?: string) {
    return this.customersService.options(keyword);
  }

  @Post()
  @RequirePermissions('customer:create')
  async create(@Body() dto: CreateCustomerDto) {
    const result = await this.customersService.create(dto);
    await this.logsService.record('客户', '新增客户', { code: dto.code, name: dto.name });
    return result;
  }

  @Put(':id')
  @RequirePermissions('customer:update')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    await this.customersService.update(id, dto);
    await this.logsService.record('客户', '编辑客户', { id });
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions('customer:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.customersService.remove(id);
    await this.logsService.record('客户', '删除客户', { id });
    return { ok: true };
  }
}
