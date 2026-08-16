import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderLineDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: '数量必须大于 0' })
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
}

export class CreatePurchaseOrderDto {
  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @IsDateString({}, { message: '订单日期格式不正确' })
  orderDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1, { message: '至少需要一条明细' })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @IsOptional()
  @IsDateString({}, { message: '订单日期格式不正确' })
  orderDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: '至少需要一条明细' })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items?: OrderLineDto[];
}
