// Markdown 块级解析（与服务端导出逻辑保持一致的子集）：
// 段落/小标题/列表/表格/material:// 图片引用，供编辑器实时预览使用。

export interface TableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export type MarkdownBlock =
  | { type: 'heading'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'ordered'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; alt: string; ref: string }
  | TableBlock;

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

export function parseMarkdownBlocks(md: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;

    const image = line.trim().match(IMAGE_LINE);
    if (image) {
      blocks.push({ type: 'image', alt: image[1].trim(), ref: image[2].trim() });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      const width = headers.length;
      blocks.push({
        type: 'table',
        headers,
        rows: rows.map((row) => Array.from({ length: width }, (_, k) => row[k] ?? '')),
      });
      i = j - 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[2] });
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1] });
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({ type: 'ordered', text: line.trim() });
      continue;
    }

    blocks.push({ type: 'paragraph', text: line.trim() });
  }

  return blocks;
}

export interface MaterialRef {
  itemId: string;
  fileId: string;
}

export function parseMaterialRef(ref: string): MaterialRef | null {
  const m = ref.match(/^material:\/\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { itemId: m[1], fileId: m[2] };
}

/** 把含 **加粗** 的文本切成 [普通, 加粗, 普通…] 片段 */
export function splitBoldSegments(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part !== '')
    .map((part) => {
      const m = part.match(/^\*\*([^*]+)\*\*$/);
      return m ? { text: m[1], bold: true } : { text: part, bold: false };
    });
}
