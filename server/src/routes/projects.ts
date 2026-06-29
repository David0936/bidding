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
} from '../projects/projectStore.js';
import { parseDocument, detectFileType } from '../projects/docParser.js';
import type { TenderDoc } from '../projects/types.js';

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
