import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: '金额必须大于 0' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNo?: string;

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
