// 格式文书引擎：从格式章保真切分模板，识别字段并生成可人工确认的填充稿。
import { jsonChat } from '../../ai/jsonChat.js';
import type { AIConfig } from '../../ai/types.js';
import type { BidderProfile } from '../../bidder/bidderProfileStore.js';
import type { GlobalFacts, TenderAnalysis } from '../analysis/types.js';
import type {
  FormatDoc,
  FormatDocKind,
  FormatDocsResult,
  FormatDocVolume,
  FormatField,
  FormatFieldSource,
} from './types.js';

const MAX_DOCS = 40;
const AI_DOC_LIMIT = 24;
const TITLE_MAX = 80;

interface DraftFormatDoc {
  id: string;
  title: string;
  originalText: string;
}

interface RawFormatField {
  key?: unknown;
  label?: unknown;
  source?: unknown;
  value?: unknown;
}

interface RawFormatDocMeta {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  volume?: unknown;
  note?: unknown;
  fields?: unknown;
}

interface RawFormatDocsMeta {
  docs?: unknown;
}

const KINDS = new Set<FormatDocKind>(['letter', 'table', 'attachment', 'freeform', 'cover', 'toc']);
const VOLUMES = new Set<FormatDocVolume>(['business', 'price', 'technical']);
const FIELD_SOURCES = new Set<FormatFieldSource>(['project', 'bidder', 'manual']);

function nowIso(): string {
  return new Date().toISOString();
}

function activeApiKey(config: AIConfig): string {
  return config.provider === 'claude' ? config.claude.apiKey : config.openai.apiKey;
}

function cleanInlineMarkup(line: string): string {
  return line
    .replace(/<a\b[^>]*><\/a>/gi, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^_+|_+$/g, '')
    .replace(/^`+|`+$/g, '')
    .replace(/\\([.()[\]-])/g, '$1')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function stripFormatChapterWrapper(formatChapterText: string): string[] {
  const rawLines = formatChapterText.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cleaned = cleanInlineMarkup(rawLines[i]);
    if (i <= 3 && (/^第.+章.*投标文件格式/.test(cleaned) || /^原文行号/.test(cleaned))) continue;
    if (i <= 3 && rawLines[i].trim().startsWith('## ')) continue;
    lines.push(rawLines[i].replace(/\u00a0/g, ' '));
  }

  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = cleanInlineMarkup(lines[i]);
    const next = cleanInlineMarkup(lines[i + 1] ?? '');
    if (/^\d+$/.test(current) && /^、/.test(next)) {
      merged.push(`${current}${next}`);
      i += 1;
    } else {
      merged.push(lines[i]);
    }
  }
  return merged.slice(findFormatBodyStart(merged));
}

function isPageNumber(line: string): boolean {
  return /^\d{1,4}$/.test(cleanInlineMarkup(line));
}

function normalizeTitle(line: string): string {
  return cleanInlineMarkup(line)
    .replace(/[；;。]$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyTocEntry(title: string): boolean {
  return /[；;]$/.test(cleanInlineMarkup(title)) || /^（?\d+[）)]/.test(title);
}

function isNumberedTitle(title: string): boolean {
  return /^([一二三四五六七八九十]+|[1-9]\d*)[、.．]\s*\S+/.test(title);
}

function findFormatBodyStart(lines: string[]): number {
  const cleaned = lines.map((line) => normalizeTitle(line));
  const tocIndex = cleaned.findIndex((line) => /^目\s*录$/.test(line));
  if (tocIndex >= 0) {
    const startAfterToc = cleaned.findIndex(
      (line, index) => index > tocIndex && isNumberedTitle(line) && !isLikelyTocEntry(line),
    );
    if (startAfterToc >= 0) return startAfterToc;
  }

  const maxProbe = Math.min(lines.length, 140);
  for (let i = 0; i < maxProbe; i++) {
    const title = cleaned[i];
    if (!/^1[、.．]\s*\S+/.test(title)) continue;
    if (!/报价/.test(title)) continue;
    if (isLikelyTocEntry(title)) continue;
    const previousHasPageNo = cleaned.slice(Math.max(0, i - 8), i).some((line) => /^\d{1,4}$/.test(line));
    if (previousHasPageNo) return i;
  }
  for (let i = 0; i < maxProbe; i++) {
    const title = cleaned[i];
    if (!/^1[、.．]\s*\S+/.test(title)) continue;
    if (!hasDocKeyword(title)) continue;
    if (isLikelyTocEntry(title)) continue;
    const previousHasPageNo = cleaned.slice(Math.max(0, i - 8), i).some((line) => /^\d{1,4}$/.test(line));
    if (previousHasPageNo) return i;
  }
  return 0;
}

function hasDocKeyword(title: string): boolean {
  return /(投标函|磋商函|竞争性磋商函|报价|报价单|报价表|授权|委托|身份证明|声明|承诺|保证金|保函|偏离表|简历表|业绩表|人员表|组成表|质量保修书|中小企业声明函|财务状况|技术方案|设计策划|资料|证明材料|证书|封面|目录)/.test(title);
}

function isTitleCandidate(lines: string[], index: number): boolean {
  const title = normalizeTitle(lines[index]);
  if (!title || title.length > TITLE_MAX) return false;
  if (isPageNumber(title)) return false;
  if (/^(第.+章|第一部分|第二部分|说明|注[:：]?|附[:：]?)$/.test(title)) return false;
  if (index < 30 && isLikelyTocEntry(lines[index])) return false;
  if (/^(是否授权|授权内容|本人|委托期限|投标人[:：]|法定代表人[:：]|地址[:：]|网址[:：]|电话[:：]|传真[:：]|邮政编码[:：])/.test(title)) {
    return false;
  }
  if (/^代理人无转委托权/.test(title)) return false;
  if (/签字或盖章|盖公章|盖章|年月日/.test(title) && !/授权委托书|身份证明|投标函|磋商函|承诺书/.test(title)) {
    return false;
  }
  if (/^[1-9]\d*[、.．]\s*(金额为|如果我方|一旦我方|我方已|招标文件中)/.test(title)) return false;
  if (/^(项目名称|项目编号|投标报价|小写|姓名|性别|年龄|职务|电话|传真|地址|网址|年月日|日期)[:：]?/.test(title)) {
    return false;
  }

  const prev = normalizeTitle(lines[index - 1] ?? '');
  const prev2 = normalizeTitle(lines[index - 2] ?? '');
  const separated =
    !prev ||
    isPageNumber(prev) ||
    !prev2 ||
    isPageNumber(prev2) ||
    /身份证复印件|身份证明复印件|扫描件|凭证扫描件/.test(prev);
  const numbered = isNumberedTitle(title);
  const tableNumbered = /^表[一二三四五六七八九十\d]+\s*\S+/.test(title);
  const attachmentNumbered = /^附件\s*\d+\s*[-－—]?\s*\S+/.test(title);
  const bareImportant = hasDocKeyword(title) && separated;

  if (/身份证复印件|身份证明复印件|扫描件|凭证扫描件/.test(title)) return false;
  if (numbered && separated && hasDocKeyword(title)) return true;
  if (tableNumbered || attachmentNumbered) return true;
  return bareImportant;
}

function cleanupBlockText(lines: string[]): string {
  return lines
    .filter((line) => !isPageNumber(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractFormatDocDrafts(formatChapterText: string): DraftFormatDoc[] {
  const lines = stripFormatChapterWrapper(formatChapterText);
  const starts: Array<{ index: number; title: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isTitleCandidate(lines, i)) continue;
    const title = normalizeTitle(lines[i]);
    const previous = starts[starts.length - 1];
    if (previous && i - previous.index < 3) continue;
    starts.push({ index: i, title });
  }

  const docs: DraftFormatDoc[] = [];
  starts.forEach((start, index) => {
    const next = starts[index + 1];
    const block = cleanupBlockText(lines.slice(start.index, next?.index ?? lines.length));
    if (!block || block.length < 8) return;
    docs.push({
      id: `fmt_${String(docs.length + 1).padStart(3, '0')}`,
      title: start.title,
      originalText: block,
    });
  });
  return docs.slice(0, MAX_DOCS);
}

function classifyKind(title: string, text: string): FormatDocKind {
  const haystack = `${title}\n${text}`;
  if (/格式自拟/.test(haystack)) return 'freeform';
  if (/投标函|磋商函|授权|委托|身份证明|声明|承诺|保函/.test(title)) return 'letter';
  if (/目录/.test(title)) return 'toc';
  if (/封面|投\s*标\s*文\s*件/.test(title) && text.length < 500) return 'cover';
  if (/报价|报价单|报价表|一览表|偏离表|简历表|人员表|业绩表|组成表|清单|表[一二三四五六七八九十\d]/.test(haystack)) {
    return 'table';
  }
  if (/凭证|复印件|证书|财务报表|审计报告|资信证明|资质|其他资料/.test(title) && !/授权|声明|承诺/.test(title)) {
    return 'attachment';
  }
  return 'letter';
}

function classifyVolume(title: string, text: string): FormatDocVolume {
  const haystack = `${title}\n${text}`;
  if (/投标函|磋商函|授权|委托|身份证明|声明|承诺|保函/.test(title)) return 'business';
  if (/报价|报价单|报价表|费用|价格|投标报价/.test(haystack)) return 'price';
  if (/技术方案|设计策划|技术条款|技术偏离|技术规格/.test(haystack)) return 'technical';
  return 'business';
}

function inferNote(title: string, text: string): string | undefined {
  const notes: string[] = [];
  if (/格式自拟/.test(text)) notes.push('格式自拟');
  if (/二次报价时提供/.test(text)) notes.push('二次报价时提供');
  if (/原件备查/.test(text)) notes.push('原件备查');
  if (/如无|需要时|至少符合/.test(text)) notes.push('按招标文件要求复核适用条件');
  return notes.length ? Array.from(new Set(notes)).join('；') : undefined;
}

function findProjectValue(label: string, projectName: string, analysis: TenderAnalysis | null, facts: GlobalFacts | null): string {
  if (/项目名称|招标项目名称/.test(label)) return projectName;
  const candidates: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(analysis?.projectInfo ?? {})) {
    candidates.push([key, value]);
  }
  for (const item of facts?.items ?? []) {
    candidates.push([`${item.title} ${item.category}`, item.value]);
  }
  const wanted = [
    [/项目编号|招标编号|标段编号|采购编号/, /编号|项目编号|招标编号|标段编号|采购编号/],
    [/工期|设计周期|服务期|交付期/, /工期|周期|服务期|交付/],
    [/保证金/, /保证金/],
    [/报价|金额|费用|预算|限价/, /报价|金额|费用|预算|限价/],
  ].find(([pattern]) => pattern.test(label));
  if (!wanted) return '';
  const matcher = wanted[1];
  return candidates.find(([key]) => matcher.test(key))?.[1] ?? '';
}

function findBidderValue(label: string, profile: BidderProfile | null): string {
  if (!profile) return '';
  if (/供应商名称|投标人名称|投标人|供应商|企业名称|公司名称/.test(label)) return profile.companyName;
  if (/统一社会信用代码|信用代码/.test(label)) return profile.unifiedSocialCreditCode;
  if (/地址/.test(label)) return profile.address;
  if (/邮政编码|邮编/.test(label)) return '';
  if (/电话|联系电话/.test(label)) return profile.phone;
  if (/传真/.test(label)) return '';
  if (/网址|网站/.test(label)) return '';
  if (/开户行|银行/.test(label)) return profile.bankName;
  if (/账号|银行账户/.test(label)) return profile.bankAccount;
  if (/委托|代理|被授权/.test(label) && /身份证/.test(label)) return profile.agent.idNo;
  if (/法定|法人/.test(label) && /身份证/.test(label)) return profile.legalRep.idNo;
  if (/法定代表人|法人/.test(label)) return profile.legalRep.name;
  if (/性别/.test(label)) return '';
  if (/年龄/.test(label)) return '';
  if (/职务|职称/.test(label)) return '';
  if (/身份证号码|身份证号/.test(label)) return profile.legalRep.idNo || profile.agent.idNo;
  if (/委托代理人|被授权人|代理人/.test(label)) return profile.agent.name;
  return '';
}

function inferFieldSource(label: string): FormatFieldSource {
  if (/项目名称|招标项目名称|项目编号|招标编号|标段编号|采购编号|工期|设计周期|服务期|交付期|保证金|报价|金额|预算|限价/.test(label)) {
    return 'project';
  }
  if (/供应商|投标人|企业名称|公司名称|统一社会信用代码|地址|邮政编码|邮编|电话|传真|网址|网站|开户行|账号|法定代表人|法人|委托代理人|被授权人|代理人|身份证/.test(label)) {
    return 'bidder';
  }
  return 'manual';
}

function fieldKey(label: string, source: FormatFieldSource, index: number): string {
  const normalized = label.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').toLowerCase();
  if (/项目名称|招标项目名称/.test(label)) return 'project_name';
  if (/项目编号|招标编号|采购编号/.test(label)) return 'project_code';
  if (/标段编号/.test(label)) return 'section_code';
  if (/供应商|投标人|企业名称|公司名称/.test(label)) return 'bidder_company_name';
  if (/法定代表人|法人/.test(label)) return 'legal_representative';
  if (/委托代理人|被授权人|代理人/.test(label)) return 'authorized_agent';
  if (/身份证/.test(label)) return 'id_number';
  if (/电话|联系电话/.test(label)) return 'phone';
  if (/地址/.test(label)) return 'address';
  if (/报价|金额/.test(label)) return 'bid_amount';
  return `${source}_${normalized || `field_${index + 1}`}`.slice(0, 80);
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/^[（(]|[）)]$/g, '')
    .replace(/\\([.()[\]-])/g, '$1')
    .replace(/\\+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function extractFields(text: string, projectName: string, analysis: TenderAnalysis | null, facts: GlobalFacts | null, profile: BidderProfile | null): FormatField[] {
  const labels: string[] = [];
  const pushLabel = (raw: string) => {
    const label = normalizeLabel(raw);
    if (!label || label.length > 40) return;
    if (/^(盖章|签字|签字或盖章|公章|年月日|格式自拟)$/.test(label)) return;
    labels.push(label);
  };

  for (const match of text.matchAll(/[（(]([^（）()\n]{1,40})[）)]/g)) pushLabel(match[1]);
  for (const line of text.split(/\r?\n/)) {
    const cleaned = cleanInlineMarkup(line);
    const match = cleaned.match(/^(项目名称|项目编号|标段编号|投标人名称|投标人|供应商名称|供应商|企业名称|地址|网址|电话|传真|邮政编码|姓名|性别|年龄|职务|身份证号码|法定代表人|委托代理人|开户行|账号)[:：]\s*/);
    if (match) pushLabel(match[1]);
  }

  const unique = Array.from(new Set(labels));
  return unique.slice(0, 30).map((label, index) => {
    const source = inferFieldSource(label);
    const value =
      source === 'project'
        ? findProjectValue(label, projectName, analysis, facts)
        : source === 'bidder'
          ? findBidderValue(label, profile)
          : '';
    return {
      key: fieldKey(label, source, index),
      label,
      source,
      value,
    };
  });
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanFilledTextArtifacts(text: string): string {
  return text
    .replace(/<a\b[^>]*><\/a>/gi, '')
    .replace(/\\([.()[\]-])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyFields(originalText: string, fields: FormatField[]): string {
  let text = originalText;
  for (const field of fields) {
    if (!field.value.trim()) continue;
    const label = escapeRegExp(field.label);
    text = text.replace(new RegExp(`\\\\\\(\\s*${label}\\s*\\\\\\)`, 'g'), field.value);
    text = text.replace(new RegExp(`（\\s*${label}\\s*）`, 'g'), field.value);
    text = text.replace(new RegExp(`\\(\\s*${label}\\s*\\)`, 'g'), field.value);
    text = text.replace(new RegExp(`(${label}[：:]\\s*)(?=\\n|$)`, 'g'), `$1${field.value}`);
  }
  return cleanFilledTextArtifacts(text);
}

function normalizeAiField(raw: RawFormatField, fallbackIndex: number): FormatField | null {
  const label = normalizeLabel(String(raw.label ?? ''));
  if (!label) return null;
  const rawSource = String(raw.source ?? '').trim();
  const source = FIELD_SOURCES.has(rawSource as FormatFieldSource) ? (rawSource as FormatFieldSource) : inferFieldSource(label);
  return {
    key: String(raw.key ?? '').trim() || fieldKey(label, source, fallbackIndex),
    label,
    source,
    value: String(raw.value ?? '').trim(),
  };
}

function mergeFields(base: FormatField[], aiFields: FormatField[] | undefined): FormatField[] {
  const byKey = new Map<string, FormatField>();
  for (const field of base) byKey.set(`${field.key}|${field.label}`, field);
  for (const field of aiFields ?? []) {
    const key = `${field.key}|${field.label}`;
    const previous = byKey.get(key);
    byKey.set(key, {
      ...(previous ?? field),
      source: field.source,
      value: field.value || previous?.value || '',
    });
  }
  return Array.from(byKey.values()).slice(0, 30);
}

function normalizeKind(value: unknown, fallback: FormatDocKind): FormatDocKind {
  const raw = String(value ?? '').trim();
  return KINDS.has(raw as FormatDocKind) ? (raw as FormatDocKind) : fallback;
}

function normalizeVolume(value: unknown, fallback: FormatDocVolume): FormatDocVolume {
  const raw = String(value ?? '').trim();
  return VOLUMES.has(raw as FormatDocVolume) ? (raw as FormatDocVolume) : fallback;
}

async function enrichWithAi(config: AIConfig, drafts: DraftFormatDoc[]): Promise<Map<string, RawFormatDocMeta>> {
  if (!activeApiKey(config) || drafts.length === 0) return new Map();
  const raw = await jsonChat<RawFormatDocsMeta>(config, {
    system: [
      '你是一名资深投标文件格式审查员。',
      '你只负责识别每个原文模板块的文书类型、分册、备注和占位字段。',
      '严禁改写 originalText；返回时只引用输入中的 id。',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          '下面是已经从招标文件格式章按原文切分出的模板块。请为每个块补充元数据。',
          '输出 JSON：{"docs":[{"id":"fmt_001","title":"可优化标题","kind":"letter|table|attachment|freeform|cover|toc","volume":"business|price|technical","note":"可空","fields":[{"key":"project_name","label":"项目名称","source":"project|bidder|manual","value":""}]}]}',
          '字段要求：项目名称/编号/工期/保证金/报价等 source=project；投标人/供应商/公司/法定代表人/委托代理人/地址/电话等 source=bidder；无法从项目或主体档案自动得出的为 manual。',
          '',
          JSON.stringify(
            drafts.slice(0, AI_DOC_LIMIT).map((doc) => ({
              id: doc.id,
              title: doc.title,
              excerpt: doc.originalText.slice(0, 1200),
            })),
            null,
            2,
          ),
        ].join('\n'),
      },
    ],
    temperature: 0.1,
    maxTokens: 4096,
    feature: 'project.formatDocs',
  });

  const out = new Map<string, RawFormatDocMeta>();
  if (Array.isArray(raw.docs)) {
    raw.docs.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const meta = item as RawFormatDocMeta;
      const id = String(meta.id ?? '').trim();
      if (id) out.set(id, meta);
    });
  }
  return out;
}

function sourceChapterTitle(formatChapterText: string): string {
  const line = formatChapterText.split(/\r?\n/).map(cleanInlineMarkup).find((item) => /^第.+章/.test(item));
  return line || '投标文件格式';
}

export async function generateFormatDocs(
  config: AIConfig,
  formatChapterText: string,
  projectName: string,
  analysis: TenderAnalysis | null,
  facts: GlobalFacts | null,
  bidderProfile: BidderProfile | null,
): Promise<FormatDocsResult> {
  const drafts = extractFormatDocDrafts(formatChapterText);
  if (drafts.length === 0) {
    throw new Error('格式文书提取失败：未能从格式章节切分出有效文书。');
  }

  let aiMeta = new Map<string, RawFormatDocMeta>();
  try {
    aiMeta = await enrichWithAi(config, drafts);
  } catch {
    aiMeta = new Map();
  }

  const docs: FormatDoc[] = drafts.map((draft) => {
    const meta = aiMeta.get(draft.id);
    const fallbackKind = classifyKind(draft.title, draft.originalText);
    const fallbackVolume = classifyVolume(draft.title, draft.originalText);
    const fields = extractFields(draft.originalText, projectName, analysis, facts, bidderProfile);
    const aiFields = Array.isArray(meta?.fields)
      ? meta.fields.map((item, index) => normalizeAiField(item as RawFormatField, index)).filter((item): item is FormatField => Boolean(item))
      : [];
    const mergedFields = mergeFields(fields, aiFields);
    const title = String(meta?.title ?? '').trim() || draft.title;
    return {
      id: draft.id,
      title: title.slice(0, TITLE_MAX),
      kind: normalizeKind(meta?.kind, fallbackKind),
      originalText: draft.originalText,
      filledText: applyFields(draft.originalText, mergedFields),
      fields: mergedFields,
      volume: normalizeVolume(meta?.volume, fallbackVolume),
      status: 'draft',
      note: String(meta?.note ?? '').trim() || inferNote(draft.title, draft.originalText),
    };
  });

  const timestamp = nowIso();
  return {
    sourceChapter: sourceChapterTitle(formatChapterText),
    docs: docs.slice(0, MAX_DOCS),
    generatedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function refreshFormatDocFilledText(doc: FormatDoc): FormatDoc {
  return {
    ...doc,
    filledText: applyFields(doc.originalText, doc.fields),
  };
}
