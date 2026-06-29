// 让模型返回 JSON 并稳健解析。模型常把 JSON 包在 ```json 代码块里，或前后带解释文字，这里做容错提取。
import { chat } from './provider.js';
import type { AIConfig, ChatMessage } from './types.js';

/** 从一段文本里尽量提取出 JSON 字符串 */
function extractJsonText(raw: string): string {
  const text = raw.trim();

  // 1) 代码块 ```json ... ``` 或 ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();

  // 2) 直接就是 JSON
  if (text.startsWith('{') || text.startsWith('[')) return text;

  // 3) 截取第一个 { 或 [ 到最后一个 } 或 ]
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) return text;
  const start = Math.min(...starts);
  const lastObj = text.lastIndexOf('}');
  const lastArr = text.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end > start) return text.slice(start, end + 1);
  return text;
}

export interface JsonChatOptions {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  feature?: string;
  billable?: boolean;
}

/** 调用模型并返回解析后的 JSON 对象。解析失败时抛出带原文片段的错误，便于排查。 */
export async function jsonChat<T = unknown>(config: AIConfig, opts: JsonChatOptions): Promise<T> {
  const system = [
    opts.system ?? '',
    '严格要求：只输出一个合法的 JSON，不要任何解释文字，不要使用 Markdown 代码块包裹。',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await chat(config, {
    system,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    feature: opts.feature,
    billable: opts.billable,
  });

  const jsonText = extractJsonText(result.text);
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error(
      `模型未返回合法 JSON。原始回复片段：${result.text.slice(0, 300)}`,
    );
  }
}
