import { Router } from 'express';
import multer from 'multer';
import { jsonChat } from '../ai/jsonChat.js';
import { parseDocument } from '../projects/docParser.js';
import { loadConfig } from '../store/configStore.js';
import { errorMessage, errorStatus } from './errors.js';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { assertFeatureAccess } from '../billing/billingStore.js';
import { listDuplicateRecords, saveDuplicateRecord } from '../checks/checkStore.js';
import type { DuplicateCheckResult, DuplicateFileSummary, DuplicateSentenceGroup } from '../checks/types.js';

export const checksRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 12 },
});

interface RejectionCheckIssue {
  title: string;
  type: 'invalid_bid' | 'rejection' | 'typo' | 'logic' | 'risk';
  severity: 'high' | 'medium' | 'low';
  requirement: string;
  evidence?: string;
  suggestion: string;
}

interface RawRejectionCheck {
  summary?: unknown;
  issues?: unknown;
}

const MAX_CHECK_TEXT_CHARS = 18000;

checksRouter.get('/duplicate-records', (req, res) => {
  try {
    assertFeatureAccess(getCurrentAccountId(), 'duplicateCheck');
  } catch (err) {
    return res.status(errorStatus(err, 403)).json({ message: errorMessage(err, '当前套餐未开通标书查重') });
  }
  res.json({ records: listDuplicateRecords(getCurrentAccountId()) });
});

function normalizeSentence(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/[“”"']/g, '')
    .replace(/[，,；;：:、]/g, '')
    .trim();
}

function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\r\n/g, '\n');

  const raw = normalized
    .split(/[。！？!?.\n]+/g)
    .map((item) => normalizeSentence(item))
    .filter((item) => item.length >= 18 && /[\u4e00-\u9fa5]/.test(item));

  return Array.from(new Set(raw));
}

async function parseUploaded(file: Express.Multer.File): Promise<{ name: string; text: string }> {
  const { text } = await parseDocument(file.buffer, file.originalname);
  return { name: file.originalname, text };
}

function normalizeRejectionCheck(raw: RawRejectionCheck): { summary: string; issues: RejectionCheckIssue[] } {
  const issues: RejectionCheckIssue[] = [];
  const types = new Set(['invalid_bid', 'rejection', 'typo', 'logic', 'risk']);
  const severities = new Set(['high', 'medium', 'low']);

  if (Array.isArray(raw.issues)) {
    for (const item of raw.issues) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const title = String(obj.title ?? '').trim();
      const requirement = String(obj.requirement ?? '').trim();
      const suggestion = String(obj.suggestion ?? '').trim();
      if (!title || !requirement || !suggestion) continue;
      const rawType = String(obj.type ?? '').trim();
      const rawSeverity = String(obj.severity ?? '').trim();
      issues.push({
        title,
        type: types.has(rawType) ? (rawType as RejectionCheckIssue['type']) : 'risk',
        severity: severities.has(rawSeverity) ? (rawSeverity as RejectionCheckIssue['severity']) : 'medium',
        requirement,
        evidence: String(obj.evidence ?? '').trim() || undefined,
        suggestion,
      });
    }
  }

  return {
    summary:
      String(raw.summary ?? '').trim() ||
      (issues.length > 0 ? `发现 ${issues.length} 条投标风险。` : '未发现明显废标风险。'),
    issues: issues.slice(0, 80),
  };
}

checksRouter.post(
  '/duplicate',
  upload.fields([
    { name: 'tender', maxCount: 1 },
    { name: 'bids', maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      assertFeatureAccess(getCurrentAccountId(), 'duplicateCheck');
    } catch (err) {
      return res.status(errorStatus(err, 403)).json({ message: errorMessage(err, '当前套餐未开通标书查重') });
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const tenderFile = files?.tender?.[0] ?? null;
    const bidFiles = files?.bids ?? [];

    if (bidFiles.length < 2) {
      return res.status(400).json({ message: '请至少上传 2 份投标文件用于查重。' });
    }

    try {
      const tenderSentences = new Set<string>();
      if (tenderFile) {
        const tender = await parseUploaded(tenderFile);
        for (const sentence of splitSentences(tender.text)) tenderSentences.add(sentence);
      }

      const sentenceMap = new Map<string, Set<string>>();
      const fileNames = new Map<string, string>();
      const summaries: DuplicateFileSummary[] = [];

      for (let i = 0; i < bidFiles.length; i++) {
        const parsed = await parseUploaded(bidFiles[i]);
        const id = String.fromCharCode(65 + i);
        fileNames.set(id, parsed.name);
        const sentences = splitSentences(parsed.text).filter((sentence) => !tenderSentences.has(sentence));
        summaries.push({
          id,
          name: parsed.name,
          charCount: parsed.text.length,
          sentenceCount: sentences.length,
        });
        for (const sentence of sentences) {
          const hit = sentenceMap.get(sentence) ?? new Set<string>();
          hit.add(id);
          sentenceMap.set(sentence, hit);
        }
      }

      const groups: DuplicateSentenceGroup[] = Array.from(sentenceMap.entries())
        .map(([sentence, ids]) => ({
          sentence,
          files: Array.from(ids).sort(),
          fileNames: Array.from(ids)
            .sort()
            .map((id) => fileNames.get(id) ?? id),
          count: ids.size,
        }))
        .filter((group) => group.count >= 2)
        .sort((a, b) => b.sentence.length * b.count - a.sentence.length * a.count)
        .slice(0, 500);

      const result: DuplicateCheckResult = {
        files: summaries,
        groups,
        tenderExcludedSentenceCount: tenderSentences.size,
        duplicateSentenceCount: groups.length,
      };
      const record = saveDuplicateRecord(getCurrentAccountId(), {
        tenderFileName: tenderFile?.originalname,
        result,
      });

      res.json({ ...result, record });
    } catch (err) {
      res.status(errorStatus(err)).json({ message: errorMessage(err, '查重失败') });
    }
  },
);

checksRouter.post(
  '/rejection',
  upload.fields([
    { name: 'tender', maxCount: 1 },
    { name: 'bid', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      assertFeatureAccess(getCurrentAccountId(), 'rejectionCheck');
    } catch (err) {
      return res.status(errorStatus(err, 403)).json({ message: errorMessage(err, '当前套餐未开通废标项检查') });
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const tenderFile = files?.tender?.[0] ?? null;
    const bidFile = files?.bid?.[0] ?? null;

    if (!tenderFile) return res.status(400).json({ message: '请上传招标文件。' });
    if (!bidFile) return res.status(400).json({ message: '请上传投标文件。' });

    try {
      const tender = await parseUploaded(tenderFile);
      const bid = await parseUploaded(bidFile);
      const raw = await jsonChat<RawRejectionCheck>(loadConfig(), {
        system: [
          '你是一名投标文件合规审查专家。',
          '请依据招标文件中的无效投标、废标条款、关键响应要求，检查投标文件电子正文是否存在风险。',
          '不检查纸质签字盖章、密封、现场递交等无法从电子正文判断的事项。',
          '只报告明确或高度疑似的问题，不要泛泛而谈。',
        ].join('\n'),
        messages: [
          {
            role: 'user',
            content: [
              '【招标文件】',
              '"""',
              tender.text.slice(0, MAX_CHECK_TEXT_CHARS),
              '"""',
              '',
              '【投标文件】',
              '"""',
              bid.text.slice(0, MAX_CHECK_TEXT_CHARS),
              '"""',
              '',
              '请输出 JSON：',
              '{',
              '  "summary": "检查摘要",',
              '  "issues": [',
              '    { "title": "问题标题", "type": "invalid_bid|rejection|typo|logic|risk", "severity": "high|medium|low", "requirement": "对应招标要求或风险依据", "evidence": "投标文件中的证据片段，可空", "suggestion": "处理建议" }',
              '  ]',
              '}',
            ].join('\n'),
          },
        ],
        temperature: 0.2,
        feature: 'checks.rejection',
      });

      res.json({
        tenderFileName: tender.name,
        bidFileName: bid.name,
        ...normalizeRejectionCheck(raw),
      });
    } catch (err) {
      res.status(errorStatus(err)).json({ message: errorMessage(err, '废标项检查失败') });
    }
  },
);
