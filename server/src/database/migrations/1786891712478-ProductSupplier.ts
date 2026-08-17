import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductSupplier1786891712478 implements MigrationInterface {
    name = 'ProductSupplier1786891712478'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`product\` ADD \`supplier_id\` int NULL COMMENT '默认供应商（可更换或解除绑定）'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`product\` DROP COLUMN \`supplier_id\``);
    }

}
