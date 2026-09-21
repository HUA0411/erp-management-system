import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { PartnerType, PaymentType } from '@erp/shared';

export class CreatePaymentDto {
  @IsIn(['pay', 'receive'])
  type: PaymentType;

  @IsIn(['supplier', 'customer'])
  partnerType: PartnerType;

  @Type(() => Number)
  @IsInt()
  partnerId: number;

  /**
   * @Max 不能省：amount 列是 DECIMAL(12,2)，上限 9999999999.99。
   * 只写 @Min 的话，传 1e12 会一路走到 MySQL 才报 1264 Out of range → 500。
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: '金额必须大于 0' })
  @Max(9_999_999_999.99, { message: '金额超出上限' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNo?: string;

  /**
   * 幂等键，由客户端在打开登记弹窗时生成（一次填写 = 一个键）。
   * 同一个键重复提交只会产生一条单据，接口返回首次创建的那条。
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @IsDateString({}, { message: '日期格式不正确' })
  payDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
