import { ColumnOptions } from 'typeorm';

/**
 * DECIMAL 列：mysql2 默认返回字符串，通过 transformer 统一转为 number，
 * 避免前端/业务层出现字符串数字。
 */
export function decimalColumn(
  precision = 12,
  scale = 2,
  extra: Partial<ColumnOptions> = {},
): ColumnOptions {
  return {
    type: 'decimal',
    precision,
    scale,
    default: 0,
    transformer: {
      to: (value: number | string | null | undefined) =>
        value == null || value === '' ? value : String(value),
      from: (value: string | null | undefined) =>
        value == null ? 0 : parseFloat(value),
    },
    ...extra,
  };
}
