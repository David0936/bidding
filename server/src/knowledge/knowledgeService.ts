import { jsonChat } from '../ai/jsonChat.js';
import type { AIConfig } from '../ai/types.js';
import type { KnowledgeItem } from './types.js';

const MAX_KNOWLEDGE_CHARS = 20000;

interface RawKnowledgeItems {
  items?: unknown;
}

type KnowledgeItemDraft = Omit<KnowledgeItem, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>;

function fallbackItem(documentId: string, folderId: string, fileName: string, text: string): KnowledgeItemDraft[] {
  return [
    {
      folderId,
      documentId,
      title: fileName.replace(/\.[^.]+$/, ''),
      summary: text.slice(0, 180),
      content: text,
    },
  ];
}

function normalizeItems(
  raw: RawKnowledgeItems,
  documentId: string,
  folderId: string,
  fileName: string,
  text: string,
): KnowledgeItemDraft[] {
  if (!Array.isArray(raw.items)) return fallbackItem(documentId, folderId, fileName, text);
  const items: KnowledgeItemDraft[] = [];
  for (const item of raw.items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = String(obj.title ?? '').trim();
    const summary = String(obj.summary ?? obj.resume ?? '').trim();
    const content = String(obj.content ?? '').trim();
    if (!title || !summary || !content) continue;
    items.push({
      folderId,
      documentId,
      title,
      summary,
      content,
    });
  }
  return items.length > 0 ? items.slice(0, 24) : fallbackItem(documentId, folderId, fileName, text);
}

export async function analyzeKnowledgeDocument(
  config: AIConfig,
  documentId: string,
  folderId: string,
  fileName: string,
  text: string,
): Promise<KnowledgeItemDraft[]> {
  const clipped = text.slice(0, MAX_KNOWLEDGE_CHARS);
  const raw = await jsonChat<RawKnowledgeItems>(config, {
    system: [
      '你是一名企业投标知识库整理专家。',
      '请把用户上传的历史方案、企业资料或技术文档整理成可复用的知识条目。',
      '保留对写标书有价值的实质内容，舍弃封面、目录、页码、签章、空泛套话。',
      '不要编造原文没有的信息。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `文件名：${fileName}`,
          '',
          '文档内容：',
          '"""',
          clipped,
          '"""',
          '',
          '请输出 JSON：',
          '{',
          '  "items": [',
          '    { "title": "知识条目标题", "summary": "一句话摘要", "content": "可直接作为标书生成参考的原文/整理内容" }',
          '  ]',
          '}',
          '',
          '要求：',
          '1. 每个条目聚焦一个可复用主题，如实施方案、质量保障、运维服务、项目管理、风险控制、企业能力、案例经验。',
          '2. content 要尽量保留原文中的关键事实、参数、流程、方法，不要只写摘要。',
          '3. 条目数量以 3~12 条为宜，内容较长时可以更多但不超过 24 条。',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    feature: 'knowledge.analyzeDocument',
  });
  return normalizeItems(raw, documentId, folderId, fileName, text);
}

export function renderKnowledgeCompact(items: KnowledgeItem[], limit = 30): string {
  if (items.length === 0) return '（暂无知识库资料）';
  return items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${item.title}：${item.summary}`)
    .join('\n');
}

export function renderKnowledgeDetails(items: KnowledgeItem[], limit = 8, maxChars = 8000): string {
  if (items.length === 0) return '（暂无知识库资料）';
  let used = 0;
  const chunks: string[] = [];
  for (const item of items.slice(0, limit)) {
    const chunk = [`# ${item.title}`, item.summary, item.content.slice(0, 1200)].join('\n');
    if (used + chunk.length > maxChars) break;
    chunks.push(chunk);
    used += chunk.length;
  }
  return chunks.join('\n\n---\n\n') || '（暂无可用知识库资料）';
}
