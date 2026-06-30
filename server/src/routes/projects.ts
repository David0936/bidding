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
  saveOriginalPlan,
  getOriginalPlanText,
  deleteOriginalPlan,
  saveOutline,
  getOutline,
  saveAnalysis,
  getAnalysis,
  saveGlobalFacts,
  getGlobalFacts,
  saveConsistencyAudit,
  getConsistencyAudit,
  saveSeal,
  getSealImage,
  deleteSeal,
  saveSealPlacements,
  getSealPlacements,
} from '../projects/projectStore.js';
import { parseDocument, detectFileType } from '../projects/docParser.js';
import { detectBidSections } from '../projects/bidSections.js';
import { generateOutline } from '../projects/outline/outlineService.js';
import { generateSectionContent } from '../projects/content/contentService.js';
import { analyzeTender, generateGlobalFacts } from '../projects/analysis/analysisService.js';
import { auditConsistency } from '../projects/audit/consistencyAuditService.js';
import { listKnowledgeItems } from '../knowledge/knowledgeStore.js';
import { setNodeContent } from '../projects/outline/treeUtils.js';
import { buildDocx, buildMarkdown, buildPdf } from '../projects/export/exportService.js';
import { loadConfig } from '../store/configStore.js';
import { errorMessage, errorStatus } from './errors.js';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { extractBearerToken, resolveToken } from '../auth/authStore.js';
import type { ElectronicSeal, Project, SealPlacement, TenderDoc } from '../projects/types.js';
import type { Outline } from '../projects/outline/types.js';
import type { GlobalFacts, TenderAnalysis } from '../projects/analysis/types.js';

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

function safeExportBaseName(name: string): string {
  return (name || '投标技术方案').replace(/[\\/:*?"<>|]/g, '_');
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

function sendDownload(res: Response, buffer: Buffer, contentType: string, fileName: string): void {
  const fallback = fileName.endsWith('.pdf')
    ? 'export.pdf'
    : fileName.endsWith('.docx')
      ? 'export.docx'
      : fileName.endsWith('.md')
        ? 'export.md'
        : 'export';
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.send(buffer);
}

// 创建项目
projectsRouter.post('/', (req, res) => {
  const project = createProject(req.body?.name, currentAccountId(req));
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
  res.json(updated);
});

// 恢复使用完整招标文件
projectsRouter.post('/:id/bid-sections/reset', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const updated = resetBidSection(req.params.id, currentAccountId(req));
  if (!updated) return res.status(400).json({ message: '无法恢复全文，请重新上传招标文件后再试' });
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
    const analysis = await analyzeTender(loadConfig(), tenderText, project.name);
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
    );
    saveOutline(req.params.id, outline);
    res.json(outline);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '目录生成失败') });
  }
});

// 保存（手动编辑后的）目录
projectsRouter.put('/:id/outline', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const incoming = req.body as Outline;
  if (!incoming || !Array.isArray(incoming.nodes)) {
    return res.status(400).json({ message: '目录数据格式不正确' });
  }
  const outline: Outline = {
    title: incoming.title?.trim() || '投标技术方案',
    nodes: incoming.nodes,
    updatedAt: new Date().toISOString(),
  };
  saveOutline(req.params.id, outline);
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
    );
    // 写回正文并落盘
    const updated: Outline = {
      ...outline,
      nodes: setNodeContent(outline.nodes, nodeId, result.content),
      updatedAt: new Date().toISOString(),
    };
    saveOutline(req.params.id, updated);
    res.json(result);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '正文生成失败') });
  }
});

// 导出 Word（.docx）
projectsRouter.get('/:id/export/docx', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  try {
    const buffer = await buildDocx(outline);
    const baseName = safeExportBaseName(project.name || '投标技术方案');
    const fileName = `${baseName}.docx`;
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
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  try {
    const buffer = Buffer.from(buildMarkdown(outline), 'utf-8');
    const fileName = `${safeExportBaseName(project.name || '投标技术方案')}.md`;
    sendDownload(res, buffer, 'text/markdown; charset=utf-8', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, 'Markdown 导出失败') });
  }
});

// 导出 PDF
projectsRouter.get('/:id/export/pdf', async (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  try {
    const buffer = await buildPdf(outline);
    const fileName = `${safeExportBaseName(project.name || '投标技术方案')}.pdf`;
    sendDownload(res, buffer, 'application/pdf', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, 'PDF 导出失败') });
  }
});

// 读取电子印章状态
projectsRouter.get('/:id/seal', (req, res) => {
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  res.json({
    seal: project.seal,
    placements: getSealPlacements(req.params.id),
  });
});

// 上传电子印章图片
projectsRouter.post('/:id/seal', upload.single('file'), (req, res) => {
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
  const project = findOwnedProject(req.params.id, req);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const updated = deleteSeal(req.params.id, currentAccountId(req));
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json({ project: updated, seal: null, placements: [] });
});

// 保存电子印章位置
projectsRouter.put('/:id/seal/placements', (req, res) => {
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
    });
    const fileName = `${safeExportBaseName(project.name || '投标技术方案')}-盖章版.pdf`;
    sendDownload(res, buffer, 'application/pdf', fileName);
  } catch (err) {
    res.status(errorStatus(err, 500)).json({ message: errorMessage(err, '盖章 PDF 导出失败') });
  }
});
