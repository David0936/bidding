import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import { renderAnalysisForPrompt, renderFactsForPrompt } from '../analysis/analysisService.js';
import type { GlobalFacts, TenderAnalysis } from '../analysis/types.js';
import type { Outline } from '../outline/types.js';
import { renderOutlineText } from '../outline/treeUtils.js';
import { renderResponseMatrixForPrompt } from '../responseMatrix/responseMatrixService.js';
import type { ResponseMatrix } from '../responseMatrix/types.js';
import type { TenderFileType } from '../types.js';
import type {
  MaterialItemCategory,
  MaterialItemStatus,
  MaterialOwnerRole,
  ProjectMaterialChecklist,
  ProjectMaterialItem,
} from './types.js';

const MAX_TENDER_CHARS = 22000;

interface RawMaterialChecklist {
  summary?: unknown;
  items?: unknown;
}

const CATEGORIES = new Set<MaterialItemCategory>([
  'qualification',
  'business',
  'technical',
  'financial',
  'legal',
  'personnel',
  'performance',
  'price',
  'seal',
  'other',
]);

const OWNER_ROLES = new Set<MaterialOwnerRole>([
  'business',
  'technical',
  'finance',
  'project_manager',
  'product',
  'legal',
  'admin',
]);

const STATUSES = new Set<MaterialItemStatus>(['pending', 'uploaded', 'needs_review', 'not_required']);
const FILE_TYPES = new Set<TenderFileType>(['pdf', 'docx', 'txt', 'md']);

function normalizeCategory(value: unknown): MaterialItemCategory {
  const raw = String(value ?? '').trim();
  return CATEGORIES.has(raw as MaterialItemCategory) ? (raw as MaterialItemCategory) : 'other';
}

function normalizeOwnerRole(value: unknown): MaterialOwnerRole {
  const raw = String(value ?? '').trim();
  return OWNER_ROLES.has(raw as MaterialOwnerRole) ? (raw as MaterialOwnerRole) : 'admin';
}

function normalizeStatus(value: unknown): MaterialItemStatus {
  const raw = String(value ?? '').trim();
  return STATUSES.has(raw as MaterialItemStatus) ? (raw as MaterialItemStatus) : 'pending';
}

function normalizeAcceptedFileTypes(value: unknown): TenderFileType[] {
  if (!Array.isArray(value)) return ['pdf', 'docx', 'txt', 'md'];
  const out = value
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter((item): item is TenderFileType => FILE_TYPES.has(item as TenderFileType));
  return out.length ? Array.from(new Set(out)) : ['pdf', 'docx', 'txt', 'md'];
}

function normalizeChecklist(raw: RawMaterialChecklist): ProjectMaterialChecklist {
  const items: ProjectMaterialItem[] = [];
  if (Array.isArray(raw.items)) {
    raw.items.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const obj = item as Record<string, unknown>;
      const title = String(obj.title ?? '').trim();
      const description = String(obj.description ?? '').trim();
      const purpose = String(obj.purpose ?? '').trim();
      if (!title || !description || !purpose) return;
      items.push({
        id: String(obj.id ?? '').trim() || `M${String(index + 1).padStart(3, '0')}`,
        category: normalizeCategory(obj.category),
        ownerRole: normalizeOwnerRole(obj.ownerRole ?? obj.owner_role),
        required: obj.required === false ? false : true,
        status: normalizeStatus(obj.status),
        title,
        description,
        purpose,
        sourceClause: String(obj.sourceClause ?? obj.source_clause ?? '').trim() || undefined,
        suggestedSection: String(obj.suggestedSection ?? obj.suggested_section ?? '').trim() || undefined,
        acceptedFileTypes: normalizeAcceptedFileTypes(obj.acceptedFileTypes ?? obj.accepted_file_types),
        uploadTips: String(obj.uploadTips ?? obj.upload_tips ?? '').trim() || undefined,
        files: [],
      });
    });
  }

  const now = new Date().toISOString();
  return {
    summary:
      String(raw.summary ?? '').trim() ||
      `已梳理 ${items.length} 项客户需补充资料，请按项上传后再生成或刷新正文。`,
    items: items.slice(0, 80).map((item, index) => ({
      ...item,
      id: item.id || `M${String(index + 1).padStart(3, '0')}`,
      status: item.files.length > 0 ? 'uploaded' : item.status,
    })),
    generatedAt: now,
    updatedAt: now,
  };
}

export async function generateMaterialChecklist(
  config: AIConfig,
  tenderText: string,
  projectName: string,
  analysis: TenderAnalysis | null,
  facts: GlobalFacts | null,
  responseMatrix: ResponseMatrix | null,
  outline: Outline | null,
): Promise<ProjectMaterialChecklist> {
  const clippedTender = tenderText.slice(0, MAX_TENDER_CHARS);
  const tenderNote =
    tenderText.length > MAX_TENDER_CHARS
      ? '\n\n（注：招标文件较长，此处为前部内容节选；请优先梳理投标文件组成、资格审查、商务附件、技术证明、报价与盖章签字材料。）'
      : '';

  const raw = await jsonChat<RawMaterialChecklist>(config, {
    system: [
      '你是一名资深投标资料统筹经理。',
      '你的任务是根据招标文件，列出客户必须逐项上传/补充的信息和证明材料。',
      '输出要让不懂 AI、不懂投标细节的客户也能照着上传：标题清楚、说明具体、知道为什么要上传、上传后会补到哪个章节。',
      '不要编造招标文件没有要求的强制证书或业绩；如果是投标经验建议，可标为非必需。',
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
          '【响应矩阵】',
          renderResponseMatrixForPrompt(responseMatrix),
          '',
          '【投标目录】',
          outline ? renderOutlineText(outline) : '（尚未生成目录）',
          '',
          '请输出 JSON：',
          '{',
          '  "summary": "资料准备摘要，说明客户最需要先补哪些材料",',
          '  "items": [',
          '    {',
          '      "id": "M001",',
          '      "category": "qualification|business|technical|financial|legal|personnel|performance|price|seal|other",',
          '      "ownerRole": "business|technical|finance|project_manager|product|legal|admin",',
          '      "required": true,',
          '      "status": "pending",',
          '      "title": "客户看到的上传项名称",',
          '      "description": "需要上传什么材料/填写什么信息，尽量具体",',
          '      "purpose": "用于响应哪个要求或补充哪个投标内容",',
          '      "sourceClause": "招标条款编号/依据短句，可空",',
          '      "suggestedSection": "建议补充到的投标文件章节/附件/表格",',
          '      "acceptedFileTypes": ["pdf", "docx", "txt", "md"],',
          '      "uploadTips": "给客户的上传提示，如需加盖公章/扫描清晰/合同关键页等"',
          '    }',
          '  ]',
          '}',
          '',
          '要求：',
          '1. 优先列必需材料：营业执照/资质、法人证明和授权、保证金凭证、报价清单、业绩证明、财务资料、人员证书、技术参数/产品清单、售后承诺、偏离表所需依据、盖章签字材料。',
          '2. 技术项目要列业务资料：现状资料、设备清单、系统接口、图纸、品牌型号、实施边界、验收标准等，便于正文写得真实。',
          '3. 每项 title 简短；description 和 uploadTips 要让客户知道该传什么。',
          '4. required=false 只用于加分或建议性材料。',
          '5. 不要输出空泛的“上传相关资料”，必须具体到材料类型。',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    feature: 'project.materialChecklist',
  });

  const checklist = normalizeChecklist(raw);
  if (checklist.items.length === 0) {
    throw new Error('资料清单生成失败：模型未返回有效资料项。');
  }
  return checklist;
}
