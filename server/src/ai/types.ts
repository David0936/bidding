// AI 配置与消息类型定义（同时支持 OpenAI 兼容与 Claude 两种格式）

export type ProviderType = 'openai' | 'claude';

export interface ProviderProfile {
  /** 接口基址。OpenAI 兼容如 https://api.deepseek.com/v1；Claude 如 https://api.anthropic.com */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** 模型名，如 deepseek-chat / gpt-4o-mini / claude-sonnet-4-6 */
  model: string;
}

export interface AIConfig {
  /** 当前启用的提供方 */
  provider: ProviderType;
  /** OpenAI 兼容格式配置 */
  openai: ProviderProfile;
  /** Claude（Anthropic Messages）格式配置 */
  claude: ProviderProfile;
  /** 采样温度，默认 0.7 */
  temperature: number;
  /** 单次回复最大 token 数，默认 4096 */
  maxTokens: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  /** 系统提示词（可选） */
  system?: string;
  /** 多轮对话消息 */
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** 用于账单流水归类，如 project.outline / checks.rejection */
  feature?: string;
  /** 允许少量非计费调用，例如设置页连通性测试 */
  billable?: boolean;
}

export interface ChatResult {
  text: string;
  /** 实际使用的提供方与模型，便于前端展示 */
  provider: ProviderType;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimated: boolean;
  };
  billing?: {
    transactionId?: string;
    credits: number;
    balanceAfter: number;
  };
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'openai',
  openai: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
  },
  claude: {
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-4-6',
  },
  temperature: 0.7,
  maxTokens: 4096,
};
