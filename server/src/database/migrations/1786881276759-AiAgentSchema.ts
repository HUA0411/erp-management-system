import { MigrationInterface, QueryRunner } from "typeorm";

export class AiAgentSchema1786881276759 implements MigrationInterface {
    name = 'AiAgentSchema1786881276759'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`ai_config\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL COMMENT '租户（每公司一条）', \`api_key\` varchar(255) NOT NULL COMMENT 'DeepSeek API Key', \`base_url\` varchar(255) NOT NULL COMMENT 'API 基地址（OpenAI 兼容）' DEFAULT 'https://api.deepseek.com', \`model\` varchar(64) NOT NULL COMMENT '模型名' DEFAULT 'deepseek-chat', \`updated_by\` int NULL COMMENT '最近修改人', \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_6aa44b1c46e3515a9e8b67f916\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`ai_conversation\` (\`company_id\` int NOT NULL COMMENT '所属租户', \`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL COMMENT '发起用户', \`title\` varchar(64) NULL COMMENT '会话标题（首条消息截断）', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`ai_message\` (\`company_id\` int NOT NULL COMMENT '所属租户', \`id\` int NOT NULL AUTO_INCREMENT, \`conversation_id\` int NOT NULL COMMENT '所属会话', \`role\` varchar(16) NOT NULL COMMENT 'user | assistant', \`content\` text NULL, \`cards\` text NULL COMMENT '交互卡片 JSON 数组', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_9bf0757dba34e28dfb9c55aa71\` (\`conversation_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`ai_pending_action\` (\`company_id\` int NOT NULL COMMENT '所属租户', \`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL COMMENT '提案人（仅本人可确认）', \`username\` varchar(32) NULL, \`tool_name\` varchar(64) NOT NULL COMMENT '工具名', \`params\` text NOT NULL COMMENT '执行参数 JSON', \`preview\` text NOT NULL COMMENT '预览卡片 JSON', \`status\` varchar(16) NOT NULL COMMENT 'pending/confirmed/cancelled/failed' DEFAULT 'pending', \`expires_at\` datetime NOT NULL COMMENT '过期时间', \`confirmed_at\` datetime NULL COMMENT '确认时间', \`result\` text NULL COMMENT '执行结果 JSON', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_f006e21aece161112f8885d99c\` (\`company_id\`, \`status\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`ai_report\` (\`company_id\` int NOT NULL COMMENT '所属租户', \`id\` int NOT NULL AUTO_INCREMENT, \`type\` varchar(32) NOT NULL COMMENT '汇报类型，如 LOW_STOCK', \`title\` varchar(128) NOT NULL, \`content\` text NOT NULL COMMENT '汇报内容 JSON（AiPreviewRow[]）', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_9f4a538b29312a87f7f6d76f3f\` (\`company_id\`, \`type\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_9f4a538b29312a87f7f6d76f3f\` ON \`ai_report\``);
        await queryRunner.query(`DROP TABLE \`ai_report\``);
        await queryRunner.query(`DROP INDEX \`IDX_f006e21aece161112f8885d99c\` ON \`ai_pending_action\``);
        await queryRunner.query(`DROP TABLE \`ai_pending_action\``);
        await queryRunner.query(`DROP INDEX \`IDX_9bf0757dba34e28dfb9c55aa71\` ON \`ai_message\``);
        await queryRunner.query(`DROP TABLE \`ai_message\``);
        await queryRunner.query(`DROP TABLE \`ai_conversation\``);
        await queryRunner.query(`DROP INDEX \`IDX_6aa44b1c46e3515a9e8b67f916\` ON \`ai_config\``);
        await queryRunner.query(`DROP TABLE \`ai_config\``);
    }

}
