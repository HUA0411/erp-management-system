import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * 敏感字段的对称加密（AES-256-GCM）。
 *
 * 用途：AI 服务商的 API Key 原先以明文存在 `ai_config.api_key` 里。
 * 接口层做了掩码（****1234），但拿到数据库就是明文 —— 备份泄露、
 * SQL 注入、DBA 越权都能直接拿走别家（也可能是付费的）密钥。
 *
 * 存储格式：`enc:v1:<iv>:<authTag>:<ciphertext>`（全部 base64），
 * 不带 `enc:v1:` 前缀的值按历史明文处理 —— 保证老数据能读，
 * 同时下次保存时自动升级为密文，不需要停机迁移。
 *
 * 密钥来源：优先 AI_KEY_ENC_SECRET；未配置时从 JWT_SECRET 派生。
 * 派生而非共用，避免同一个密钥同时用于签名和加密。
 * 轮换密钥会导致旧密文无法解密（GCM 无自适应能力），轮换时需重新保存配置。
 */

const PREFIX = 'enc:v1:';

function encryptionKey(): Buffer {
  const raw = process.env.AI_KEY_ENC_SECRET || process.env.JWT_SECRET;
  if (!raw) {
    throw new Error('缺少 AI_KEY_ENC_SECRET / JWT_SECRET，无法加密敏感字段');
  }
  // HKDF 简化版：加盐做一次 SHA-256 得到固定 32 字节密钥
  return createHash('sha256').update(`erp-secret-box:${raw}`).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  if (isEncrypted(plain)) return plain; // 幂等，避免二次加密
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join(':');
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!isEncrypted(stored)) return stored; // 历史明文
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('密文格式损坏');
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
