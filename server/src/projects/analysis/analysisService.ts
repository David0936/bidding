import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import type { Outline } from '../outline/types.js';
import { renderOutlineText } from '../outline/treeUtils.js';
import type {
  GlobalFact,
  GlobalFacts,
  RejectionRequirement,
  TenderAnalysis,
  TenderRequirement,
} from './types.js';

const MAX_ANALYSIS_TENDER_CHARS = 18000;
const MAX_FACT_TENDER_CHARS = 16000;
const MAX_FACT_ORIGINAL_PLAN_CHARS = 9000;

const EMPTY_ANALYSIS: TenderAnalysis = {
  summary: '',
  projectInfo: {},
  buyerInfo: {},
  deliveryAndServiceRequirements: {},
  keyRequirements: [],
  rejectionRequirements: [],
  updatedAt: '',
};

interface RawTenderAnalysis {
  summary?: unknown;
  projectInfo?: unknown;
  buyerInfo?: unknown;
  deliveryAndServiceRequirements?: unknown;
  keyRequirements?: unknown;
  rejectionRequirements?: unknown;
}

interface RawGlobalFacts {
  items?: unknown;
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalized = String(raw ?? '').trim();
    if (key.trim() && normalized) out[key.trim()] = normalized;
  }
  return out;
}

function normalizeRequirements(value: unknown): TenderRequirement[] {
  if (!Array.isArray(value)) return [];
  const out: TenderRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const title = String(raw.title ?? '').trim();
    const detail = String(raw.detail ?? '').trim();
    if (!title || !detail) continue;
    out.push({
      title,
      detail,
      source: String(raw.source ?? '').trim() || undefined,
      score: String(raw.score ?? '').trim() || undefined,
      category: String(raw.category ?? '').trim() || undefined,
    });
  }
  return out.slice(0, 40);
}

function normalizeRejectionRequirements(value: unknown): RejectionRequirement[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set(['invalid_bid', 'rejection', 'potential_risk']);
  const out: RejectionRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const title = String(raw.title ?? '').trim();
    const detail = String(raw.detail ?? '').trim();
    const rawKind = String(raw.kind ?? '').trim();
    if (!title || !detail) continue;
    out.push({
      kind: kinds.has(rawKind) ? (rawKind as RejectionRequirement['kind']) : 'potential_risk',
      title,
      detail,
      source: String(raw.source ?? '').trim() || undefined,
    });
  }
  return out.slice(0, 40);
}

function normalizeAnalysis(raw: RawTenderAnalysis): TenderAnalysis {
  return {
    ...EMPTY_ANALYSIS,
    summary: String(raw.summary ?? '').trim(),
    projectInfo: asRecord(raw.projectInfo),
    buyerInfo: asRecord(raw.buyerInfo),
    deliveryAndServiceRequirements: asRecord(raw.deliveryAndServiceRequirements),
    keyRequirements: normalizeRequirements(raw.keyRequirements),
    rejectionRequirements: normalizeRejectionRequirements(raw.rejectionRequirements),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeFacts(raw: RawGlobalFacts): GlobalFacts {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const normalized: GlobalFact[] = [];
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const rawItem = item as Record<string, unknown>;
    const title = String(rawItem.title ?? '').trim();
    const value = String(rawItem.value ?? '').trim();
    if (!title || !value) return;
    normalized.push({
      id: String(rawItem.id ?? '').trim() || `F${String(index + 1).padStart(3, '0')}`,
      category: String(rawItem.category ?? '').trim() || '其他',
      title,
      value,
      source: String(rawItem.source ?? '').trim() || undefined,
      notes: String(rawItem.notes ?? '').trim() || undefined,
    });
  });

  return {
    items: normalized.slice(0, 60).map((item, index) => ({
      ...item,
      id: item.id || `F${String(index + 1).padStart(3, '0')}`,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export async function analyzeTender(
  config: AIConfig,
  tenderText: string,
  projectName: string,
): Promise<TenderAnalysis> {
  const clipped = tenderText.slice(0, MAX_ANALYSIS_TENDER_CHARS);
  const truncatedNote =
    tenderText.length > MAX_ANALYSIS_TENDER_CHARS
      ? '\n\n（注：招标文件较长，此处为前部内容节选；请基于可见原文谨慎提取，不要编造。）'
      : '';

  const raw = await jsonChat<RawTenderAnalysis>(config, {
    system: [
      '你是一名资深招投标文件分析专家。',
      '请从招标文件中提取后续编写投标技术方案必须用到的结构化信息。',
      '不要猜测原文没有的信息；无法确认的字段不要输出。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `项目名称：${projectName}`,
          '',
          '招标文件内容：',
          '"""',
          clipped + truncatedNote,
          '"""',
          '',
          '请输出 JSON，字段如下：',
          '{',
          '  "summary": "100~200字项目摘要",',
          '  "projectInfo": { "project_name": "项目名称", "budget": "预算/最高限价", "bid_deadline": "投标截止时间", "procurement_scope": "采购/建设范围" },',
          '  "buyerInfo": { "buyer": "采购人/甲方", "agency": "代理机构", "contact": "联系人", "address": "地址" },',
          '  "deliveryAndServiceRequirements": {',
          '    "implementation_period": "实施周期/工期/交付期限",',
          '    "delivery_scope": "交付范围",',
          '    "delivery_location": "交付/实施地点",',
          '    "acceptance_requirements": "验收要求",',
          '    "warranty_period": "质保期",',
          '    "after_sales_service": "售后服务要求",',
          '    "response_time": "响应时限",',
          '    "training_requirements": "培训要求",',
          '    "documentation_requirements": "资料/文档交付要求"',
          '  },',
          '  "keyRequirements": [',
          '    { "category": "技术/商务/评分", "title": "要求标题", "detail": "具体要求", "score": "分值，如无则空", "source": "原文依据短句" }',
          '  ],',
          '  "rejectionRequirements": [',
          '    { "kind": "invalid_bid|rejection|potential_risk", "title": "条款标题", "detail": "条款内容或风险说明", "source": "原文依据；经验推断则说明原因" }',
          '  ]',
          '}',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    feature: 'project.tenderAnalysis',
  });

  const analysis = normalizeAnalysis(raw);
  if (!analysis.summary && Object.keys(analysis.projectInfo).length === 0) {
    throw new Error('招标文件解析失败：模型未返回有效关键项。');
  }
  return analysis;
}

export async function generateGlobalFacts(
  config: AIConfig,
  tenderText: string,
  outline: Outline,
  analysis: TenderAnalysis | null,
  originalPlanText: string | null = null,
): Promise<GlobalFacts> {
  const clipped = tenderText.slice(0, MAX_FACT_TENDER_CHARS);
  const clippedOriginalPlan = originalPlanText?.slice(0, MAX_FACT_ORIGINAL_PLAN_CHARS) ?? '';
  const raw = await jsonChat<RawGlobalFacts>(config, {
    system: [
      '你是一名投标技术方案一致性审校专家。',
      '请识别全文写作中必须保持一致的事实变量。它们会被后续章节生成引用，用于避免周期、地点、金额、范围、服务承诺、人员资质等前后矛盾。',
      '只输出对正文一致性有帮助的事实，不要输出泛泛的写作建议。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          '【招标文件节选】',
          '"""',
          clipped,
          '"""',
          '',
          '【已解析关键项】',
          JSON.stringify(analysis ?? EMPTY_ANALYSIS, null, 2),
          '',
          '【投标技术方案目录】',
          renderOutlineText(outline),
          '',
          '【已有技术方案节选】',
          clippedOriginalPlan || '（未上传已有技术方案）',
          '',
          '请输出 JSON：',
          '{',
          '  "items": [',
          '    { "id": "F001", "category": "项目/甲方/交付/服务/资质/金额/评分/风险/其他", "title": "事实标题", "value": "必须保持一致的事实内容", "source": "原文依据", "notes": "写作时如何引用，可为空" }',
          '  ]',
          '}',
          '',
          '要求：',
          '1. 优先提取项目名称、甲方/采购人、实施地点、工期/交付期、验收、质保、售后响应、培训、资料交付、预算或最高限价、关键评分点、资质/人员/设备要求。',
          '2. 如果已有技术方案中包含明确承诺、参数、服务机制或实施方法，且不与招标文件冲突，也要作为事实保留。',
          '3. 对无法确认的信息不要编造。',
          '4. 每条 value 要具体到可直接约束正文写作。',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    feature: 'project.globalFacts',
  });

  const facts = normalizeFacts(raw);
  if (facts.items.length === 0) {
    throw new Error('全局事实生成失败：模型未返回有效事实条目。');
  }
  return facts;
}

export function renderAnalysisForPrompt(analysis: TenderAnalysis | null): string {
  if (!analysis) return '（尚未解析关键项）';
  return JSON.stringify(
    {
      summary: analysis.summary,
      projectInfo: analysis.projectInfo,
      buyerInfo: analysis.buyerInfo,
      deliveryAndServiceRequirements: analysis.deliveryAndServiceRequirements,
      keyRequirements: analysis.keyRequirements.slice(0, 20),
    },
    null,
    2,
  );
}

export function renderFactsForPrompt(facts: GlobalFacts | null): string {
  if (!facts || facts.items.length === 0) return '（尚未设置全局事实）';
  return facts.items
    .map((item) => {
      const source = item.source ? `；依据：${item.source}` : '';
      const notes = item.notes ? `；写作提示：${item.notes}` : '';
      return `- [${item.id}] ${item.category} / ${item.title}：${item.value}${source}${notes}`;
    })
    .join('\n');
}
