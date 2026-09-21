/**
 * 幂等键生成器。
 *
 * 用于「提交类」表单：网络超时重试、用户双击按钮、代理重发，
 * 都会让同一次业务意图发出多个请求。服务端拿到同一个键就只落一条数据。
 *
 * 优先用 crypto.randomUUID（现代浏览器都有，且是密码学随机，
 * 不会像 Math.random 那样在小样本下撞车）；不可用时退回时间戳 + 随机串。
 */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
