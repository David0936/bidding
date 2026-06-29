// AI 配置的读写。配置（含 API Key）只保存在本机 data/ai-config.json，不上传任何服务器。
import fs from 'node:fs';
import { CONFIG_FILE, ensureDirs } from './paths.js';
import { DEFAULT_AI_CONFIG, type AIConfig, type ProviderProfile } from '../ai/types.js';

function mergeProfile(base: ProviderProfile, patch?: Partial<ProviderProfile>): ProviderProfile {
  return {
    baseUrl: patch?.baseUrl ?? base.baseUrl,
    apiKey: patch?.apiKey ?? base.apiKey,
    model: patch?.model ?? base.model,
  };
}

/** 读取配置；文件不存在或损坏时回退到默认值 */
export function loadConfig(): AIConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AIConfig>;
    return {
      provider: parsed.provider === 'claude' ? 'claude' : 'openai',
      openai: mergeProfile(DEFAULT_AI_CONFIG.openai, parsed.openai),
      claude: mergeProfile(DEFAULT_AI_CONFIG.claude, parsed.claude),
      temperature:
        typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_AI_CONFIG.temperature,
      maxTokens:
        typeof parsed.maxTokens === 'number' ? parsed.maxTokens : DEFAULT_AI_CONFIG.maxTokens,
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

/** 保存配置（整体覆盖式，传入完整配置） */
export function saveConfig(config: AIConfig): AIConfig {
  ensureDirs();
  const normalized: AIConfig = {
    provider: config.provider === 'claude' ? 'claude' : 'openai',
    openai: mergeProfile(DEFAULT_AI_CONFIG.openai, config.openai),
    claude: mergeProfile(DEFAULT_AI_CONFIG.claude, config.claude),
    temperature: typeof config.temperature === 'number' ? config.temperature : DEFAULT_AI_CONFIG.temperature,
    maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : DEFAULT_AI_CONFIG.maxTokens,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

/** 对外返回时脱敏：API Key 只回传是否已设置，不回传明文 */
export function redactConfig(config: AIConfig): AIConfig & {
  openaiKeySet: boolean;
  claudeKeySet: boolean;
} {
  return {
    ...config,
    openai: { ...config.openai, apiKey: '' },
    claude: { ...config.claude, apiKey: '' },
    openaiKeySet: Boolean(config.openai.apiKey),
    claudeKeySet: Boolean(config.claude.apiKey),
  };
}
