import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(32)
  code: string;

  @IsString()
  @MaxLength(64)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  spec?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  safetyStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  supplierId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  spec?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  safetyStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  supplierId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  status?: number;
}
