import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import { renderAnalysisForPrompt, renderFactsForPrompt } from '../analysis/analysisService.js';
import type { GlobalFacts, TenderAnalysis } from '../analysis/types.js';
import { renderIndustryProfileForPrompt } from '../industryProfile/industryProfileService.js';
import type { TenderIndustryProfile } from '../industryProfile/types.js';
import type { Outline } from '../outline/types.js';
import { collectLeaves, renderOutlineText } from '../outline/treeUtils.js';
import { getChapterText, type TenderChapter } from '../tenderChapters.js';
import type {
  ResponseItemCategory,
  ResponseItemPriority,
  ResponseItemStatus,
  ResponseMatrix,
  ResponseMatrixItem,
  ResponseOwnerRole,
} from './types.js';

const MAX_TENDER_CHARS = 22000;
const MAX_CONTENT_CHARS = 24000;
const MAX_ORIGINAL_PLAN_CHARS = 9000;

interface RawResponseMatrix {
  summary?: unknown;
  items?: unknown;
}

const CATEGORIES = new Set<ResponseItemCategory>([
  'qualification',
  'business',
  'technical',
  'scoring',
  'rejection',
  'delivery',
  'service',
  'price',
  'other',
]);

const PRIORITIES = new Set<ResponseItemPriority>(['critical', 'high', 'medium', 'low']);
const STATUSES = new Set<ResponseItemStatus>(['covered', 'partial', 'missing', 'risk', 'not_applicable']);
const OWNER_ROLES = new Set<ResponseOwnerRole>([
  'business',
  'technical',
  'finance',
  'project_manager',
  'product',
  'legal',
  'admin',
]);

function normalizeCategory(value: unknown): ResponseItemCategory {
  const raw = String(value ?? '').trim();
  return CATEGORIES.has(raw as ResponseItemCategory) ? (raw as ResponseItemCategory) : 'other';
}

function normalizePriority(value: unknown): ResponseItemPriority {
  const raw = String(value ?? '').trim();
  return PRIORITIES.has(raw as ResponseItemPriority) ? (raw as ResponseItemPriority) : 'medium';
}

function normalizeStatus(value: unknown): ResponseItemStatus {
  const raw = String(value ?? '').trim();
  return STATUSES.has(raw as ResponseItemStatus) ? (raw as ResponseItemStatus) : 'missing';
}

function normalizeOwnerRole(value: unknown): ResponseOwnerRole {
  const raw = String(value ?? '').trim();
  return OWNER_ROLES.has(raw as ResponseOwnerRole) ? (raw as ResponseOwnerRole) : 'technical';
}

function renderGeneratedContent(outline: Outline | null): string {
  if (!outline) return '（尚未生成目录/正文）';
  const chunks: string[] = [];
  for (const leaf of collectLeaves(outline.nodes)) {
    const content = (leaf.node.content ?? '').trim();
    chunks.push(
      [
        `node_id: ${leaf.node.id}`,
        `path: ${leaf.path.join(' / ')}`,
        'content:',
        content || '（尚未生成正文）',
      ].join('\n'),
    );
  }
  const full = chunks.join('\n\n---\n\n');
  if (full.length <= MAX_CONTENT_CHARS) return full;
  return `${full.slice(0, MAX_CONTENT_CHARS)}\n\n（注：正文较长，此处为前部内容节选；请只依据可见内容判断响应状态。）`;
}

function normalizeResponseMatrix(raw: RawResponseMatrix): ResponseMatrix {
  const items: ResponseMatrixItem[] = [];
  if (Array.isArray(raw.items)) {
    raw.items.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const obj = item as Record<string, unknown>;
      const requirement = String(obj.requirement ?? '').trim();
      const responseStrategy = String(obj.responseStrategy ?? obj.response_strategy ?? '').trim();
      if (!requirement || !responseStrategy) return;
      items.push({
        id: String(obj.id ?? '').trim() || `R${String(index + 1).padStart(3, '0')}`,
        category: normalizeCategory(obj.category),
        ownerRole: normalizeOwnerRole(obj.ownerRole ?? obj.owner_role),
        priority: normalizePriority(obj.priority),
        status: normalizeStatus(obj.status),
        sourceClause: String(obj.sourceClause ?? obj.source_clause ?? '').trim() || undefined,
        requirement,
        responseStrategy,
        suggestedSection: String(obj.suggestedSection ?? obj.suggested_section ?? '').trim() || undefined,
        evidence: String(obj.evidence ?? '').trim() || undefined,
        gap: String(obj.gap ?? '').trim() || undefined,
        score: String(obj.score ?? '').trim() || undefined,
        risk: String(obj.risk ?? '').trim() || undefined,
      });
    });
  }

  return {
    summary:
      String(raw.summary ?? '').trim() ||
      `已形成 ${items.length} 条招标要求响应矩阵，可用于逐项补齐技术标、商务标与偏离表。`,
    items: items.slice(0, 80).map((item, index) => ({
      ...item,
      id: item.id || `R${String(index + 1).padStart(3, '0')}`,
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function generateResponseMatrix(
  config: AIConfig,
  tenderText: string,
  projectName: string,
  analysis: TenderAnalysis | null,
  facts: GlobalFacts | null,
  outline: Outline | null,
  industryProfile: TenderIndustryProfile | null,
  originalPlanText: string | null = null,
  chapters?: TenderChapter[],
): Promise<ResponseMatrix> {
  const clippedTender = chapters?.length
    ? getChapterText(tenderText, chapters, ['scoring', 'instructions', 'requirements'], MAX_TENDER_CHARS)
    : tenderText.slice(0, MAX_TENDER_CHARS);
  const tenderNote =
    !chapters?.length && tenderText.length > MAX_TENDER_CHARS
      ? '\n\n（注：招标文件较长，此处为前部内容节选；优先提取评分办法、废标条款、投标文件组成、技术要求、合同交付服务条款。）'
      : '';
  const clippedOriginalPlan = originalPlanText?.slice(0, MAX_ORIGINAL_PLAN_CHARS) ?? '';

  const raw = await jsonChat<RawResponseMatrix>(config, {
    system: [
      '你是一名资深投标经理，擅长把招标文件拆成“逐条响应矩阵”。',
      '你的判断要像真实投标团队：识别废标底线、资格商务材料、技术评分点、交付服务承诺、报价边界，并分配给商务、技术、财务、项目经理、产品、法务或综合人员。',
      '不要照抄大段招标原文；每条要求要压缩成可执行任务，并给出投标文件里的应答策略。',
      '如已生成正文能证明覆盖，则标记 covered；部分覆盖为 partial；完全未体现为 missing；存在前后矛盾/承诺不足/废标隐患为 risk。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `项目名称：${projectName}`,
          '',
          '【招标文件节选】',
          '"""',
          clippedTender + tenderNote,
          '"""',
          '',
          '【关键解析项】',
          renderAnalysisForPrompt(analysis),
          '',
          '【全局事实】',
          renderFactsForPrompt(facts),
          '',
          '【行业/采购类型画像】',
          renderIndustryProfileForPrompt(industryProfile),
          '',
          '【投标目录】',
          outline ? renderOutlineText(outline) : '（尚未生成目录）',
          '',
          '【已生成正文/待审计正文】',
          renderGeneratedContent(outline),
          '',
          '【已有技术方案节选】',
          clippedOriginalPlan || '（未上传已有方案）',
          '',
          '请输出 JSON：',
          '{',
          '  "summary": "整体响应情况摘要，指出主要风险和下一步补齐方向",',
          '  "items": [',
          '    {',
          '      "id": "R001",',
          '      "category": "qualification|business|technical|scoring|rejection|delivery|service|price|other",',
          '      "ownerRole": "business|technical|finance|project_manager|product|legal|admin",',
          '      "priority": "critical|high|medium|low",',
          '      "status": "covered|partial|missing|risk|not_applicable",',
          '      "sourceClause": "招标条款编号/章节/依据短句",',
          '      "requirement": "招标要求摘要",',
          '      "responseStrategy": "投标文件中应该如何响应，必须具体",',
          '      "suggestedSection": "建议落到的章节/表格/附件",',
          '      "evidence": "已生成正文中的覆盖证据，可空",',
          '      "gap": "未覆盖或风险点，可空",',
          '      "score": "分值或评分影响，可空",',
          '      "risk": "废标/扣分/商务风险说明，可空"',
          '    }',
          '  ]',
          '}',
          '',
          '要求：',
          '1. 优先输出 critical/high 项：废标项、资格审查、投标文件组成、盖章签字、报价/控制价/保证金、工期、验收、质保、售后响应、核心技术要求、评分点。',
          '2. 每条 requirement 控制在 80 字以内；responseStrategy 要能直接指导投标人员补正文、补表格或补附件。',
          '3. 如果招标文件是经评审最低价，也要把实质性响应、报价不超限、明显不符合技术规范等作为高优先级项。',
          '4. 如果正文已经包含“完全响应/正偏离/点对点应答表”等证据，要在 evidence 中指出；否则指出 gap。',
          '5. 结合行业/采购类型画像识别行业特有资料、技术承诺和风险，但不得覆盖招标文件原文要求。',
          '6. 不要编造原文没有的分值、证书或业绩；无法确认时 score 留空。',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    feature: 'project.responseMatrix',
  });

  const matrix = normalizeResponseMatrix(raw);
  if (matrix.items.length === 0) {
    throw new Error('响应矩阵生成失败：模型未返回有效要求项。');
  }
  return matrix;
}

export function renderResponseMatrixForPrompt(matrix: ResponseMatrix | null): string {
  if (!matrix || matrix.items.length === 0) return '（尚未生成点对点响应矩阵）';
  const priorityRank: Record<ResponseItemPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const statusRank: Record<ResponseItemStatus, number> = {
    missing: 0,
    risk: 1,
    partial: 2,
    covered: 3,
    not_applicable: 4,
  };
  return matrix.items
    .slice()
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || statusRank[a.status] - statusRank[b.status])
    .slice(0, 36)
    .map((item) => {
      const source = item.sourceClause ? `；依据：${item.sourceClause}` : '';
      const section = item.suggestedSection ? `；建议落点：${item.suggestedSection}` : '';
      const score = item.score ? `；评分/影响：${item.score}` : '';
      const gap = item.gap ? `；待补：${item.gap}` : '';
      const risk = item.risk ? `；风险：${item.risk}` : '';
      return [
        `- [${item.id}] ${item.priority}/${item.status}/${item.category}/${item.ownerRole}`,
        `要求：${item.requirement}`,
        `应答策略：${item.responseStrategy}${source}${section}${score}${gap}${risk}`,
      ].join('\n  ');
    })
    .join('\n');
}
