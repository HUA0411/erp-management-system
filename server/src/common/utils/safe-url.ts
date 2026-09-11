import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { BusinessException } from '../exceptions/business.exception';

/**
 * 出站 URL 校验（SSRF 防护）。
 *
 * 场景：AI 配置的 `baseUrl` 由用户自由填写，服务端会主动 `fetch(${baseUrl}/chat/completions)`。
 * 不做校验就等于把服务器变成内网探测代理 —— 实测指向本机一个只有内网能访问的服务时，
 * 对方的响应体被原样回显到了 HTTP 响应里。
 *
 * 三道防线：
 *   1. 协议必须是 https（同时挡掉 gopher/file 等，也避免 API Key 明文出网）
 *   2. 字面量地址检查：环回 / 私有 / 链路本地 / 保留地址，
 *      并覆盖十进制(2130706433)、十六进制(0x7f000001)、IPv6 映射等变体写法
 *   3. **DNS 解析后再查一次**：`127.0.0.1.nip.io` 这种通配 DNS 服务
 *      字面上是公网域名，解析出来却指向环回地址 —— 只查字面量会漏掉。
 *
 * 残余风险：解析发生在保存/测试时，真正发请求时可能被 DNS rebinding 换成内网 IP
 * （TOCTOU）。彻底堵死需要把连接钉死在已校验的 IP 上，改动面较大。
 * 生产环境建议再配 AI_ALLOWED_HOSTS 白名单，只允许已知服务商域名。
 */

function isBlockedIPv4(host: string): boolean {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  if (a === 0 || a === 127) return true; // 0.0.0.0/8、环回
  if (a === 10) return true; // 私有 A
  if (a === 172 && b >= 16 && b <= 31) return true; // 私有 B
  if (a === 192 && b === 168) return true; // 私有 C
  if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // 组播 / 保留
  return false;
}

/** 把 `::ffff:7f00:1` 这种十六进制压缩形式的 IPv4 映射地址还原成点分十进制 */
function mappedIPv4FromIPv6(h: string): string | null {
  const dotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function isBlockedIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::1' || h === '::') return true;
  if (/^fe[89ab]/.test(h)) return true; // 链路本地 fe80::/10
  if (/^f[cd]/.test(h)) return true; // 唯一本地地址 fc00::/7
  const mapped = mappedIPv4FromIPv6(h);
  return mapped ? isBlockedIPv4(mapped) : false;
}

/** 任意 IP 字面量（v4/v6）是否属于禁止访问的范围 */
function isBlockedAddress(addr: string): boolean {
  const bare = addr.replace(/^\[|\]$/g, '').split('%')[0]; // 去掉 zone id
  const v = isIP(bare);
  if (v === 4) return isBlockedIPv4(bare);
  if (v === 6) return isBlockedIPv6(bare);
  return false;
}

/**
 * 校验并规范化出站地址；不合法直接抛业务异常。
 * @returns 去掉尾部斜杠的规范 URL
 */
export async function assertSafeOutboundUrl(raw: string, fieldLabel = '接口地址'): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BusinessException(`${fieldLabel}格式不正确，需为完整 URL`, 40042);
  }

  const normalized = url.origin + url.pathname.replace(/\/+$/, '');

  /**
   * 内网自建模型（Ollama / vLLM / one-api 等）是合法场景，但必须是显式开关。
   * 设了 AI_ALLOW_INSECURE_BASEURL=1 才放行 http 和内网地址 —— 默认关闭，
   * 避免"因为有人可能要用本地模型"就把 SSRF 防护整体关掉。
   */
  if (process.env.AI_ALLOW_INSECURE_BASEURL === '1') return normalized;

  if (url.protocol !== 'https:') {
    throw new BusinessException(`${fieldLabel}必须使用 https（当前为 ${url.protocol}）`, 40042);
  }

  /**
   * Node 的 URL.hostname 对 IPv6 保留方括号（`[::1]`），而 net.isIP('[::1]') 返回 0 ——
   * 不剥掉方括号，整个 IPv6 分支会被静默跳过，`https://[::1]/v1` 就绕过去了（实测确认）。
   */
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new BusinessException(`${fieldLabel}不允许指向内网地址`, 40043);
  }

  const literalVersion = isIP(host);
  if (literalVersion !== 0) {
    if (isBlockedAddress(host)) {
      throw new BusinessException(`${fieldLabel}不允许指向内网地址`, 40043);
    }
  } else {
    // 既不是合法 IP，又不像域名 → 拒绝，避免解析歧义被下游利用
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
      throw new BusinessException(`${fieldLabel}主机名不合法`, 40042);
    }
    // 关键一步：解析域名，检查它实际指向哪里
    let records: Array<{ address: string }>;
    try {
      records = await lookup(host, { all: true });
    } catch {
      throw new BusinessException(`${fieldLabel}无法解析该域名`, 40042);
    }
    if (!records.length) {
      throw new BusinessException(`${fieldLabel}无法解析该域名`, 40042);
    }
    for (const r of records) {
      if (isBlockedAddress(r.address)) {
        throw new BusinessException(`${fieldLabel}解析后指向内网地址，已拒绝`, 40043);
      }
    }
  }

  // 生产环境可收紧为白名单：AI_ALLOWED_HOSTS=api.deepseek.com,open.bigmodel.cn
  const allow = (process.env.AI_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length && !allow.includes(host)) {
    throw new BusinessException(`${fieldLabel}不在允许的服务商白名单内`, 40044);
  }

  return normalized;
}
