import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PaginationDto {
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
  @MaxLength(64)
  keyword?: string;
}

/**
 * 为什么下面这些查询 DTO 必须是**具名类**，不能写成 `PaginationDto & { status?: string }`：
 *
 * TypeScript 的交叉类型编译后只剩 `Object`，Nest 的 `design:paramtypes` 拿到的就是 Object，
 * ValidationPipe 见到 Object 会**整个跳过**校验与转换，于是：
 *   - `page` / `pageSize` 的默认值 1 / 10 不生效，两者都是 undefined
 *   - `skip((page - 1) * pageSize)` 算出 NaN → TypeORM 抛
 *     「Provided "skip" value is not a number」→ **500**
 *     实测：不带任何查询参数请求 `GET /api/products`、`/api/customers`、`/api/inventory` 全是 500
 *   - `@Max(100)` 形同虚设，`pageSize=100000000` 能一次拉走整张表
 *   - `pageSize=-1` / `page=0` 生成非法 SQL：`LIMIT -1 OFFSET 0` → 500
 *
 * 改成具名子类后 metatype 是真实类，父类校验规则与默认值一并继承，上述问题全部消失。
 *
 * 字段一律带装饰器：ValidationPipe 开了 `whitelist: true`，
 * **没有装饰器的属性会被静默删除**，那样筛选项会神不知鬼不觉地失效。
 */
const toOptionalInt = (): PropertyDecorator =>
  Transform(({ value }) => {
    // 前端清空下拉框时可能传空串，这里当成「不筛选」而不是 0
    if (value === '' || value === null || value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }) as PropertyDecorator;

const toOptionalText = (): PropertyDecorator =>
  Transform(({ value }) =>
    value === '' || value === null || value === undefined ? undefined : value,
  ) as PropertyDecorator;

/** 状态筛选（数字型：0 停用 / 1 启用） */
export class StatusNumberQueryDto extends PaginationDto {
  @IsOptional()
  @toOptionalInt()
  @IsInt()
  status?: number;
}

/** 状态筛选（字符串型：draft / confirmed / outbound …） */
export class StatusTextQueryDto extends PaginationDto {
  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(16)
  status?: string;
}

/** 商品列表：分类 + 状态 */
export class ProductQueryDto extends PaginationDto {
  @IsOptional()
  @toOptionalInt()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @toOptionalInt()
  @IsInt()
  status?: number;
}

/** 日期区间（YYYY-MM-DD） */
export class DateRangeQueryDto extends PaginationDto {
  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(32)
  startDate?: string;

  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(32)
  endDate?: string;
}

/** 状态 + 日期区间 */
export class StatusDateRangeQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(16)
  status?: string;
}

/** 收付款流水：类型 + 往来单位类型 + 日期区间 */
export class PaymentQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(16)
  type?: string;

  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(16)
  partnerType?: string;
}

/** 库存流水：类型 + 日期区间 */
export class InventoryRecordQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(16)
  type?: string;
}

/** 实时库存：只看低库存 */
export class InventoryCurrentQueryDto extends PaginationDto {
  @IsOptional()
  @toOptionalText()
  @IsString()
  @MaxLength(8)
  lowOnly?: string;
}
