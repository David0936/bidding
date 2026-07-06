import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import { renderAnalysisForPrompt } from '../analysis/analysisService.js';
import type { TenderAnalysis } from '../analysis/types.js';
import { getChapterText, type TenderChapter } from '../tenderChapters.js';
import type {
  IndustryConfidence,
  ProcurementObjectType,
  TenderIndustry,
  TenderIndustryProfile,
} from './types.js';

const MAX_TENDER_CHARS = 18000;
const MAX_LIST_ITEMS = 10;

const INDUSTRIES = new Set<TenderIndustry>([
  'software_it',
  'power_energy',
  'construction_infrastructure',
  'municipal_transport',
  'water_conservancy',
  'security_weak_current',
  'medical_education',
  'environmental_sanitation',
  'property_logistics',
  'industrial_manufacturing',
  'chemical_hazardous',
  'mining',
  'government_consulting',
  'general_procurement',
  'other',
]);

const PROCUREMENT_TYPES = new Set<ProcurementObjectType>([
  'engineering',
  'goods',
  'service',
  'software',
  'equipment',
  'epc',
  'operation',
  'consulting',
  'mixed',
  'other',
]);

const CONFIDENCE = new Set<IndustryConfidence>(['high', 'medium', 'low']);

const INDUSTRY_LABELS: Record<TenderIndustry, string> = {
  software_it: '软件信息化',
  power_energy: '电力能源',
  construction_infrastructure: '建筑基建',
  municipal_transport: '市政交通',
  water_conservancy: '水利水务',
  security_weak_current: '安防弱电',
  medical_education: '医疗教育',
  environmental_sanitation: '环保环卫',
  property_logistics: '物业物流',
  industrial_manufacturing: '工业制造',
  chemical_hazardous: '化工危化',
  mining: '矿山资源',
  government_consulting: '政务咨询',
  general_procurement: '通用采购',
  other: '其他行业',
};

const PROCUREMENT_LABELS: Record<ProcurementObjectType, string> = {
  engineering: '工程类',
  goods: '货物类',
  service: '服务类',
  software: '软件类',
  equipment: '设备类',
  epc: 'EPC/总承包',
  operation: '运营维护类',
  consulting: '咨询类',
  mixed: '综合类',
  other: '其他',
};

interface RawTenderIndustryProfile {
  industry?: unknown;
  procurementType?: unknown;
  procurement_type?: unknown;
  confidence?: unknown;
  title?: unknown;
  reasoning?: unknown;
  keywords?: unknown;
  materialHints?: unknown;
  material_hints?: unknown;
  responseFocus?: unknown;
  response_focus?: unknown;
  riskFocus?: unknown;
  risk_focus?: unknown;
  templateHints?: unknown;
  template_hints?: unknown;
}

function normalizeIndustry(value: unknown): TenderIndustry {
  const raw = String(value ?? '').trim();
  return INDUSTRIES.has(raw as TenderIndustry) ? (raw as TenderIndustry) : 'other';
}

function normalizeProcurementType(value: unknown): ProcurementObjectType {
  const raw = String(value ?? '').trim();
  return PROCUREMENT_TYPES.has(raw as ProcurementObjectType) ? (raw as ProcurementObjectType) : 'mixed';
}

function normalizeConfidence(value: unknown): IndustryConfidence {
  const raw = String(value ?? '').trim();
  return CONFIDENCE.has(raw as IndustryConfidence) ? (raw as IndustryConfidence) : 'medium';
}

function normalizeList(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
  return items.length ? Array.from(new Set(items)) : fallback;
}

function defaultTitle(industry: TenderIndustry, procurementType: ProcurementObjectType): string {
  return `${INDUSTRY_LABELS[industry]} / ${PROCUREMENT_LABELS[procurementType]}`;
}

function normalizeProfile(raw: RawTenderIndustryProfile): TenderIndustryProfile {
  const industry = normalizeIndustry(raw.industry);
  const procurementType = normalizeProcurementType(raw.procurementType ?? raw.procurement_type);
  const confidence = normalizeConfidence(raw.confidence);
  const title = String(raw.title ?? '').trim() || defaultTitle(industry, procurementType);

  return {
    industry,
    procurementType,
    confidence,
    title,
    reasoning:
      String(raw.reasoning ?? '').trim() ||
      '已根据招标文件中的项目名称、采购内容、技术要求、资格条件和评分办法进行行业与采购对象判断。',
    keywords: normalizeList(raw.keywords),
    materialHints: normalizeList(raw.materialHints ?? raw.material_hints, [
      '营业执照、授权委托、资质证明、业绩证明、技术/服务方案、报价文件、盖章签字材料',
    ]),
    responseFocus: normalizeList(raw.responseFocus ?? raw.response_focus, [
      '实质性响应、评分点覆盖、交付服务承诺、偏离表、验收与售后',
    ]),
    riskFocus: normalizeList(raw.riskFocus ?? raw.risk_focus, [
      '无效投标条款、资格不满足、报价超限、盖章签字缺失、承诺与招标要求不一致',
    ]),
    templateHints: normalizeList(raw.templateHints ?? raw.template_hints, [
      `${INDUSTRY_LABELS[industry]}${PROCUREMENT_LABELS[procurementType]}投标文件结构`,
    ]),
    generatedAt: new Date().toISOString(),
  };
}

export async function classifyTenderIndustry(
  config: AIConfig,
  tenderText: string,
  projectName: string,
  analysis: TenderAnalysis | null,
  chapters?: TenderChapter[],
): Promise<TenderIndustryProfile> {
  const clippedTender = chapters?.length
    ? getChapterText(tenderText, chapters, ['notice', 'requirements'], MAX_TENDER_CHARS)
    : tenderText.slice(0, MAX_TENDER_CHARS);
  const tenderNote =
    !chapters?.length && tenderText.length > MAX_TENDER_CHARS
      ? '\n\n（注：招标文件较长，此处为前部内容节选；请优先依据项目名称、采购需求、投标文件组成、资格条件、评分办法、合同条款判断。）'
      : '';

  const raw = await jsonChat<RawTenderIndustryProfile>(config, {
    system: [
      '你是一名资深投标总监，熟悉中国招投标和政府采购项目。',
      '你的任务是根据招标文件自动识别行业和采购对象类型，为后续目录、响应矩阵、资料清单和正文写作提供画像。',
      '行业识别要服务于投标业务，不要机械套分类；招标文件原文永远优先于行业经验。',
      '不要输出长篇原文摘抄；只输出可执行的行业画像 JSON。',
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
          '【已解析关键项】',
          renderAnalysisForPrompt(analysis),
          '',
          '请判断以下两个维度：',
          '1. industry：software_it|power_energy|construction_infrastructure|municipal_transport|water_conservancy|security_weak_current|medical_education|environmental_sanitation|property_logistics|industrial_manufacturing|chemical_hazardous|mining|government_consulting|general_procurement|other',
          '2. procurementType：engineering|goods|service|software|equipment|epc|operation|consulting|mixed|other',
          '',
          '分类提示：',
          '- 软件信息化：平台建设、软件开发、系统集成、数据治理、网络安全、运维服务、SaaS/信息化项目。',
          '- 电力能源：电厂、新能源、储能、变配电、光伏、风电、充电、能源管理、数字能源。',
          '- 建筑基建/市政交通/水利水务：施工、勘察设计、监理、道路桥梁、管网、水处理、EPC 等。',
          '- 安防弱电：视频监控、门禁、综合布线、机房、会议系统、智慧园区弱电集成。',
          '- 工业制造/化工危化/矿山：生产线、设备、备品备件、安全环保、矿山数字化或专业工程。',
          '- 医疗教育、环保环卫、物业物流、政务咨询和通用采购按采购内容判断。',
          '- 若跨多个行业，以投标文件编制影响最大的主行业为 industry；采购对象混合则 procurementType 用 mixed。',
          '',
          '请输出 JSON：',
          '{',
          '  "industry": "software_it",',
          '  "procurementType": "software",',
          '  "confidence": "high|medium|low",',
          '  "title": "客户可读的行业/采购类型标题",',
          '  "reasoning": "为什么这样判断，控制在 120 字内",',
          '  "keywords": ["触发判断的关键词"],',
          '  "materialHints": ["这个行业常要客户补的资料，结合招标文件"],',
          '  "responseFocus": ["写响应矩阵和正文时最该覆盖的点"],',
          '  "riskFocus": ["这个行业/采购类型常见废标或扣分风险"],',
          '  "templateHints": ["适合采用的标书结构或章节方向"]',
          '}',
          '',
          '要求：',
          '1. materialHints、responseFocus、riskFocus 必须结合招标文件，而不是泛泛罗列。',
          '2. 如果证据不足，confidence 用 low，并在 reasoning 说明不确定点。',
          '3. 不要臆造招标文件没有出现的资质、证书、标准编号或行业监管要求。',
        ].join('\n'),
      },
    ],
    temperature: 0.15,
    feature: 'project.industryProfile',
  });

  return normalizeProfile(raw);
}

export function renderIndustryProfileForPrompt(profile: TenderIndustryProfile | null): string {
  if (!profile) return '（尚未生成招标书行业/采购类型画像）';
  return [
    `行业画像：${profile.title}`,
    `分类：${INDUSTRY_LABELS[profile.industry]} / ${PROCUREMENT_LABELS[profile.procurementType]} / 置信度 ${profile.confidence}`,
    `判断依据：${profile.reasoning}`,
    profile.keywords.length ? `关键词：${profile.keywords.join('、')}` : '',
    profile.materialHints.length ? `资料重点：${profile.materialHints.join('；')}` : '',
    profile.responseFocus.length ? `响应重点：${profile.responseFocus.join('；')}` : '',
    profile.riskFocus.length ? `风险重点：${profile.riskFocus.join('；')}` : '',
    profile.templateHints.length ? `结构提示：${profile.templateHints.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
