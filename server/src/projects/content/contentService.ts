// 正文生成服务：为目录中的某个叶子章节撰写正文。
import { chat } from '../../ai/provider.js';
import type { AIConfig } from '../../ai/types.js';
import type { Outline } from '../outline/types.js';
import { findNode, renderOutlineText } from '../outline/treeUtils.js';

// 招标全文较长，正文阶段同样截断喂给模型控制成本。
const MAX_TENDER_CHARS = 10000;

const SYSTEM_PROMPT = [
  '你是一名资深的投标技术方案撰写专家。',
  '请为投标技术方案中指定的某一章节撰写正文，要求：',
  '1. 内容专业、具体、可落地，紧扣招标文件的建设内容与技术要求，避免空话套话与无意义的口号。',
  '2. 只写【当前指定章节】的内容，不要写其它章节，不要重复输出章节标题。',
  '3. 用 Markdown 组织：可使用小标题、要点列表、必要的表格；条理清晰。',
  '4. 语言为简体中文，正式书面语，体现投标方的专业能力与对项目的理解。',
].join('\n');

export interface SectionContentResult {
  nodeId: string;
  title: string;
  content: string;
}

export async function generateSectionContent(
  config: AIConfig,
  tenderText: string,
  outline: Outline,
  nodeId: string,
): Promise<SectionContentResult> {
  const target = findNode(outline.nodes, nodeId);
  if (!target) {
    throw new Error('目录中找不到该章节，请刷新后重试。');
  }
  if (target.node.children.length > 0) {
    throw new Error('该章节包含子章节，正文应写在最末级条目上。');
  }

  const clipped = tenderText.slice(0, MAX_TENDER_CHARS);
  const userPrompt = [
    '【招标文件要点】',
    '"""',
    clipped,
    '"""',
    '',
    '【投标技术方案完整目录（供你理解上下文，不要据此写其它章节）】',
    renderOutlineText(outline),
    '',
    '【当前需要撰写的章节】',
    `章节路径：${target.path.join(' / ')}`,
    `章节标题：${target.node.title}`,
    '',
    '请直接输出该章节的正文 Markdown，篇幅约 400~800 字（视章节重要性可适当增减）。',
  ].join('\n');

  const result = await chat(config, {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.6,
  });

  return {
    nodeId,
    title: target.node.title,
    content: result.text.trim(),
  };
}
