/**
 * AI 模型提供商预设表（OpenAI 兼容协议 /chat/completions）。
 * 配置 AI 助手时选预设即可自动填好 API 地址与常用模型，无需手工复制 URL。
 * 模型名以各官网最新为准，此处为常用值，用户可自行修改。
 */
export interface AiProviderPreset {
  /** 存库标识 */
  id: string;
  /** 展示名 */
  name: string;
  /** OpenAI 兼容 API 基地址 */
  baseUrl: string;
  /** 常用模型建议值 */
  models: string[];
  /** 模型输入框占位 */
  modelPlaceholder: string;
  /** 补充说明（如豆包填推理接入点、Claude 兼容提示） */
  hint?: string;
}

export const aiProviderPresets: AiProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    modelPlaceholder: 'deepseek-chat',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.3', 'glm-5.2', 'glm-4.6', 'glm-4-flash'],
    modelPlaceholder: 'glm-5.3',
  },
  {
    id: 'qwen',
    name: '阿里云百炼 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3-max', 'qwen3.6-plus', 'qwen3.5', 'qwen-plus', 'qwen-turbo'],
    modelPlaceholder: 'qwen3-max',
  },
  {
    id: 'kimi',
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-thinking-turbo', 'kimi-k2-turbo', 'kimi-latest'],
    modelPlaceholder: 'kimi-k2-thinking-turbo',
    hint: 'Kimi K2 旧版 API 已下线，请使用新版模型名',
  },
  {
    id: 'doubao',
    name: '字节火山方舟 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-seed-2.1-pro', 'doubao-seed-2.1-turbo', 'doubao-1-5-pro-32k'],
    modelPlaceholder: 'doubao-seed-2.1-pro',
    hint: '模型名可填控制台创建的推理接入点 ID（ep-...），或带日期后缀的完整模型 ID',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1'],
    modelPlaceholder: 'gpt-5',
    hint: 'GPT-4o 系列已逐步退役，建议使用 GPT-5 系列',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1/',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    modelPlaceholder: 'claude-sonnet-4-6',
    hint: '使用官方 OpenAI 兼容端点；如工具调用异常，可改用 OpenRouter 网关访问 Claude 模型',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: ['gemini-3-pro', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    modelPlaceholder: 'gemini-2.5-flash',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter 聚合网关',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4.6', 'openai/gpt-5', 'deepseek/deepseek-chat'],
    modelPlaceholder: 'anthropic/claude-sonnet-4.6',
    hint: '一个 Key 访问全部主流模型，模型名使用目录中的 slug（如 anthropic/claude-sonnet-4.6）',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow 硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-32B', 'glm-4-9b-chat'],
    modelPlaceholder: 'Qwen/Qwen3-32B',
    hint: '国产模型聚合平台，模型名使用目录中的 slug',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地模型）',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5', 'llama3.1'],
    modelPlaceholder: 'qwen2.5',
    hint: '本地部署，无需 API Key；需先安装 Ollama 并拉取模型',
  },
  {
    id: 'custom',
    name: '自定义（任意 OpenAI 兼容服务）',
    baseUrl: '',
    models: [],
    modelPlaceholder: '填写模型名',
    hint: '适用于自建/中转服务，协议为标准 OpenAI Chat Completions',
  },
];
