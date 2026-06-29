// 项目相关接口：增删查 + 招标文件上传解析。
import { Router } from 'express';
import multer from 'multer';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  saveTender,
  getTenderText,
  saveOutline,
  getOutline,
} from '../projects/projectStore.js';
import { parseDocument, detectFileType } from '../projects/docParser.js';
import { generateOutline } from '../projects/outline/outlineService.js';
import { generateSectionContent } from '../projects/content/contentService.js';
import { setNodeContent } from '../projects/outline/treeUtils.js';
import { buildDocx } from '../projects/export/exportService.js';
import { loadConfig } from '../store/configStore.js';
import type { TenderDoc } from '../projects/types.js';
import type { Outline } from '../projects/outline/types.js';

export const projectsRouter = Router();

// 内存存储，单文件最大 30MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// 创建项目
projectsRouter.post('/', (req, res) => {
  const project = createProject(req.body?.name);
  res.json(project);
});

// 项目列表
projectsRouter.get('/', (_req, res) => {
  res.json(listProjects());
});

// 项目详情（可选带招标文件文本：?withText=1）
projectsRouter.get('/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (req.query.withText === '1') {
    return res.json({ ...project, tenderText: getTenderText(req.params.id) ?? '' });
  }
  res.json(project);
});

// 重命名
projectsRouter.put('/:id', (req, res) => {
  const updated = updateProject(req.params.id, { name: req.body?.name });
  if (!updated) return res.status(404).json({ message: '项目不存在' });
  res.json(updated);
});

// 删除
projectsRouter.delete('/:id', (req, res) => {
  const ok = deleteProject(req.params.id);
  res.json({ ok });
});

// 招标文件文本
projectsRouter.get('/:id/tender-text', (req, res) => {
  const text = getTenderText(req.params.id);
  if (text === null) return res.status(404).json({ message: '尚未上传招标文件' });
  res.json({ text });
});

// 上传并解析招标文件
projectsRouter.post('/:id/tender', upload.single('file'), async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  if (!req.file) return res.status(400).json({ message: '未收到文件' });

  const fileName = req.file.originalname;
  const fileType = detectFileType(fileName);
  if (!fileType) {
    return res.status(400).json({ message: '暂不支持的文件格式，请上传 PDF、Word(.docx) 或 txt。' });
  }

  try {
    const { text } = await parseDocument(req.file.buffer, fileName);
    const tender: TenderDoc = {
      fileName,
      fileType,
      charCount: text.length,
      uploadedAt: new Date().toISOString(),
    };
    const updated = saveTender(req.params.id, tender, text, req.file.buffer, fileType);
    res.json({ project: updated, charCount: text.length, preview: text.slice(0, 2000) });
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : '解析失败' });
  }
});

// 读取已保存的目录
projectsRouter.get('/:id/outline', (req, res) => {
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(404).json({ message: '尚未生成目录' });
  res.json(outline);
});

// AI 生成目录
projectsRouter.post('/:id/outline/generate', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });

  try {
    const outline = await generateOutline(loadConfig(), tenderText, project.name);
    saveOutline(req.params.id, outline);
    res.json(outline);
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : '目录生成失败' });
  }
});

// 保存（手动编辑后的）目录
projectsRouter.put('/:id/outline', (req, res) => {
  const project = getProject(req.params.id);
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

// 生成单个章节的正文（前端按叶子逐个调用，便于展示进度）
projectsRouter.post('/:id/content/generate-section', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const tenderText = getTenderText(req.params.id);
  if (!tenderText) return res.status(400).json({ message: '请先上传并解析招标文件' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });
  const nodeId = req.body?.nodeId as string | undefined;
  if (!nodeId) return res.status(400).json({ message: '缺少 nodeId' });

  try {
    const result = await generateSectionContent(loadConfig(), tenderText, outline, nodeId);
    // 写回正文并落盘
    const updated: Outline = {
      ...outline,
      nodes: setNodeContent(outline.nodes, nodeId, result.content),
      updatedAt: new Date().toISOString(),
    };
    saveOutline(req.params.id, updated);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : '正文生成失败' });
  }
});

// 导出 Word（.docx）
projectsRouter.get('/:id/export/docx', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ message: '项目不存在' });
  const outline = getOutline(req.params.id);
  if (!outline) return res.status(400).json({ message: '请先生成目录' });

  try {
    const buffer = await buildDocx(outline);
    const baseName = (project.name || '投标技术方案').replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${baseName}.docx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    // 同时给 ASCII 回退名与 RFC5987 中文名
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="export.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : '导出失败' });
  }
});
