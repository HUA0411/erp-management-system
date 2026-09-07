import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiMessageReasoning1786892800000 implements MigrationInterface {
  name = 'AiMessageReasoning1786892800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `ai_message` ADD `reasoning_content` text NULL COMMENT '思考模式的思维链内容（带 tools 请求需回传）'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `ai_message` DROP COLUMN `reasoning_content`');
  }
}
