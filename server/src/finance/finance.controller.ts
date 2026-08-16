import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { LogsService } from '../logs/logs.service';

@ApiTags('财务')
@Controller()
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly logsService: LogsService,
  ) {}

  @Get('payments')
  @RequirePermissions('finance:payment:view')
  list(
    @Query()
    query: PaginationDto & { type?: string; partnerType?: string; startDate?: string; endDate?: string },
  ) {
    return this.financeService.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      type: query.type as never,
      partnerType: query.partnerType as never,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Post('payments')
  @RequirePermissions('finance:payment:create')
  async create(@Body() dto: CreatePaymentDto) {
    const result = await this.financeService.create(dto);
    await this.logsService.record('财务', '登记收付款', { docNo: result.docNo });
    return result;
  }

  @Delete('payments/:id')
  @RequirePermissions('finance:payment:delete')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.financeService.remove(id);
    await this.logsService.record('财务', '删除收付款单', { id });
    return { ok: true };
  }

  @Get('finance/accounts')
  @RequirePermissions('finance:account:view')
  accounts() {
    return this.financeService.accounts();
  }
}
