// 目录生成服务：基于招标文件文本，调用 AI 生成结构化的投标技术方案目录。
import { randomUUID } from 'node:crypto';
import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import type { KnowledgeItem } from '../../knowledge/types.js';
import { renderKnowledgeCompact } from '../../knowledge/knowledgeService.js';
import type { Outline, OutlineNode, OutlineVariant, OutlineVariantsResult } from './types.js';

// 招标文件可能很长，这里截断喂给模型，控制 token 成本（目录阶段不需要全文细节）。
const MAX_TENDER_CHARS = 12000;
const MAX_ORIGINAL_PLAN_CHARS = 9000;

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
  estimatedWords?: number;
}
interface RawOutline {
  title?: string;
  sections?: RawNode[];
}
interface RawOutlineVariant {
  name?: string;
  summary?: string;
  title?: string;
  sections?: RawNode[];
}
interface RawOutlineVariants {
  variants?: RawOutlineVariant[];
}

function normalizeEstimatedWords(value: unknown, depth: number): number | undefined {
  const num = Math.round(Number(value));
  if (Number.isFinite(num) && num >= 300 && num <= 20000) return num;
  return depth >= 2 ? 2000 : undefined;
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
        estimatedWords: children.length === 0 ? normalizeEstimatedWords(n.estimatedWords, depth) : undefined,
      } as OutlineNode;
    });
}

function buildPromptBlocks(
  tenderText: string,
  projectName: string,
  knowledgeItems: KnowledgeItem[],
  originalPlanText: string | null,
): string[] {
  const clipped = tenderText.slice(0, MAX_TENDER_CHARS);
  const clippedOriginalPlan = originalPlanText?.slice(0, MAX_ORIGINAL_PLAN_CHARS) ?? '';
  const truncatedNote =
    tenderText.length > MAX_TENDER_CHARS ? '\n\n（注：招标文件过长，以上为前部分内容节选）' : '';
  const originalPlanBlock = clippedOriginalPlan
    ? [
        '用户上传了已有技术方案，当前任务是扩写和优化，不是完全从零编写。',
        '原方案内容如下；生成目录时必须尽量保留原方案已有实质内容的承载位置，同时按招标文件补齐缺失章节：',
        '"""',
        clippedOriginalPlan,
        '"""',
      ].join('\n')
    : '（未上传已有技术方案，按从零生成技术方案处理）';

  return [
    `项目名称：${projectName}`,
    '',
    '招标文件内容如下：',
    '"""',
    clipped + truncatedNote,
    '"""',
    '',
    '已有技术方案：',
    originalPlanBlock,
    '',
    '可参考的企业知识库条目如下（用于贴近企业能力和既有方案风格；不得与招标文件冲突）：',
    renderKnowledgeCompact(knowledgeItems),
  ];
}

export async function generateOutline(
  config: AIConfig,
  tenderText: string,
  projectName: string,
  knowledgeItems: KnowledgeItem[] = [],
  originalPlanText: string | null = null,
): Promise<Outline> {
  const userPrompt = [
    ...buildPromptBlocks(tenderText, projectName, knowledgeItems, originalPlanText),
    '',
    '请按以下 JSON 结构输出目录（children 可嵌套，最多三级；没有子级时给空数组；叶子节点给 estimatedWords，建议 800~4000 字）。如果存在已有技术方案，请在满足招标文件要求的前提下保留其主要结构和实质内容位置：',
    '{',
    '  "title": "投标技术方案",',
    '  "sections": [',
    '    { "title": "第一章 ……", "children": [ { "title": "1.1 ……", "estimatedWords": 2000, "children": [] } ] }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await jsonChat<RawOutline>(config, {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.4,
    feature: 'project.outline',
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

export async function generateOutlineVariants(
  config: AIConfig,
  tenderText: string,
  projectName: string,
  knowledgeItems: KnowledgeItem[] = [],
  originalPlanText: string | null = null,
): Promise<OutlineVariantsResult> {
  const userPrompt = [
    ...buildPromptBlocks(tenderText, projectName, knowledgeItems, originalPlanText),
    '',
    '请一次生成 3 套不同侧重点的投标技术方案目录，供用户选择：',
    '方案一：稳健逐条响应，重视商务/技术/评分点覆盖。',
    '方案二：项目实施与合规导向，重视实施组织、风险控制、验收交付。',
    '方案三：技术方案与创新亮点导向，重视总体架构、关键技术、平台能力。',
    '',
    '每套目录要求：',
    '1. 6~10 个一级章节，二级/三级结构清晰。',
    '2. 叶子节点必须给 estimatedWords，通常 800~4000 字；关键评分章节可更高。',
    '3. 每套目录都要覆盖招标文件中的评分点、废标风险、服务交付和验收要求。',
    '',
    '请按以下 JSON 输出：',
    '{',
    '  "variants": [',
    '    {',
    '      "name": "方案一",',
    '      "summary": "适合……",',
    '      "title": "投标技术方案",',
    '      "sections": [',
    '        { "title": "第一章 ……", "children": [ { "title": "第一节 ……", "estimatedWords": 2000, "children": [] } ] }',
    '      ]',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await jsonChat<RawOutlineVariants>(config, {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.5,
    feature: 'project.outline',
  });

  const variants: OutlineVariant[] = (raw.variants ?? [])
    .map((variant, index): OutlineVariant | null => {
      const nodes = toNodes(variant.sections, 1);
      if (nodes.length === 0) return null;
      return {
        id: String(randomUUID()),
        name: variant.name?.trim() || `方案${index + 1}`,
        summary: variant.summary?.trim() || '覆盖招标文件主要要求，可作为标书目录初稿。',
        outline: {
          title: variant.title?.trim() || '投标技术方案',
          nodes,
          updatedAt: new Date().toISOString(),
        },
      };
    })
    .filter((item): item is OutlineVariant => Boolean(item));

  if (variants.length === 0) {
    throw new Error('目录方案生成失败：模型未返回有效的章节结构，请重试或更换模型。');
  }

  return {
    variants: variants.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
}
