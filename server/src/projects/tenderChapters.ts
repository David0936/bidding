// 招标文件章节识别与按用途取材：纯规则解析，不调用 AI。
export type ChapterRole =
  | 'notice'
  | 'instructions'
  | 'scoring'
  | 'requirements'
  | 'contract'
  | 'format'
  | 'other';

export interface TenderChapter {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
  charCount: number;
  roles: ChapterRole[];
}

const CHAPTER_HEADING_RE = /^第\s*([一二三四五六七八九十百千万〇零\d]+)\s*(章|部分|篇)\s*([、.．:：\-\s]*)(.*)$/;
const CHINESE_NUMBERS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

interface HeadingCandidate {
  title: string;
  titleText: string;
  titleKey: string;
  chapterNo: number;
  lineNo: number;
}

interface TocSequence {
  entries: HeadingCandidate[];
  lineNos: Set<number>;
}

function cleanHeadingLine(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/<a\b[^>]*><\/a>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/^`+|`+$/g, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\s*[).、]\s*/, '')
    .replace(/\\([.()[\]])/g, '$1')
    .trim();
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, '')
    .replace(/[.．·…•_—\-]{2,}\d*$/g, '')
    .replace(/[.．·…•_—\-]+/g, '')
    .replace(/\d+$/g, '')
    .replace(/[：:、，,。；;（）()【】\[\]]/g, '')
    .trim();
}

function parseChineseNumber(input: string): number {
  const raw = input.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw.length === 1) return CHINESE_NUMBERS[raw] ?? Number.NaN;
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of raw) {
    if (ch === '十') {
      section += (digit || 1) * 10;
      digit = 0;
    } else if (ch === '百') {
      section += (digit || 1) * 100;
      digit = 0;
    } else if (ch === '千') {
      section += (digit || 1) * 1000;
      digit = 0;
    } else if (ch === '万') {
      total += (section + digit) * 10000;
      section = 0;
      digit = 0;
    } else {
      digit = CHINESE_NUMBERS[ch] ?? digit;
    }
  }
  const value = total + section + digit;
  return value > 0 ? value : Number.NaN;
}

function parseChapterHeading(line: string): HeadingCandidate | null {
  const cleaned = cleanHeadingLine(line);
  if (!cleaned || cleaned.length > 120) return null;
  const match = cleaned.match(CHAPTER_HEADING_RE);
  if (!match) return null;
  const chapterNo = parseChineseNumber(match[1]);
  if (!Number.isFinite(chapterNo) || chapterNo <= 0) return null;
  const title = cleaned.replace(/[.．·…•_—\-]{2,}\s*\d+$/g, '').trim();
  const titleText = String(match[4] ?? '').replace(/[.．·…•_—\-]{2,}\s*\d+$/g, '').trim();
  if (title.length < 3) return null;
  return {
    title,
    titleText: titleText || title,
    titleKey: normalizeTitle(titleText || title),
    chapterNo,
    lineNo: 0,
  };
}

export function classifyChapterRole(title: string): ChapterRole[] {
  const normalized = normalizeTitle(title);
  const roles: ChapterRole[] = [];
  // 「合同条款及格式」类标题的"格式"指合同格式，不是投标文件格式章，排除后单独归 contract
  const isContractChapter = /合同|协议/.test(normalized);
  if (!isContractChapter && /格式|响应文件|投标文件组成|投标文件的组成|附件/.test(normalized)) {
    roles.push('format');
  }
  if (/评标|评审|评分|评定|评审方法|评分细则|综合评分/.test(normalized)) roles.push('scoring');
  if (/须知|供应商须知|投标人须知|前附表/.test(normalized)) roles.push('instructions');
  if (/需求|技术要求|技术规范|采购内容|采购清单|服务要求|设计任务|工程量清单/.test(normalized)) {
    roles.push('requirements');
  }
  if (/合同|协议|条款/.test(normalized)) roles.push('contract');
  if (/邀请|公告|采购公告|磋商邀请|招标公告|投标邀请/.test(normalized)) roles.push('notice');
  return roles.length ? Array.from(new Set(roles)) : ['other'];
}

export function detectTenderChapters(markdown: string): TenderChapter[] {
  const lines = markdown.split(/\r?\n/);
  const prefixedCandidates: HeadingCandidate[] = [];

  lines.forEach((line, index) => {
    const candidate = parseChapterHeading(line);
    if (!candidate || !candidate.titleKey) return;
    prefixedCandidates.push({ ...candidate, lineNo: index + 1 });
  });

  const tocSequences = findTocSequences(prefixedCandidates);
  const tocLineNos = new Set(tocSequences.flatMap((sequence) => Array.from(sequence.lineNos)));
  const primaryToc = tocSequences.find((sequence) => sequence.entries.length >= 3);
  const bodyCandidates = prefixedCandidates.filter((candidate) => !tocLineNos.has(candidate.lineNo));
  const titleLineCandidates = collectTitleLineCandidates(lines, primaryToc?.entries ?? [], bodyCandidates, tocLineNos);
  const candidates = primaryToc
    ? buildCandidatesFromToc(primaryToc.entries, bodyCandidates, titleLineCandidates)
    : buildSequentialCandidates(bodyCandidates);

  return candidates.map((candidate, index) => {
    const next = candidates[index + 1];
    const startLine = candidate.lineNo;
    const endLine = next ? Math.max(startLine, next.lineNo - 1) : lines.length;
    const text = lines.slice(startLine - 1, endLine).join('\n');
    return {
      id: `ch_${index + 1}`,
      title: candidate.title,
      startLine,
      endLine,
      charCount: text.length,
      roles: classifyChapterRole(candidate.title),
    };
  });
}

function findTocSequences(candidates: HeadingCandidate[]): TocSequence[] {
  const sequences: TocSequence[] = [];
  for (let start = 0; start < candidates.length; start++) {
    const entries = [candidates[start]];
    let expected = candidates[start].chapterNo + 1;
    let lastLine = candidates[start].lineNo;
    for (let i = start + 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.lineNo - lastLine > 12) break;
      if (candidate.chapterNo === expected) {
        entries.push(candidate);
        expected += 1;
        lastLine = candidate.lineNo;
        continue;
      }
      if (candidate.chapterNo <= candidates[start].chapterNo) break;
    }
    const span = entries[entries.length - 1].lineNo - entries[0].lineNo;
    if (entries.length >= 3 && span <= 120) {
      sequences.push({ entries, lineNos: new Set(entries.map((entry) => entry.lineNo)) });
      start += entries.length - 1;
    }
  }
  return sequences;
}

function collectTitleLineCandidates(
  lines: string[],
  tocEntries: HeadingCandidate[],
  bodyCandidates: HeadingCandidate[],
  tocLineNos: Set<number>,
): HeadingCandidate[] {
  const bodyLineNos = new Set(bodyCandidates.map((candidate) => candidate.lineNo));
  const tocTitleByKey = new Map(tocEntries.map((entry) => [entry.titleKey, entry]));
  const titleOnly: HeadingCandidate[] = [];
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (tocLineNos.has(lineNo) || bodyLineNos.has(lineNo)) return;
    const cleaned = cleanHeadingLine(line).replace(/[.．·…•_—\-]{2,}\s*\d+$/g, '').trim();
    if (!cleaned || cleaned.length > 80) return;
    const key = normalizeTitle(cleaned);
    const toc = tocTitleByKey.get(key);
    if (!toc) return;
    titleOnly.push({
      title: cleaned,
      titleText: cleaned,
      titleKey: key,
      chapterNo: toc.chapterNo,
      lineNo,
    });
  });
  return titleOnly;
}

function buildCandidatesFromToc(
  tocEntries: HeadingCandidate[],
  bodyCandidates: HeadingCandidate[],
  titleLineCandidates: HeadingCandidate[],
): HeadingCandidate[] {
  const selected: HeadingCandidate[] = [];
  let minLine = tocEntries[tocEntries.length - 1].lineNo + 1;
  for (const toc of tocEntries) {
    const laterBody = bodyCandidates.filter((candidate) => candidate.lineNo >= minLine);
    const laterTitleOnly = titleLineCandidates.filter((candidate) => candidate.lineNo >= minLine);
    const exactBody = laterBody.find((candidate) => candidate.chapterNo === toc.chapterNo && candidate.titleKey === toc.titleKey);
    const exactTitleOnly = laterTitleOnly.find(
      (candidate) => candidate.chapterNo === toc.chapterNo && candidate.titleKey === toc.titleKey,
    );
    const sameNumber = laterBody.find((candidate) => candidate.chapterNo === toc.chapterNo);
    const picked = exactBody ?? (exactTitleOnly ? { ...exactTitleOnly, title: toc.title, titleText: toc.titleText } : sameNumber);
    if (!picked) continue;
    selected.push(picked);
    minLine = picked.lineNo + 1;
  }
  return selected.sort((a, b) => a.lineNo - b.lineNo);
}

function buildSequentialCandidates(candidates: HeadingCandidate[]): HeadingCandidate[] {
  const selected: HeadingCandidate[] = [];
  for (const candidate of candidates) {
    const last = selected[selected.length - 1];
    if (!last || candidate.chapterNo > last.chapterNo) {
      selected.push(candidate);
    }
  }
  return selected;
}

function chapterMarkdown(markdown: string, chapter: TenderChapter): string {
  const lines = markdown.split(/\r?\n/);
  return lines.slice(Math.max(0, chapter.startLine - 1), chapter.endLine).join('\n').trim();
}

function withChapterHeader(chapter: TenderChapter, text: string): string {
  return [`## ${chapter.title}`, `> 原文行号：${chapter.startLine}-${chapter.endLine}`, '', text].join('\n');
}

export function getChapterText(
  markdown: string,
  chapters: TenderChapter[] | null | undefined,
  roles: ChapterRole[],
  maxChars: number,
): string {
  const safeMax = Math.max(1000, Math.trunc(maxChars));
  const selected = (chapters ?? []).filter((chapter) => chapter.roles.some((role) => roles.includes(role)));
  if (selected.length === 0) {
    const clipped = markdown.slice(0, safeMax);
    return markdown.length > safeMax
      ? `${clipped}\n\n（注：未识别到匹配章节，以上为全文前 ${safeMax} 字节选。）`
      : clipped;
  }

  const blocks = selected.map((chapter) => withChapterHeader(chapter, chapterMarkdown(markdown, chapter)));
  const joined = blocks.join('\n\n---\n\n');
  if (joined.length <= safeMax) return joined;

  const budgetPerChapter = Math.max(800, Math.floor(safeMax / selected.length) - 120);
  const clippedBlocks = selected.map((chapter) => {
    const text = chapterMarkdown(markdown, chapter);
    const clipped =
      text.length > budgetPerChapter
        ? `${text.slice(0, budgetPerChapter)}\n\n（注：本章过长，已按章节均匀截取开头。）`
        : text;
    return withChapterHeader(chapter, clipped);
  });
  const clippedJoined = clippedBlocks.join('\n\n---\n\n');
  return clippedJoined.length > safeMax
    ? `${clippedJoined.slice(0, safeMax)}\n\n（注：所选章节仍超过预算，已保留各章前部内容。）`
    : clippedJoined;
}
