import { Router } from 'express';
import multer from 'multer';
import {
  createKnowledgeFolder,
  deleteKnowledgeDocument,
  deleteKnowledgeFolder,
  deleteKnowledgeItem,
  getKnowledgeDocumentText,
  getKnowledgeOverview,
  replaceKnowledgeItems,
  saveKnowledgeDocument,
} from '../knowledge/knowledgeStore.js';
import { analyzeKnowledgeDocument } from '../knowledge/knowledgeService.js';
import { detectFileType, parseDocument } from '../projects/docParser.js';
import { loadConfig } from '../store/configStore.js';
import { errorMessage, errorStatus } from './errors.js';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { assertFeatureAccess } from '../billing/billingStore.js';

export const knowledgeRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

knowledgeRouter.use((_req, res, next) => {
  try {
    assertFeatureAccess(getCurrentAccountId(), 'knowledge');
    next();
  } catch (err) {
    res.status(errorStatus(err, 403)).json({ message: errorMessage(err, '当前套餐未开通知识库') });
  }
});

knowledgeRouter.get('/', (_req, res) => {
  res.json(getKnowledgeOverview(getCurrentAccountId()));
});

knowledgeRouter.post('/folders', (req, res) => {
  res.json(createKnowledgeFolder(req.body?.name, getCurrentAccountId()));
});

knowledgeRouter.delete('/folders/:id', (req, res) => {
  res.json({ ok: deleteKnowledgeFolder(req.params.id, getCurrentAccountId()) });
});

knowledgeRouter.post('/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '未收到文件' });
  const fileType = detectFileType(req.file.originalname);
  if (!fileType) {
    return res.status(400).json({ message: '暂不支持的文件格式，请上传 PDF、Word(.docx)、txt 或 md。' });
  }
  try {
    const { text } = await parseDocument(req.file.buffer, req.file.originalname);
    const document = saveKnowledgeDocument({
      accountId: getCurrentAccountId(),
      folderId: String(req.body?.folderId ?? 'default'),
      fileName: req.file.originalname,
      fileType,
      text,
      originalBuffer: req.file.buffer,
    });
    res.json({ document, preview: text.slice(0, 1200) });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '知识库文档解析失败') });
  }
});

knowledgeRouter.delete('/documents/:id', (req, res) => {
  res.json({ ok: deleteKnowledgeDocument(req.params.id, getCurrentAccountId()) });
});

knowledgeRouter.post('/documents/:id/analyze', async (req, res) => {
  const accountId = getCurrentAccountId();
  const overview = getKnowledgeOverview(accountId);
  const document = overview.documents.find((item) => item.id === req.params.id);
  if (!document) return res.status(404).json({ message: '知识库文档不存在' });
  const text = getKnowledgeDocumentText(document.id);
  if (!text) return res.status(404).json({ message: '知识库文档正文不存在' });

  try {
    const items = await analyzeKnowledgeDocument(
      loadConfig(),
      document.id,
      document.folderId,
      document.fileName,
      text,
    );
    const saved = replaceKnowledgeItems(document.id, items, accountId);
    res.json({ items: saved, overview: getKnowledgeOverview(accountId) });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: errorMessage(err, '知识条目整理失败') });
  }
});

knowledgeRouter.delete('/items/:id', (req, res) => {
  res.json({ ok: deleteKnowledgeItem(req.params.id, getCurrentAccountId()) });
});
