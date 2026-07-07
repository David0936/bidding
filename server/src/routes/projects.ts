// 项目相关接口：增删查 + 招标文件上传解析。
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import {
  createProject,
  listProjectsForAccount,
  getProject,
  updateProject,
  deleteProject,
  saveTender,
  saveBidSections,
  selectBidSection,
  resetBidSection,
  getTenderText,
  getTenderOriginalText,
  saveTenderChapters,
  getTenderChapters,
  saveOriginalPlan,
  getOriginalPlanText,
  deleteOriginalPlan,
  saveOutline,
  getOutline,
  saveAnalysis,
  getAnalysis,
  saveIndustryProfile,
  getIndustryProfile,
  saveGlobalFacts,
  getGlobalFacts,
  saveResponseMatrix,
  getResponseMatrix,
  saveDeviationTable,
  getDeviationTable,
  saveMaterialChecklist,
  getMaterialChecklist,
  saveFormatDocs,
  getFormatDocs,
  saveMaterialFile,
  deleteMaterialFile,
  getMaterialFileBinary,
  getMaterialFileText,
  renderProjectMaterialsForPrompt,
  saveConsistencyAudit,
  getConsistencyAudit,
  saveBidReadinessReport,
  getBidReadinessReport,
  saveSeal,
  getSealImage,
  deleteSeal,
  saveSealPlacements,
  getSealPlacements,
} from '../projects/projectStore.js';
import { parseDocument, detectFileType } from '../projects/docParser.js';
import { parseMaterialFile, materialMimeType } from '../projects/materialParser.js';
import { filterOutlineByVolume, isBidVolume, VOLUME_LABELS } from '../projects/export/volumeUtils.js';
import { PDFDocument } from 'pdf-lib';
import { detectBidSections } from '../projects/bidSections.js';
import { detectTenderChapters, getChapterText } from '../projects/tenderChapters.js';
import { generateOutline, generateOutlineVariants } from '../projects/outline/outlineService.js';
import { generateSectionContent } from '../projects/content/contentService.js';
import { analyzeTender, generateGlobalFacts } from '../projects/analysis/analysisService.js';
import { classifyTenderIndustry } from '../projects/industryProfile/industryProfileService.js';
import { generateResponseMatrix } from '../projects/responseMatrix/responseMatrixService.js';
import { generateDeviationTableFromResponseMatrix } from '../projects/deviationTable/deviationTableService.js';
import { generateMaterialChecklist } from '../projects/materialChecklist/materialChecklistService.js';
import { generateFormatDocs, refreshFormatDocFilledText } from '../projects/formatDocs/formatDocsService.js';
import { auditConsistency } from '../projects/audit/consistencyAuditService.js';
import { buildBidReadinessReport } from '../projects/readiness/readinessService.js';
import { listKnowledgeItems } from '../knowledge/knowledgeStore.js';
import { findNode, setNodeContent } from '../projects/outline/treeUtils.js';
import { buildDocx, buildMarkdown, buildPdf, type MaterialImageResolver } from '../projects/export/exportService.js';
import {
  buildBidReadinessCsv,
  buildBidReadinessMarkdown,
  buildDeviationTableCsv,
  buildDeviationTableMarkdown,
  buildMaterialChecklistCsv,
  buildMaterialChecklistMarkdown,
  buildResponseMatrixCsv,
  buildResponseMatrixMarkdown,
} from '../projects/export/workbookExportService.js';
import { loadConfig } from '../store/configStore.js';
import { errorMessage, errorStatus } from './errors.js';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { assertFeatureAccess, assertProjectCreationAllowed } from '../billing/billingStore.js';
import { extractBearerToken, resolveToken } from '../auth/authStore.js';
import { getBidderProfile } from '../bidder/bidderProfileStore.js';
import type { BillingFeatureCode } from '../billing/types.js';
import type { ElectronicSeal, Project, SealPlacement, TenderDoc } from '../projects/types.js';
import type { Outline } from '../projects/outline/types.js';
import type { GlobalFacts, TenderAnalysis } from '../projects/analysis/types.js';
import type { FormatDoc, FormatDocsResult, FormatDocVolume } from '../projects/formatDocs/types.js';

export const projectsRouter = Router();

// 内存存储，单文件最大 30MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

function currentAccountId(req?: Request): string {
  const token = extractBearerToken(req?.headers.authorization);
  const user = resolveToken(token);
  return user?.accountId ?? getCurrentAccountId();
}

function findOwnedProject(id: string, req?: Request): Project | null {
  return getProject(id, currentAccountId(req));
}

function requireFeature(req: Request, res: Response, feature: BillingFeatureCode): boolean {
  try {
    assertFeatureAccess(currentAccountId(req), feature);
    return true;
  } catch (err) {
    res.status(errorStatus(err, 403)).json({ message: errorMessage(err, '当前套餐未开通该功能') });
    return false;
  }
}

function safeExportBaseName(name: string): string {
  return (name || '投标技术方案').replace(/[\\/:*?"<>|]/g, '_');
}

const FORMAT_DOC_VOLUMES = new Set<FormatDocVolume>(['business', 'price', 'technical']);

function emptyFormatDocsResult(): FormatDocsResult {
  const now = new Date().toISOString();
  return { sourceChapter: '', docs: [], generatedAt: now, updatedAt: now };
}

function estimateWords(text: string): number {
  const compact = text.replace(/\s+/g, '');
  return Math.max(300, Math.min(3000, compact.length));
}

function stripInsertedFormatNodes(nodes: Outline['nodes']): Outline['nodes'] {
  return nodes
    .filter((node) => !node.id.startsWith('fmt_'))
    .map((node) => ({
      ...node,
      children: stripInsertedFormatNodes(node.children),
    }));
}

function normalizeFormatDocUpdate(current: FormatDoc, body: unknown): FormatDoc {
  const patch = body && typeof body === 'object' ? (body as Partial<FormatDoc> & { reapplyFields?: boolean }) : {};
  const next: FormatDoc = {
    ...current,
    filledText: typeof patch.filledText === 'string' ? patch.filledText : current.filledText,
    fields: Array.isArray(patch.fields)
      ? patch.fields.map((field, index) => ({
          key: String(field?.key ?? '').trim() || `field_${index + 1}`,
          label: String(field?.label ?? '').trim() || `字段 ${index + 1}`,
          source: field?.source === 'project' || field?.source === 'bidder' || field?.source === 'manual'
            ? field.source
            : 'manual',
          value: String(field?.value ?? ''),
        }))
      : current.fields,
    status: patch.status === 'confirmed' ? 'confirmed' : patch.status === 'draft' ? 'draft' : current.status,
    volume: FORMAT_DOC_VOLUMES.has(patch.volume as FormatDocVolume)
      ? (patch.volume as FormatDocVolume)
      : current.volume,
  };
  return patch.reapplyFields ? refreshFormatDocFilledText(next) : next;
}

function normalizePlacement(input: unknown): SealPlacement | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<SealPlacement>;
  const page = Math.trunc(Number(raw.page));
  const xRatio = Number(raw.xRatio);
  const yRatio = Number(raw.yRatio);
  const widthRatio = Number(raw.widthRatio);
  if (!Number.isFinite(page) || page < 1) return null;
  if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio) || !Number.isFinite(widthRatio)) return null;
  return {
    id: String(raw.id || `seal-${Date.now()}`),
    page,
    xRatio: Math.min(Math.max(xRatio, 0), 1),
    yRatio: Math.min(Math.max(yRatio, 0), 1),
    widthRatio: Math.min(Math.max(widthRatio, 0.05), 0.6),
    opacity: Math.min(Math.max(Number(raw.opacity ?? 1), 0.1), 1),
    rotation: Number.isFinite(Number(raw.rotation)) ? Number(raw.rotation) : 0,
  };
}

/** 构造 material:// 图片解析器：导出时把资料库中的证照/照片嵌入文档 */
function materialImageResolver(projectId: string): MaterialImageResolver {
  return ({ itemId, fileId }) => {
    const found = getMaterialFileBinary(projectId, itemId, fileId);
    if (!found) return null;
    if (found.file.fileType !== 'png' && found.file.fileType !== 'jpg') return null;
    return { buffer: found.buffer, mimeType: materialMimeType(found.file.fileType) };
  };
}

/** 按 ?volume= 查询参数裁剪导出目录；返回裁剪结果与文件名后缀 */
function resolveExportOutline(
  req: Request,
  outline: Outline,
): { outline: Outline; suffix: string } | { error: string } {
  const raw = String(req.query.volume ?? '').trim();
  if (!raw) return { outline, suffix: '' };
  if (!isBidVolume(raw)) return { error: '分册参数不正确，支持 technical/business/price/other' };
  const filtered = filterOutlineByVolume(outline, raw);
  if (filtered.nodes.length === 0) {
    return { error: `没有章节归属于「${VOLUME_LABELS[raw]}」，请先在目录中标记分册` };
  }
  return { outline: filtered, suffix: `-${VOLUME_LABELS[raw]}` };
}

function exportDocTitle(suffix: string): string {
  return suffix ? `投标文件（${suffix.slice(1)}）` : '投标文件';
}

function sendDownload(res: Response, buffer: Buffer, contentType: string, fileName: string): void {
  const fallback = fileName.endsWith('.pdf')
    ? 'export.pdf'
    : fileName.endsWith('.docx')
      ? 'export.docx'
      : fileName.endsWith('.md')
        ? 'export.md'
        : fileName.endsWith('.csv')
          ? 'export.csv'
          : 'export';
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.send(buffer);
}

function sendMarkdownExport(res: Response, content: string, fileName: string): void {
  sendDownload(res, Buffer.from(content, 'utf-8'), 'text/markdown; charset=utf-8', fileName);
}

function sendCsvExport(res: Response, content: string, fileName: string): void {
  sendDownload(res, Buffer.from(`\ufeff${content}`, 'utf-8'), 'text/csv; charset=utf-8', fileName);
}

// 创建项目
projectsRouter.post('/', (req, res) => {
  const accountId = currentAccountId(req);
  try {
    assertProjectCreationAllowed(accountId, listProjectsForAccount(accountId).length);
  } catch (err) {
    return res.status(errorStatus(err, 403)).json({ message: errorMessage(err, '当前套餐无法创建项目') });
  }
  const project = createProject(req.body?.name, accountId);
  res.json(project);
});

// 项目列表
projectsRouter.get('/', (req, res) => {
  res.json(listProjectsForAccount(currentAccountId(req)));
});

// 项目详情（可选带招标文件 Markdown：?withText=1）
projectsRouter.get('/:id', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (req.query.withText === '1') {
    return res.json({ ...project, tenderText: getTenderText(req.params.id) ?? '' });
  }
  res.json(project);
});

// 重命名
projectsRouter.put('/:id', (req, res) => {
  const updated = updateProject(req.params.id, { name: req.body?.name }, currentAccountId(req));
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json(updated);
});

// 删除
projectsRouter.delete('/:id', (req, res) => {
  const ok = deleteProject(req.params.id, currentAccountId(req));
  res.json({ ok });
});

// 招标文件 Markdown（tender-text 为历史兼容接口）
projectsRouter.get('/:id/tender-text', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const text = getTenderText(req.params.id);
  if (text === null) return res.status(404).json({ message: '尚未上传招标文件' });
  res.json({ text });
});

projectsRouter.get('/:id/tender-markdown', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const markdown = getTenderText(req.params.id);
  if (markdown === null) return res.status(404).json({ message: '尚未上传招标文件' });
  res.json({ markdown });
});

projectsRouter.get('/:id/tender-original-markdown', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const markdown = getTenderOriginalText(req.params.id);
  if (markdown === null) return res.status(404).json({ message: '尚未上传招标文件' });
  res.json({ markdown });
});

projectsRouter.get('/:id/tender-chapters', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  res.json({ chapters: getTenderChapters(req.params.id) });
});

// 已有技术方案 Markdown（original-plan-text 为历史兼容接口）
projectsRouter.get('/:id/original-plan-text', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const text = getOriginalPlanText(req.params.id);
  if (text === null) return res.status(404).json({ message: '尚未上传已有技术方案' });
  res.json({ text });
});

projectsRouter.get('/:id/original-plan-markdown', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const markdown = getOriginalPlanText(req.params.id);
  if (markdown === null) return res.status(404).json({ message: '尚未上传已有技术方案' });
  res.json({ markdown });
});

// 自动识别多标段/分包
projectsRouter.post('/:id/bid-sections/detect', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const markdown = getTenderOriginalText(req.params.id);
  if (markdown === null) return res.status(400).json({ message: '请先上传并解析招标文件' });
  const updated = saveBidSections(req.params.id, detectBidSections(markdown), currentAccountId(req));
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json(updated);
});

// 选择某个标段/分包作为当前投标范围
projectsRouter.post('/:id/bid-sections/select', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const sectionId = String(req.body?.sectionId ?? '').trim();
  if (!sectionId) return res.status(400).json({ message: '缺少标段 ID' });
  if (!project.bidSections.some((section) => section.id === sectionId)) {
    return res.status(400).json({ message: '标段不存在，请重新识别后再选择' });
  }
  const updated = selectBidSection(req.params.id, sectionId, currentAccountId(req));
  if (!updated) return res.status(400).json({ message: '无法应用该标段，请重新上传招标文件后再试' });
  const focused = getTenderText(req.params.id);
  if (focused) saveTenderChapters(req.params.id, detectTenderChapters(focused));
  res.json(updated);
});

// 恢复使用完整招标文件
projectsRouter.post('/:id/bid-sections/reset', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const updated = resetBidSection(req.params.id, currentAccountId(req));
  if (!updated) return res.status(400).json({ message: '无法恢复全文，请重新上传招标文件后再试' });
  const full = getTenderText(req.params.id);
  if (full) saveTenderChapters(req.params.id, detectTenderChapters(full));
  res.json(updated);
});

// 读取已保存的招标文件关键项解析
projectsRouter.get('/:id/analysis', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const analysis = getAnalysis(req.params.id);
  if (!analysis) return res.status(404).json({ message: '尚未解析招标文件关键项' });
  res.json(analysis);
});

// AI 解析招标文件关键项
projectsRouter.post('/:id/analysis/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const analysis = await analyzeTender(loadConfig(), tenderText, project.name, getTenderChapters(req.params.id));
    saveAnalysis(req.params.id, analysis);
    res.json(analysis);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '招标文件关键项解析失败') });
  }
});

// 保存手动编辑后的关键项解析
projectsRouter.put('/:id/analysis', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const incoming = req.body as TenderAnalysis;
  const analysis: TenderAnalysis = {
    summary: String(incoming?.summary ?? '').trim(),
    projectInfo: incoming?.projectInfo && typeof incoming.projectInfo === 'object' ? incoming.projectInfo : {},
    buyerInfo: incoming?.buyerInfo && typeof incoming.buyerInfo === 'object' ? incoming.buyerInfo : {},
    deliveryAndServiceRequirements:
      incoming?.deliveryAndServiceRequirements && typeof incoming.deliveryAndServiceRequirements === 'object'
        ? incoming.deliveryAndServiceRequirements
        : {},
    keyRequirements: Array.isArray(incoming?.keyRequirements) ? incoming.keyRequirements : [],
    rejectionRequirements: Array.isArray(incoming?.rejectionRequirements) ? incoming.rejectionRequirements : [],
    updatedAt: new Date().toISOString(),
  };
  saveAnalysis(req.params.id, analysis);
  res.json(analysis);
});

// 读取已保存的行业/采购类型画像
projectsRouter.get('/:id/industry-profile', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const profile = getIndustryProfile(req.params.id);
  if (!profile) return res.status(404).json({ message: '尚未识别招标书行业/采购类型' });
  res.json(profile);
});

// AI 识别招标书行业/采购类型画像
projectsRouter.post('/:id/industry-profile/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const profile = await classifyTenderIndustry(
      loadConfig(),
      tenderText,
      project.name,
      getAnalysis(req.params.id),
      getTenderChapters(req.params.id),
    );
    saveIndustryProfile(req.params.id, profile);
    res.json(profile);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '行业/采购类型识别失败') });
  }
});

// 上传并解析招标文件
projectsRouter.post('/:id/tender', upload.single('file'), async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (!req.file) return res.status(400).json({ message: '未收到文件' });

  const fileName = req.file.originalname;
  const fileType = detectFileType(fileName);
  if (!fileType) {
    return res.status(400).json({ message: '暂不支持的文件格式，请上传 PDF、Word(.docx)、txt 或 md。' });
  }

  try {
    const { text } = await parseDocument(req.file.buffer, fileName);
    const tender: TenderDoc = {
      fileName,
      fileType,
      charCount: text.length,
      uploadedAt: new Date().toISOString(),
    };
    const saved = saveTender(req.params.id, tender, text, req.file.buffer, fileType);
    if (!saved) return res.status(404).json({ message: '项目不存在' });
    saveTenderChapters(req.params.id, detectTenderChapters(text));
    const updated = saveBidSections(req.params.id, detectBidSections(text), currentAccountId(req)) ?? saved;
    res.json({ project: updated, charCount: text.length, preview: text.slice(0, 2000) });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '解析失败') });
  }
});

// 上传并解析已有技术方案（扩写模式）
projectsRouter.post('/:id/original-plan', upload.single('file'), async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (!req.file) return res.status(400).json({ message: '未收到文件' });

  const fileName = req.file.originalname;
  const fileType = detectFileType(fileName);
  if (!fileType) {
    return res.status(400).json({ message: '暂不支持的文件格式，请上传 PDF、Word(.docx)、txt 或 md。' });
  }

  try {
    const { text } = await parseDocument(req.file.buffer, fileName);
    const originalPlan: TenderDoc = {
      fileName,
      fileType,
      charCount: text.length,
      uploadedAt: new Date().toISOString(),
    };
    const updated = saveOriginalPlan(req.params.id, originalPlan, text, req.file.buffer, fileType);
    res.json({ project: updated, charCount: text.length, preview: text.slice(0, 2000) });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '已有方案解析失败') });
  }
});

projectsRouter.delete('/:id/original-plan', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const updated = deleteOriginalPlan(req.params.id);
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json(updated);
});

// 读取已保存的目录
projectsRouter.get('/:id/outline', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(404).json({ message: '尚未生成目录' });
  res.json(outline);
});

// AI 生成目录
projectsRouter.post('/:id/outline/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const outline = await generateOutline(
      loadConfig(),
      tenderText,
      project.name,
      listKnowledgeItems(currentAccountId(req)),
      getOriginalPlanText(req.params.id),
      getTenderChapters(req.params.id),
    );
    saveOutline(req.params.id, outline);
    res.json(outline);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '目录生成失败') });
  }
});

// AI 生成 3 套目录方案（供用户选择）
projectsRouter.post('/:id/outline/variants', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const variants = await generateOutlineVariants(
      loadConfig(),
      tenderText,
      project.name,
      listKnowledgeItems(currentAccountId(req)),
      getOriginalPlanText(req.params.id),
      getTenderChapters(req.params.id),
    );
    res.json(variants);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '目录方案生成失败') });
  }
});

// 保存（手动编辑后的）目录
projectsRouter.put('/:id/outline', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const incoming = req.body as Outline & { clearResponseMatrix?: boolean };
  if (!incoming || !Array.isArray(incoming.nodes)) {
    return res.status(400).json({ message: '目录数据格式不正确' });
  }
  const outline: Outline = {
    title: incoming.title?.trim() || '投标技术方案',
    nodes: incoming.nodes,
    updatedAt: new Date().toISOString(),
  };
  saveOutline(req.params.id, outline, { clearResponseMatrix: incoming.clearResponseMatrix !== false });
  res.json(outline);
});

// 读取全局事实
projectsRouter.get('/:id/global-facts', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const facts = getGlobalFacts(req.params.id);
  if (!facts) return res.status(404).json({ message: '尚未生成全局事实' });
  res.json(facts);
});

// AI 生成全局事实
projectsRouter.post('/:id/global-facts/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  try {
    const facts = await generateGlobalFacts(
      loadConfig(),
      tenderText,
      outline,
      getAnalysis(req.params.id),
      getOriginalPlanText(req.params.id),
      getTenderChapters(req.params.id),
    );
    saveGlobalFacts(req.params.id, facts);
    res.json(facts);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '全局事实生成失败') });
  }
});

// 保存手动编辑后的全局事实
projectsRouter.put('/:id/global-facts', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const incoming = req.body as GlobalFacts;
  const facts: GlobalFacts = {
    items: Array.isArray(incoming?.items) ? incoming.items : [],
    updatedAt: new Date().toISOString(),
  };
  saveGlobalFacts(req.params.id, facts);
  res.json(facts);
});

// 读取点对点响应矩阵
projectsRouter.get('/:id/response-matrix', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const matrix = getResponseMatrix(req.params.id);
  if (!matrix) return res.status(404).json({ message: '尚未生成响应矩阵' });
  res.json(matrix);
});

// AI 生成/刷新点对点响应矩阵
projectsRouter.post('/:id/response-matrix/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const matrix = await generateResponseMatrix(
      loadConfig(),
      tenderText,
      project.name,
      getAnalysis(req.params.id),
      getGlobalFacts(req.params.id),
      getOutline(req.params.id),
      getIndustryProfile(req.params.id),
      getOriginalPlanText(req.params.id),
      getTenderChapters(req.params.id),
    );
    saveResponseMatrix(req.params.id, matrix);
    res.json(matrix);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '响应矩阵生成失败') });
  }
});

// 读取商务/技术偏离表草稿
projectsRouter.get('/:id/deviation-table', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const table = getDeviationTable(req.params.id);
  if (!table) return res.status(404).json({ message: '尚未生成偏离表' });
  res.json(table);
});

// 根据响应矩阵生成/刷新商务技术偏离表草稿
projectsRouter.post('/:id/deviation-table/generate', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const matrix = getResponseMatrix(req.params.id);
  if (!matrix) return res.status(400).json({ message: '请先生成响应矩阵' });

  try {
    const table = generateDeviationTableFromResponseMatrix(matrix);
    saveDeviationTable(req.params.id, table);
    res.json(table);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '偏离表生成失败') });
  }
});

// 读取客户资料补齐清单
projectsRouter.get('/:id/material-checklist', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const checklist = getMaterialChecklist(req.params.id);
  if (!checklist) return res.status(404).json({ message: '尚未生成资料补齐清单' });
  res.json(checklist);
});

// AI 生成/刷新客户资料补齐清单
projectsRouter.post('/:id/material-checklist/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const checklist = await generateMaterialChecklist(
      loadConfig(),
      tenderText,
      project.name,
      getAnalysis(req.params.id),
      getGlobalFacts(req.params.id),
      getIndustryProfile(req.params.id),
      getResponseMatrix(req.params.id),
      getOutline(req.params.id),
      getTenderChapters(req.params.id),
    );
    saveMaterialChecklist(req.params.id, checklist);
    res.json(checklist);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '资料清单生成失败') });
  }
});

// 按资料项上传客户补充材料
projectsRouter.post('/:id/material-checklist/:itemId/files', upload.single('file'), async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (!req.file) return res.status(400).json({ message: '未收到文件' });
  const checklist = getMaterialChecklist(req.params.id);
  if (!checklist) return res.status(404).json({ message: '请先生成资料补齐清单' });
  const item = checklist.items.find((entry) => entry.id === req.params.itemId);
  if (!item) return res.status(404).json({ message: '资料项不存在' });

  try {
    const parsed = await parseMaterialFile(req.file.buffer, req.file.originalname);
    if (!item.acceptedFileTypes.includes(parsed.fileType)) {
      return res.status(400).json({ message: '该资料项暂不接受此文件格式。' });
    }
    const updated = saveMaterialFile(
      req.params.id,
      item.id,
      {
        fileName: req.file.originalname,
        fileType: parsed.fileType,
        charCount: parsed.text.length,
      },
      req.file.buffer,
      parsed.text,
    );
    if (!updated) return res.status(404).json({ message: '资料项不存在' });
    res.json(updated);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '资料解析或保存失败') });
  }
});

// 读取资料文件原始二进制（图片预览、证照插入正文后的编辑器预览）
projectsRouter.get('/:id/material-checklist/:itemId/files/:fileId/raw', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const found = getMaterialFileBinary(req.params.id, req.params.itemId, req.params.fileId);
  if (!found) return res.status(404).json({ message: '资料文件不存在' });
  res.setHeader('Content-Type', materialMimeType(found.file.fileType));
  res.setHeader('Cache-Control', 'no-store');
  res.send(found.buffer);
});

// 把资料文件插入到指定章节正文：图片以 material:// 引用插入；表格/文本以 Markdown 追加
projectsRouter.post('/:id/material-checklist/:itemId/files/:fileId/insert', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const nodeId = String(req.body?.nodeId ?? '').trim();
  if (!nodeId) return res.status(400).json({ message: '请指定要插入的章节' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });
  const target = findNode(outline.nodes, nodeId);
  if (!target) return res.status(404).json({ message: '章节不存在' });
  if (target.node.children.length > 0) {
    return res.status(400).json({ message: '只能插入到叶子章节（无子章节的章节）' });
  }
  const found = getMaterialFileBinary(req.params.id, req.params.itemId, req.params.fileId);
  if (!found) return res.status(404).json({ message: '资料文件不存在' });

  let snippet: string;
  if (found.file.fileType === 'png' || found.file.fileType === 'jpg') {
    snippet = `![${found.itemTitle}](material://${req.params.itemId}/${req.params.fileId})`;
  } else {
    const text = getMaterialFileText(req.params.id, req.params.itemId, req.params.fileId);
    if (!text?.trim()) return res.status(400).json({ message: '该资料文件没有可插入的文本内容' });
    snippet = text.trim();
  }

  const current = (target.node.content ?? '').trimEnd();
  const nextContent = current ? `${current}\n\n${snippet}\n` : `${snippet}\n`;
  const updated: Outline = {
    ...outline,
    nodes: setNodeContent(outline.nodes, nodeId, nextContent),
    updatedAt: new Date().toISOString(),
  };
  saveOutline(req.params.id, updated, { clearResponseMatrix: false });
  res.json(updated);
});

// 删除某个资料项下的上传文件
projectsRouter.delete('/:id/material-checklist/:itemId/files/:fileId', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const updated = deleteMaterialFile(req.params.id, req.params.itemId, req.params.fileId);
  if (!updated) return res.status(404).json({ message: '资料文件不存在' });
  res.json(updated);
});

// 读取投标文件格式文书
projectsRouter.get('/:id/format-docs', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  res.json(getFormatDocs(req.params.id) ?? emptyFormatDocsResult());
});

// 从“投标文件格式”章节提取授权书、声明、报价表等格式文书
projectsRouter.post('/:id/format-docs/generate', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    let chapters = getTenderChapters(req.params.id);
    if (chapters.length === 0) {
      chapters = detectTenderChapters(tenderText);
      saveTenderChapters(req.params.id, chapters);
    }
    if (!chapters.some((chapter) => chapter.roles.includes('format'))) {
      return res.status(400).json({ message: '未识别到投标文件格式章节，可能该招标文件未附格式要求' });
    }

    const formatChapterText = getChapterText(tenderText, chapters, ['format'], 30000);
    if (!formatChapterText.trim()) {
      return res.status(400).json({ message: '未识别到投标文件格式章节，可能该招标文件未附格式要求' });
    }

    const result = await generateFormatDocs(
      loadConfig(),
      formatChapterText,
      project.name,
      getAnalysis(req.params.id),
      getGlobalFacts(req.params.id),
      getBidderProfile(currentAccountId(req)),
    );
    const saved = saveFormatDocs(req.params.id, result);
    res.json(saved ?? result);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '格式文书提取失败') });
  }
});

// 保存单份格式文书的填充值、字段、状态与分册归属
projectsRouter.put('/:id/format-docs/:docId', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const current = getFormatDocs(req.params.id);
  if (!current) return res.status(404).json({ message: '请先生成格式文书' });
  const target = current.docs.find((doc) => doc.id === req.params.docId);
  if (!target) return res.status(404).json({ message: '格式文书不存在' });

  const next: FormatDocsResult = {
    ...current,
    docs: current.docs.map((doc) =>
      doc.id === req.params.docId ? normalizeFormatDocUpdate(doc, req.body) : doc,
    ),
    updatedAt: new Date().toISOString(),
  };
  const saved = saveFormatDocs(req.params.id, next);
  res.json(saved ?? next);
});

// 把已确认格式文书插入标书大纲顶部，作为商务/报价等分册叶子正文
projectsRouter.post('/:id/format-docs/apply', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const result = getFormatDocs(req.params.id);
  if (!result || result.docs.length === 0) return res.status(400).json({ message: '请先生成格式文书' });
  const confirmed = result.docs.filter((doc) => doc.status === 'confirmed');
  if (confirmed.length === 0) return res.status(400).json({ message: '请先确认至少一份格式文书' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  const formatNode: Outline['nodes'][number] = {
    id: 'fmt_format_docs',
    title: '投标文件格式文书',
    volume: 'business',
    estimatedWords: confirmed.reduce((sum, doc) => sum + estimateWords(doc.filledText), 0),
    children: confirmed.map((doc) => ({
      id: doc.id.startsWith('fmt_') ? doc.id : `fmt_${doc.id}`,
      title: doc.title,
      volume: doc.volume,
      estimatedWords: estimateWords(doc.filledText),
      content: doc.filledText,
      children: [],
    })),
  };
  const updated: Outline = {
    ...outline,
    nodes: [formatNode, ...stripInsertedFormatNodes(outline.nodes)],
    updatedAt: new Date().toISOString(),
  };
  const saved = saveOutline(req.params.id, updated, { clearResponseMatrix: false });
  res.json(saved ?? updated);
});

// 读取全文一致性审计结果
projectsRouter.get('/:id/consistency-audit', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const audit = getConsistencyAudit(req.params.id);
  if (!audit) return res.status(404).json({ message: '尚未执行全文一致性审计' });
  res.json(audit);
});

// 执行全文一致性审计
projectsRouter.post('/:id/consistency-audit/run', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录与正文' });

  try {
    const audit = await auditConsistency(
      loadConfig(),
      outline,
      getAnalysis(req.params.id),
      getGlobalFacts(req.params.id),
    );
    saveConsistencyAudit(req.params.id, audit);
    res.json(audit);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '全文一致性审计失败') });
  }
});

// 读取提交前总检报告
projectsRouter.get('/:id/bid-readiness', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const report = getBidReadinessReport(req.params.id);
  if (!report) return res.status(404).json({ message: '尚未运行提交前总检' });
  res.json(report);
});

// 运行提交前总检：汇总响应矩阵、资料、正文、审计和盖章状态
projectsRouter.post('/:id/bid-readiness/run', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });

  try {
    const report = buildBidReadinessReport({
      outline: getOutline(req.params.id),
      industryProfile: getIndustryProfile(req.params.id),
      responseMatrix: getResponseMatrix(req.params.id),
      materialChecklist: getMaterialChecklist(req.params.id),
      audit: getConsistencyAudit(req.params.id),
      sealPlacements: getSealPlacements(req.params.id),
      tenderText: getTenderText(req.params.id),
    });
    saveBidReadinessReport(req.params.id, report);
    res.json(report);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '提交前总检失败') });
  }
});

// 生成单个章节的正文（前端按叶子逐个调用，便于展示进度）
projectsRouter.post('/:id/content/generate-section', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });
  const nodeId = req.body?.nodeId as string | undefined;
  if (!nodeId) return res.status(400).json({ message: '缺少 nodeId' });
  const target = findNode(outline.nodes, nodeId);
  if (!target) return res.status(400).json({ message: '目录中找不到该章节，请刷新后重试。' });

  try {
    const result = await generateSectionContent(
      loadConfig(),
      tenderText,
      outline,
      nodeId,
      getAnalysis(req.params.id),
      getGlobalFacts(req.params.id),
      listKnowledgeItems(currentAccountId(req)),
      getOriginalPlanText(req.params.id),
      getIndustryProfile(req.params.id),
      getResponseMatrix(req.params.id),
      renderProjectMaterialsForPrompt(req.params.id, target.path),
    );
    // 写回正文并落盘
    const updated: Outline = {
      ...outline,
      nodes: setNodeContent(outline.nodes, nodeId, result.content),
      updatedAt: new Date().toISOString(),
    };
    saveOutline(req.params.id, updated, { clearResponseMatrix: false });
    res.json(result);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '正文生成失败') });
  }
});

// 导出 Word（.docx）
projectsRouter.get('/:id/export/docx', async (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  const resolved = resolveExportOutline(req, outline);
  if ('error' in resolved) return res.status(400).json({ message: resolved.error });

  try {
    const buffer = await buildDocx(resolved.outline, {
      cover: {
        projectName: project.name || resolved.outline.title || '投标项目',
        docTitle: exportDocTitle(resolved.suffix),
      },
      resolveImage: materialImageResolver(req.params.id),
    });
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    const fileName = `${baseName}${resolved.suffix}.docx`;
    sendDownload(
      res,
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
    );
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '导出失败') });
  }
});

// 导出 Markdown 工作稿
projectsRouter.get('/:id/export/markdown', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  const resolved = resolveExportOutline(req, outline);
  if ('error' in resolved) return res.status(400).json({ message: resolved.error });

  try {
    const buffer = Buffer.from(buildMarkdown(resolved.outline), 'utf-8');
    const fileName = `${safeExportBaseName(project.name || '投标技术方案')}${resolved.suffix}.md`;
    sendDownload(res, buffer, 'text/markdown; charset=utf-8', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, 'Markdown 导出失败') });
  }
});

// 导出响应矩阵 Markdown
projectsRouter.get('/:id/export/workbench/response-matrix.md', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const matrix = getResponseMatrix(req.params.id);
  if (!matrix) return res.status(400).json({ message: '请先生成响应矩阵' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendMarkdownExport(res, buildResponseMatrixMarkdown(matrix), `${baseName}-响应矩阵.md`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '响应矩阵导出失败') });
  }
});

// 导出响应矩阵 CSV
projectsRouter.get('/:id/export/workbench/response-matrix.csv', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const matrix = getResponseMatrix(req.params.id);
  if (!matrix) return res.status(400).json({ message: '请先生成响应矩阵' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendCsvExport(res, buildResponseMatrixCsv(matrix), `${baseName}-响应矩阵.csv`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '响应矩阵 CSV 导出失败') });
  }
});

// 导出商务/技术偏离表 Markdown
projectsRouter.get('/:id/export/workbench/deviation-table.md', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const table = getDeviationTable(req.params.id);
  if (!table) return res.status(400).json({ message: '请先生成商务/技术偏离表' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendMarkdownExport(res, buildDeviationTableMarkdown(table), `${baseName}-偏离表.md`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '偏离表导出失败') });
  }
});

// 导出商务/技术偏离表 CSV
projectsRouter.get('/:id/export/workbench/deviation-table.csv', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const table = getDeviationTable(req.params.id);
  if (!table) return res.status(400).json({ message: '请先生成商务/技术偏离表' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendCsvExport(res, buildDeviationTableCsv(table), `${baseName}-偏离表.csv`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '偏离表 CSV 导出失败') });
  }
});

// 导出客户资料补齐清单 Markdown
projectsRouter.get('/:id/export/workbench/material-checklist.md', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const checklist = getMaterialChecklist(req.params.id);
  if (!checklist) return res.status(400).json({ message: '请先生成资料补齐清单' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendMarkdownExport(res, buildMaterialChecklistMarkdown(checklist), `${baseName}-资料清单.md`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '资料清单导出失败') });
  }
});

// 导出客户资料补齐清单 CSV
projectsRouter.get('/:id/export/workbench/material-checklist.csv', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const checklist = getMaterialChecklist(req.params.id);
  if (!checklist) return res.status(400).json({ message: '请先生成资料补齐清单' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendCsvExport(res, buildMaterialChecklistCsv(checklist), `${baseName}-资料清单.csv`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '资料清单 CSV 导出失败') });
  }
});

// 导出提交前总检 Markdown
projectsRouter.get('/:id/export/workbench/bid-readiness.md', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const report = getBidReadinessReport(req.params.id);
  if (!report) return res.status(400).json({ message: '请先运行提交前总检' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendMarkdownExport(res, buildBidReadinessMarkdown(report), `${baseName}-提交前总检.md`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '提交前总检导出失败') });
  }
});

// 导出提交前总检 CSV
projectsRouter.get('/:id/export/workbench/bid-readiness.csv', (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const report = getBidReadinessReport(req.params.id);
  if (!report) return res.status(400).json({ message: '请先运行提交前总检' });

  try {
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    sendCsvExport(res, buildBidReadinessCsv(report), `${baseName}-提交前总检.csv`);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '提交前总检 CSV 导出失败') });
  }
});

// 导出 PDF
projectsRouter.get('/:id/export/pdf', async (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  const resolved = resolveExportOutline(req, outline);
  if ('error' in resolved) return res.status(400).json({ message: resolved.error });

  try {
    // 普通 PDF 导出带封面与目录页；盖章版 PDF 保持旧版布局，避免用户已保存的盖章页码坐标错位
    const buffer = await buildPdf(resolved.outline, {
      resolveImage: materialImageResolver(req.params.id),
      cover: {
        projectName: project.name || resolved.outline.title || '投标项目',
        docTitle: exportDocTitle(resolved.suffix),
      },
      toc: true,
    });
    const fileName = `${safeExportBaseName(project.name || '投标技术方案')}${resolved.suffix}.pdf`;
    sendDownload(res, buffer, 'application/pdf', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, 'PDF 导出失败') });
  }
});

// 读取电子印章状态
projectsRouter.get('/:id/seal', (req, res) => {
  if (!requireFeature(req, res, 'seal')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  res.json({
    seal: project.seal,
    placements: getSealPlacements(req.params.id),
  });
});

// 上传电子印章图片
projectsRouter.post('/:id/seal', upload.single('file'), (req, res) => {
  if (!requireFeature(req, res, 'seal')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (!req.file) return res.status(400).json({ message: '未收到印章图片' });

  const mimeType = req.file.mimetype;
  if (!['image/png', 'image/jpeg'].includes(mimeType)) {
    return res.status(400).json({ message: '电子印章目前支持 PNG 或 JPG 图片。' });
  }

  const seal: ElectronicSeal = {
    fileName: req.file.originalname,
    mimeType,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
  };
  const updated = saveSeal(req.params.id, seal, req.file.buffer, currentAccountId(req));
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json({ project: updated, seal, placements: getSealPlacements(req.params.id) });
});

// 读取电子印章图片
projectsRouter.get('/:id/seal/image', (req, res) => {
  if (!requireFeature(req, res, 'seal')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project?.seal) return res.status(404).json({ message: '尚未上传电子印章' });
  const buffer = getSealImage(req.params.id);
  if (!buffer) return res.status(404).json({ message: '电子印章图片不存在' });
  res.setHeader('Content-Type', project.seal.mimeType);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

// 删除电子印章
projectsRouter.delete('/:id/seal', (req, res) => {
  if (!requireFeature(req, res, 'seal')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const updated = deleteSeal(req.params.id, currentAccountId(req));
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json({ project: updated, seal: null, placements: [] });
});

// 保存电子印章位置
projectsRouter.put('/:id/seal/placements', (req, res) => {
  if (!requireFeature(req, res, 'seal')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const incoming: unknown[] = Array.isArray(req.body?.placements) ? req.body.placements : [];
  const placements = incoming.map(normalizePlacement).filter((p): p is SealPlacement => Boolean(p));
  const saved = saveSealPlacements(req.params.id, placements, currentAccountId(req));
  if (!saved) return res.status(404).json({ message: '项目不存在' });
  res.json({ seal: project.seal, placements: saved });
});

// 导出带电子章的 PDF
projectsRouter.get('/:id/export/stamped-pdf', async (req, res) => {
  if (!requireFeature(req, res, 'seal')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });
  if (!project.seal) return res.status(400).json({ message: '请先上传电子印章' });
  const image = getSealImage(req.params.id);
  if (!image) return res.status(400).json({ message: '电子印章图片不存在' });
  const placements = getSealPlacements(req.params.id);
  if (placements.length === 0) return res.status(400).json({ message: '请先在页面上放置电子印章' });

  try {
    const buffer = await buildPdf(outline, {
      seal: {
        image,
        mimeType: project.seal.mimeType,
        placements,
      },
      resolveImage: materialImageResolver(req.params.id),
    });
    const fileName = `${safeExportBaseName(project.name || '投标技术方案')}-盖章版.pdf`;
    sendDownload(res, buffer, 'application/pdf', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '盖章 PDF 导出失败') });
  }
});

// 合并多份 PDF（如技术标 + 商务标 + 盖章附件合并为一册），按上传顺序拼接
projectsRouter.post('/:id/tools/merge-pdf', upload.array('files', 20), async (req, res) => {
  if (!requireFeature(req, res, 'export')) return;
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const files = (req.files ?? []) as Express.Multer.File[];
  if (files.length < 2) return res.status(400).json({ message: '请至少上传两份 PDF 文件' });

  try {
    const merged = await PDFDocument.create();
    for (const file of files) {
      if (!file.originalname.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ message: `「${file.originalname}」不是 PDF 文件` });
      }
      const doc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    const buffer = Buffer.from(await merged.save());
    const fileName = `${safeExportBaseName(project.name || '投标文件')}-合并.pdf`;
    sendDownload(res, buffer, 'application/pdf', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, 'PDF 合并失败，请确认文件未加密') });
  }
});
