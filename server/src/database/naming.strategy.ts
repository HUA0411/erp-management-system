import { DefaultNamingStrategy, NamingStrategyInterface, Table } from 'typeorm';

/**
 * 驼峰属性名 → snake_case 列名/表名。
 * 实体属性使用 camelCase，数据库中统一为 snake_case。
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  private snake(value: string): string {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toLowerCase();
  }

  columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
    return this.snake(embeddedPrefixes.concat(customName || propertyName).join('_'));
  }

  tableName(targetName: string, userSpecifiedName: string): string {
    return userSpecifiedName || this.snake(targetName);
  }

  joinColumnName(relationName: string, referencedColumnName?: string): string {
    return this.snake(relationName + '_' + (referencedColumnName || 'id'));
  }

  joinTableName(firstTableName: string, secondTableName: string, firstPropertyName: string): string {
    return this.snake(firstTableName + '_' + firstPropertyName.replace(/\./gi, '_') + '_' + secondTableName);
  }

  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return this.snake(tableName + '_' + (columnName || propertyName));
  }

  classTableInheritanceParentColumnName(parentTableName: string, parentTableIdPropertyName: string): string {
    return this.snake(parentTableName + '_' + parentTableIdPropertyName);
  }

  uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    const tableName = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return 'uq_' + this.snake(tableName) + '_' + columnNames.map((c) => this.snake(c)).join('_');
  }

  relationConstraintName(tableOrName: Table | string, columnNames: string[], where?: string): string {
    const tableName = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return 'rel_' + this.snake(tableName) + '_' + columnNames.map((c) => this.snake(c)).join('_');
  }
}
