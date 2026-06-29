import type { ChatRequest, ProviderType } from '../ai/types.js';
import { getPricingPolicy, recordConsumption, ensureSufficientCredits } from './billingStore.js';
import type { BillingTransaction, TokenUsage } from './types.js';

function roundCredits(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function estimateTextTokens(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const nonCjk = text.replace(/[\u3400-\u9fff]/g, '').replace(/\s+/g, '');
  return Math.max(1, cjk + Math.ceil(nonCjk.length / 4));
}

export function estimatePromptTokens(req: ChatRequest): number {
  const systemTokens = req.system ? estimateTextTokens(req.system) : 0;
  const messageTokens = req.messages.reduce((sum, item) => sum + estimateTextTokens(item.content), 0);
  return systemTokens + messageTokens;
}

export function estimateRequestedUsage(req: ChatRequest, maxTokens: number): TokenUsage {
  const promptTokens = estimatePromptTokens(req);
  const completionTokens = Math.max(1, maxTokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  };
}

export function normalizeUsage(req: ChatRequest, text: string, usage?: Partial<TokenUsage>): TokenUsage {
  const promptTokens = Math.max(1, Math.round(usage?.promptTokens ?? estimatePromptTokens(req)));
  const completionTokens = Math.max(1, Math.round(usage?.completionTokens ?? estimateTextTokens(text)));
  const totalTokens = Math.max(promptTokens + completionTokens, Math.round(usage?.totalTokens ?? 0));
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimated: usage?.estimated ?? true,
  };
}

export function creditsForUsage(usage: TokenUsage): number {
  const pricing = getPricingPolicy();
  const raw = (usage.totalTokens / 1000) * pricing.creditsPerThousandTokens;
  return roundCredits(Math.max(pricing.minimumChargeCredits, raw));
}

export function ensureAiCredits(accountId: string, req: ChatRequest, maxTokens: number): void {
  const usage = estimateRequestedUsage(req, maxTokens);
  ensureSufficientCredits(accountId, creditsForUsage(usage), req.feature);
}

export function recordAiConsumption(
  accountId: string,
  req: ChatRequest,
  usage: TokenUsage,
  provider: ProviderType,
  model: string,
): BillingTransaction | null {
  const feature = req.feature ?? 'ai.chat';
  return recordConsumption(accountId, {
    credits: creditsForUsage(usage),
    description: `AI 算力消耗 · ${feature}`,
    feature,
    provider,
    model,
    usage,
  });
}
