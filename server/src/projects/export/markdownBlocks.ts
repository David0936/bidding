// Markdown 块级解析：把章节正文拆成段落/标题/列表/表格/图片块，供 Word、PDF 导出统一消费。
// 图片引用约定：![说明](material://itemId/fileId) 指向项目资料库中的原始图片。

export interface HeadingBlock {
  type: 'heading';
  text: string;
}

export interface BulletBlock {
  type: 'bullet';
  text: string;
}

export interface OrderedBlock {
  type: 'ordered';
  text: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface TableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface ImageBlock {
  type: 'image';
  alt: string;
  /** 原始引用地址，如 material://itemId/fileId */
  ref: string;
}

export type MarkdownBlock =
  | HeadingBlock
  | BulletBlock
  | OrderedBlock
  | ParagraphBlock
  | TableBlock
  | ImageBlock;

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

/** 把 Markdown 文本解析为块序列 */
export function parseMarkdownBlocks(md: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;

    // 图片行
    const image = line.trim().match(IMAGE_LINE);
    if (image) {
      blocks.push({ type: 'image', alt: image[1].trim(), ref: image[2].trim() });
      continue;
    }

    // 表格：当前行含 |，下一行是分隔行
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      // 列数对齐到表头宽度
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

export interface MaterialImageRef {
  itemId: string;
  fileId: string;
}

/** 解析 material://itemId/fileId 图片引用 */
export function parseMaterialRef(ref: string): MaterialImageRef | null {
  const m = ref.match(/^material:\/\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { itemId: m[1], fileId: m[2] };
}
