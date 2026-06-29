// 统一的 AI 调用门面：把 OpenAI 兼容接口与 Claude Messages 接口归一化为同一个 chat() 调用。
// 设计目标：业务层只关心 system + messages，不关心底层是哪家提供方。

import type {
  AIConfig,
  ChatRequest,
  ChatResult,
  ProviderProfile,
  ProviderType,
} from './types.js';
import { getCurrentAccountId } from '../billing/requestContext.js';
import {
  ensureAiCredits,
  normalizeUsage,
  recordAiConsumption,
} from '../billing/billingService.js';
import type { TokenUsage } from '../billing/types.js';

export class AIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AIError';
    this.status = status;
  }
}

function activeProfile(config: AIConfig): ProviderProfile {
  return config.provider === 'claude' ? config.claude : config.openai;
}

function requireConfigured(profile: ProviderProfile, provider: ProviderType): void {
  if (!profile.apiKey) {
    throw new AIError(`未配置 ${provider} 的 API Key，请先在「设置」中填写。`);
  }
  if (!profile.baseUrl) {
    throw new AIError(`未配置 ${provider} 的接口地址（Base URL）。`);
  }
  if (!profile.model) {
    throw new AIError(`未配置 ${provider} 的模型名称。`);
  }
}

/** 去掉结尾多余的斜杠，避免拼接出 //v1 之类的路径 */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

interface ProviderCallResult {
  text: string;
  usage?: Partial<TokenUsage>;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function callOpenAI(
  profile: ProviderProfile,
  req: ChatRequest,
  temperature: number,
  maxTokens: number,
): Promise<ProviderCallResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  for (const m of req.messages) messages.push({ role: m.role, content: m.content });

  const resp = await fetch(`${trimSlash(profile.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`,
    },
    body: JSON.stringify({
      model: profile.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: req.signal,
  });

  if (!resp.ok) {
    const detail = await safeErrorText(resp);
    throw new AIError(`OpenAI 兼容接口返回错误：${detail}`, resp.status);
  }

  const data: any = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new AIError('OpenAI 兼容接口返回格式异常：未找到回复内容。');
  }
  const promptTokens = numberOrUndefined(data?.usage?.prompt_tokens);
  const completionTokens = numberOrUndefined(data?.usage?.completion_tokens);
  const totalTokens = numberOrUndefined(data?.usage?.total_tokens);
  return {
    text,
    usage:
      promptTokens || completionTokens || totalTokens
        ? { promptTokens, completionTokens, totalTokens, estimated: false }
        : undefined,
  };
}

async function callClaude(
  profile: ProviderProfile,
  req: ChatRequest,
  temperature: number,
  maxTokens: number,
): Promise<ProviderCallResult> {
  // Claude 的 system 是独立字段，messages 仅含 user/assistant
  const resp = await fetch(`${trimSlash(profile.baseUrl)}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': profile.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: profile.model,
      max_tokens: maxTokens,
      temperature,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: req.signal,
  });

  if (!resp.ok) {
    const detail = await safeErrorText(resp);
    throw new AIError(`Claude 接口返回错误：${detail}`, resp.status);
  }

  const data: any = await resp.json();
  // Claude 返回 content 数组，文本块在 type==='text'
  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  const text = blocks
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text) {
    throw new AIError('Claude 接口返回格式异常：未找到文本内容。');
  }
  const promptTokens = numberOrUndefined(data?.usage?.input_tokens);
  const completionTokens = numberOrUndefined(data?.usage?.output_tokens);
  const totalTokens =
    typeof promptTokens === 'number' && typeof completionTokens === 'number'
      ? promptTokens + completionTokens
      : undefined;
  return {
    text,
    usage:
      promptTokens || completionTokens || totalTokens
        ? { promptTokens, completionTokens, totalTokens, estimated: false }
        : undefined,
  };
}

async function safeErrorText(resp: Response): Promise<string> {
  try {
    const body = await resp.text();
    return `HTTP ${resp.status} ${body.slice(0, 500)}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

/** 统一对话入口：根据当前启用的提供方路由到对应实现 */
export async function chat(config: AIConfig, req: ChatRequest): Promise<ChatResult> {
  const profile = activeProfile(config);
  requireConfigured(profile, config.provider);

  const temperature = req.temperature ?? config.temperature;
  const maxTokens = req.maxTokens ?? config.maxTokens;
  const billable = req.billable !== false;
  const accountId = getCurrentAccountId();

  if (billable) {
    ensureAiCredits(accountId, req, maxTokens);
  }

  const result =
    config.provider === 'claude'
      ? await callClaude(profile, req, temperature, maxTokens)
      : await callOpenAI(profile, req, temperature, maxTokens);

  const usage = normalizeUsage(req, result.text, result.usage);
  const transaction = billable
    ? recordAiConsumption(accountId, req, usage, config.provider, profile.model)
    : null;

  return {
    text: result.text,
    provider: config.provider,
    model: profile.model,
    usage,
    billing: transaction
      ? {
          transactionId: transaction.id,
          credits: Math.abs(transaction.credits),
          balanceAfter: transaction.balanceAfter,
        }
      : undefined,
  };
}

/** 连通性测试：发一句最短的 ping，验证 Key/地址/模型是否可用 */
export async function testConnection(config: AIConfig): Promise<ChatResult> {
  return chat(config, {
    system: '你是一个连通性测试助手。',
    messages: [{ role: 'user', content: '请只回复两个字：可用' }],
    maxTokens: 32,
    temperature: 0,
    billable: false,
    feature: 'settings.testConnection',
  });
}
