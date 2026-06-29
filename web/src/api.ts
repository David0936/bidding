// 与后端交互的轻量封装
import type { AIConfig, RedactedAIConfig, TestResult } from './types';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  getSettings(): Promise<RedactedAIConfig> {
    return jsonFetch<RedactedAIConfig>('/api/settings');
  },
  saveSettings(config: Partial<AIConfig>): Promise<RedactedAIConfig> {
    return jsonFetch<RedactedAIConfig>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },
  testConnection(config: Partial<AIConfig>): Promise<TestResult> {
    return jsonFetch<TestResult>('/api/settings/test', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },
};
