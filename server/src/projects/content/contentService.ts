// 正文生成服务：为目录中的某个叶子章节撰写正文。
import { chat } from '../../ai/provider.js';
import type { AIConfig } from '../../ai/types.js';
import type { GlobalFacts, TenderAnalysis } from '../analysis/types.js';
import { renderAnalysisForPrompt, renderFactsForPrompt } from '../analysis/analysisService.js';
import { renderIndustryProfileForPrompt } from '../industryProfile/industryProfileService.js';
import type { TenderIndustryProfile } from '../industryProfile/types.js';
import type { ResponseMatrix } from '../responseMatrix/types.js';
import { renderResponseMatrixForPrompt } from '../responseMatrix/responseMatrixService.js';
import type { KnowledgeItem } from '../../knowledge/types.js';
import { renderKnowledgeDetails } from '../../knowledge/knowledgeService.js';
import type { Outline } from '../outline/types.js';
import { findNode, renderOutlineText } from '../outline/treeUtils.js';

// 招标全文较长，正文阶段同样截断喂给模型控制成本。
const MAX_TENDER_CHARS = 10000;
const MAX_ORIGINAL_PLAN_CHARS = 9000;

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
  analysis: TenderAnalysis | null = null,
  facts: GlobalFacts | null = null,
  knowledgeItems: KnowledgeItem[] = [],
  originalPlanText: string | null = null,
  industryProfile: TenderIndustryProfile | null = null,
  responseMatrix: ResponseMatrix | null = null,
  materialContext = '（尚未生成资料补齐清单）',
): Promise<SectionContentResult> {
  const target = findNode(outline.nodes, nodeId);
  if (!target) {
    throw new Error('目录中找不到该章节，请刷新后重试。');
  }
  if (target.node.children.length > 0) {
    throw new Error('该章节包含子章节，正文应写在最末级条目上。');
  }

  const clipped = tenderText.slice(0, MAX_TENDER_CHARS);
  const clippedOriginalPlan = originalPlanText?.slice(0, MAX_ORIGINAL_PLAN_CHARS) ?? '';
  const originalPlanBlock = clippedOriginalPlan
    ? [
        '用户上传了已有技术方案，当前章节生成属于“原方案扩写”。',
        '必须保留原方案中的实质信息、技术路线、实施方法、服务承诺、设备参数、人员安排、周期、验收、售后等内容；可以优化表达、补充细节、扩充字数，但不得删除关键事实。',
        '不要在正文中出现“原方案”“用户原文”“历史文档”等说法。',
        '原方案全文节选：',
        '"""',
        clippedOriginalPlan,
        '"""',
      ].join('\n')
    : '（未上传已有技术方案，按从零编写处理）';
  const userPrompt = [
    '【招标文件要点】',
    '"""',
    clipped,
    '"""',
    '',
    '【投标技术方案完整目录（供你理解上下文，不要据此写其它章节）】',
    renderOutlineText(outline),
    '',
    '【招标文件关键解析项】',
    renderAnalysisForPrompt(analysis),
    '',
    '【必须保持一致的全局事实】',
    renderFactsForPrompt(facts),
    '',
    '【行业/采购类型画像】',
    renderIndustryProfileForPrompt(industryProfile),
    '',
    '【点对点响应矩阵】',
    renderResponseMatrixForPrompt(responseMatrix),
    '',
    '【可参考的企业知识库内容】',
    renderKnowledgeDetails(knowledgeItems),
    '',
    '【客户按资料清单上传的补充材料】',
    materialContext,
    '',
    '【已有技术方案扩写依据】',
    originalPlanBlock,
    '',
    '【当前需要撰写的章节】',
    `章节路径：${target.path.join(' / ')}`,
    `章节标题：${target.node.title}`,
    '',
    '请直接输出该章节的正文 Markdown，篇幅约 400~800 字（视章节重要性可适当增减）。',
    '请结合行业/采购类型画像选择专业表达、章节重点和材料落点，但所有承诺、参数、资质和业绩必须来自招标文件、全局事实、知识库或客户上传材料。',
    '如果响应矩阵中的 suggestedSection、requirement 或 responseStrategy 与当前章节相关，必须优先覆盖；尤其不能遗漏 critical/high、missing/risk/partial 状态的要求项。',
    '正文要体现“逐条响应”的投标意识：对废标底线、评分点、交付服务、验收、质保、培训、报价边界、技术参数等要求给出明确承诺或实现方式。',
    '如果客户上传的补充材料与当前章节相关，应优先吸收其中的真实企业信息、资质、业绩、人员、设备、报价依据、技术参数或证明材料；不得编造材料中没有的证书编号、金额、日期或业绩。',
    '如果正文涉及上述全局事实，必须严格沿用事实内容，不得改写成相互冲突的周期、地点、金额、范围、服务承诺或主体名称。',
    '如果知识库内容与当前章节相关，可以吸收其方法、能力、案例和表述风格；不得引用与招标文件或全局事实冲突的内容。',
  ].join('\n');

  const result = await chat(config, {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.6,
    feature: 'project.sectionContent',
  });

  return {
    nodeId,
    title: target.node.title,
    content: result.text.trim(),
  };
}
