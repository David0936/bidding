import type { BidSection } from './types.js';

const ORDINAL = '[0-9０-９一二三四五六七八九十百千万甲乙丙丁A-Za-z]+';
const SECTION_WORD = '(?:标段|标包|包件|分包|采购包)';
const LINE_PREFIX = '^\\s*(?:#{1,6}\\s*)?(?:[-*+]\\s*)?(?:[（(]?\\s*[0-9０-９一二三四五六七八九十]+\\s*[）).、]\\s*)?';
const SECTION_TITLE_RE = new RegExp(
  `${LINE_PREFIX}(?:(第?\\s*(${ORDINAL})\\s*${SECTION_WORD})|(${SECTION_WORD}\\s*(${ORDINAL})))(?:(?:\\s*[:：、.)）\\-—]\\s*|\\s+)(.{0,80}))?\\s*$`,
  'u',
);

function cleanLine(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTail(tail: string): string {
  return tail.replace(/^[：:、.)）\s\-—]+/, '').replace(/\s+/g, ' ').trim();
}

function normalizeCode(code: string | undefined): string | undefined {
  const cleaned = code?.replace(/\s+/g, '').trim();
  return cleaned || undefined;
}

function buildTitle(label: string, tail: string): string {
  const normalizedLabel = label.replace(/\s+/g, '');
  const normalizedTail = cleanTail(tail);
  return normalizedTail ? `${normalizedLabel}：${normalizedTail}` : normalizedLabel;
}

export function detectBidSections(markdown: string): BidSection[] {
  const lines = markdown.split(/\r?\n/);
  const seen = new Set<string>();
  const markers: Array<Omit<BidSection, 'id' | 'endLine'>> = [];

  lines.forEach((line, index) => {
    const cleaned = cleanLine(line);
    if (!cleaned || cleaned.length > 110) return;

    const match = SECTION_TITLE_RE.exec(cleaned);
    if (!match) return;

    const label = match[1] || match[3] || '';
    const code = normalizeCode(match[2] || match[4]);
    const tail = cleanTail(match[5] || '');
    const title = buildTitle(label, tail);
    const key = title.replace(/\s+/g, '');
    if (seen.has(key)) return;
    seen.add(key);

    markers.push({
      title,
      code,
      startLine: index + 1,
      summary: tail || undefined,
    });
  });

  if (markers.length < 2) return [];

  return markers.map((marker, index) => {
    const next = markers[index + 1];
    return {
      ...marker,
      id: `section-${index + 1}`,
      endLine: Math.max(marker.startLine, (next?.startLine ?? lines.length + 1) - 1),
    };
  });
}
