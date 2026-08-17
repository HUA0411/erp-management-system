import { MigrationInterface, QueryRunner } from "typeorm";

export class AiConfigProvider1786884817034 implements MigrationInterface {
    name = 'AiConfigProvider1786884817034'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ai_config\` ADD \`provider\` varchar(32) NOT NULL COMMENT '提供商标识：deepseek/zhipu/qwen/kimi/doubao/openai/claude/gemini/openrouter/custom' DEFAULT 'custom'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ai_config\` DROP COLUMN \`provider\``);
    }

}
