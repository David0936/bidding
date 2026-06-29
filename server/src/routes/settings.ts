// 设置相关接口：读取/保存 AI 配置，以及连通性测试。
import { Router } from 'express';
import { loadConfig, saveConfig, redactConfig } from '../store/configStore.js';
import { testConnection, AIError } from '../ai/provider.js';
import type { AIConfig, ProviderProfile } from '../ai/types.js';

export const settingsRouter = Router();

/** 合并前端提交的配置：apiKey 为空时保留原有 Key（前端不持有明文 Key） */
function mergeIncoming(current: AIConfig, incoming: Partial<AIConfig>): AIConfig {
  const mergeProfile = (
    base: ProviderProfile,
    patch?: Partial<ProviderProfile>,
  ): ProviderProfile => ({
    baseUrl: patch?.baseUrl ?? base.baseUrl,
    model: patch?.model ?? base.model,
    apiKey: patch?.apiKey ? patch.apiKey : base.apiKey,
  });

  return {
    provider: incoming.provider === 'claude' ? 'claude' : incoming.provider === 'openai' ? 'openai' : current.provider,
    openai: mergeProfile(current.openai, incoming.openai),
    claude: mergeProfile(current.claude, incoming.claude),
    temperature: typeof incoming.temperature === 'number' ? incoming.temperature : current.temperature,
    maxTokens: typeof incoming.maxTokens === 'number' ? incoming.maxTokens : current.maxTokens,
  };
}

// 读取配置（脱敏）
settingsRouter.get('/', (_req, res) => {
  res.json(redactConfig(loadConfig()));
});

// 保存配置
settingsRouter.put('/', (req, res) => {
  const current = loadConfig();
  const merged = mergeIncoming(current, req.body ?? {});
  const saved = saveConfig(merged);
  res.json(redactConfig(saved));
});

// 连通性测试：可选地接受前端临时提交的配置（用于保存前先测）
settingsRouter.post('/test', async (req, res) => {
  const current = loadConfig();
  const config = req.body && Object.keys(req.body).length > 0
    ? mergeIncoming(current, req.body as Partial<AIConfig>)
    : current;
  try {
    const result = await testConnection(config);
    res.json({ ok: true, provider: result.provider, model: result.model, reply: result.text });
  } catch (err) {
    const status = err instanceof AIError && err.status ? err.status : 500;
    res.status(200).json({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      status,
    });
  }
});
