// 与后端交互的轻量封装
import type { AIConfig, Project, RedactedAIConfig, TestResult, UploadResult } from './types';

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

  // ===== 项目 =====
  listProjects(): Promise<Project[]> {
    return jsonFetch<Project[]>('/api/projects');
  },
  createProject(name: string): Promise<Project> {
    return jsonFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  deleteProject(id: string): Promise<{ ok: boolean }> {
    return jsonFetch<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },
  getTenderText(id: string): Promise<{ text: string }> {
    return jsonFetch<{ text: string }>(`/api/projects/${id}/tender-text`);
  },
  async uploadTender(id: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(`/api/projects/${id}/tender`, { method: 'POST', body: form });
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
    return resp.json() as Promise<UploadResult>;
  },
};
