// 目录生成服务：基于招标文件文本，调用 AI 生成结构化的投标技术方案目录。
import { randomUUID } from 'node:crypto';
import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import type { Outline, OutlineNode } from './types.js';

// 招标文件可能很长，这里截断喂给模型，控制 token 成本（目录阶段不需要全文细节）。
const MAX_TENDER_CHARS = 12000;

const SYSTEM_PROMPT = [
  '你是一名资深的投标技术方案编写专家，熟悉中国招投标规则。',
  '你的任务是：阅读招标文件要点，规划一份结构合理、覆盖评分点、符合行业惯例的【投标技术方案】目录。',
  '要求：',
  '1. 生成 6~10 个一级章节，每个一级章节下 2~5 个二级条目；必要时二级下可再分三级。',
  '2. 章节要紧扣招标文件的建设内容、技术要求和评分办法，避免空泛套话。',
  '3. 标题简洁专业，体现「项目理解、总体方案、技术实现、实施与项目管理、质量与服务保障」等维度，但具体措辞要贴合本项目。',
  '4. 只规划目录结构，不要写正文内容。',
].join('\n');

interface RawNode {
  title?: string;
  children?: RawNode[];
}
interface RawOutline {
  title?: string;
  sections?: RawNode[];
}

/** 把模型返回的原始结构转换为带稳定 ID 的 OutlineNode 树 */
function toNodes(raw: RawNode[] | undefined, depth: number): OutlineNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n) => n && typeof n.title === 'string' && n.title.trim())
    .map((n) => {
      const children = depth < 3 ? toNodes(n.children, depth + 1) : [];
      return {
        id: randomUUID(),
        title: n.title!.trim(),
        children,
      } as OutlineNode;
    });
}

export async function generateOutline(
  config: AIConfig,
  tenderText: string,
  projectName: string,
): Promise<Outline> {
  const clipped = tenderText.slice(0, MAX_TENDER_CHARS);
  const truncatedNote =
    tenderText.length > MAX_TENDER_CHARS ? '\n\n（注：招标文件过长，以上为前部分内容节选）' : '';

  const userPrompt = [
    `项目名称：${projectName}`,
    '',
    '招标文件内容如下：',
    '"""',
    clipped + truncatedNote,
    '"""',
    '',
    '请按以下 JSON 结构输出目录（children 可嵌套，最多三级；没有子级时给空数组）：',
    '{',
    '  "title": "投标技术方案",',
    '  "sections": [',
    '    { "title": "第一章 ……", "children": [ { "title": "1.1 ……", "children": [] } ] }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await jsonChat<RawOutline>(config, {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.4,
  });

  const nodes = toNodes(raw.sections, 1);
  if (nodes.length === 0) {
    throw new Error('目录生成失败：模型未返回有效的章节结构，请重试或更换模型。');
  }

  return {
    title: (raw.title && raw.title.trim()) || '投标技术方案',
    nodes,
    updatedAt: new Date().toISOString(),
  };
}
