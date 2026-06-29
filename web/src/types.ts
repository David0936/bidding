// 前端使用的类型（与后端 /api/settings 对齐）

export type ProviderType = 'openai' | 'claude';

export interface ProviderProfile {
  baseUrl: string;
  apiKey: string; // 读取时后端会脱敏为空字符串
  model: string;
}

export interface AIConfig {
  provider: ProviderType;
  openai: ProviderProfile;
  claude: ProviderProfile;
  temperature: number;
  maxTokens: number;
}

/** GET /api/settings 返回：附带 Key 是否已设置的标记 */
export interface RedactedAIConfig extends AIConfig {
  openaiKeySet: boolean;
  claudeKeySet: boolean;
}

export interface TestResult {
  ok: boolean;
  provider?: ProviderType;
  model?: string;
  reply?: string;
  message?: string;
  status?: number;
}

// ===== 标书项目 =====
export type TenderFileType = 'pdf' | 'docx' | 'txt';

export interface TenderDoc {
  fileName: string;
  fileType: TenderFileType;
  charCount: number;
  uploadedAt: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tender: TenderDoc | null;
}

export interface UploadResult {
  project: Project;
  charCount: number;
  preview: string;
}

// ===== 目录（大纲） =====
export interface OutlineNode {
  id: string;
  title: string;
  children: OutlineNode[];
  content?: string;
}

export interface Outline {
  title: string;
  nodes: OutlineNode[];
  updatedAt: string;
}
