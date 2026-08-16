import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StocktakeLineDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualQty: number;
}

export class CreateStocktakeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1, { message: '至少盘点一个商品' })
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineDto)
  items: StocktakeLineDto[];
}
