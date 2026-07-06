// 导出服务：把目录 + 正文渲染为 Markdown / Word(.docx) / PDF。
// 正文是 Markdown，支持：小标题、无序/有序列表、加粗、普通段落、表格、material:// 图片引用。
import fs from 'node:fs';
import {
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  VerticalAlign,
} from 'docx';
import { parseMarkdownBlocks, parseMaterialRef, type MaterialImageRef, type TableBlock } from './markdownBlocks.js';
import { readImageSize } from './imageSize.js';
import fontkit from '@pdf-lib/fontkit';
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { Outline, OutlineNode } from '../outline/types.js';
import type { SealPlacement } from '../types.js';

const HEADING_BY_DEPTH = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
];

const A4 = { width: 595.28, height: 841.89 };
const PDF_MARGIN = { top: 64, right: 56, bottom: 64, left: 56 };

const FONT_CANDIDATES = [
  process.env.EASY_BIDDING_PDF_FONT_PATH,
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/STHeiti Light.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  'C:\\Windows\\Fonts\\msyh.ttc',
  'C:\\Windows\\Fonts\\msyh.ttf',
  'C:\\Windows\\Fonts\\simsun.ttc',
  'C:\\Windows\\Fonts\\simhei.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
].filter((p): p is string => Boolean(p));

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  standardFallback: boolean;
}

interface PdfContext {
  doc: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  y: number;
}

export interface PdfSealOptions {
  image: Buffer;
  mimeType: string;
  placements: SealPlacement[];
}

export interface ResolvedImage {
  buffer: Buffer;
  mimeType: string;
}

/** 解析 material://itemId/fileId 引用为图片二进制；返回 null 表示引用无效 */
export type MaterialImageResolver = (ref: MaterialImageRef) => ResolvedImage | null;

export interface BuildDocxOptions {
  resolveImage?: MaterialImageResolver;
}

export interface BuildPdfOptions {
  seal?: PdfSealOptions | null;
  resolveImage?: MaterialImageResolver;
}

function resolveImageRef(ref: string, resolver?: MaterialImageResolver): ResolvedImage | null {
  const parsed = parseMaterialRef(ref);
  if (!parsed || !resolver) return null;
  try {
    return resolver(parsed);
  } catch {
    return null;
  }
}

/** 把一行内含 **加粗** 的文本切分为多个 TextRun */
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  for (const part of parts) {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) runs.push(new TextRun({ text: m[1], bold: true }));
    else runs.push(new TextRun(part));
  }
  return runs.length > 0 ? runs : [new TextRun(text)];
}

/** Markdown 表格 → docx 表格（表头加粗，等分列宽，全宽） */
function tableToDocx(block: TableBlock): Table {
  const columnCount = Math.max(block.headers.length, 1);
  const columnWidth = Math.floor(100 / columnCount);
  const makeRow = (cells: string[], header: boolean) =>
    new TableRow({
      tableHeader: header,
      children: cells.map(
        (cell) =>
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            width: { size: columnWidth, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { before: 30, after: 30 },
                children: header ? [new TextRun({ text: cell, bold: true })] : inlineRuns(cell),
              }),
            ],
          }),
      ),
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [makeRow(block.headers, true), ...block.rows.map((row) => makeRow(row, false))],
  });
}

const DOCX_IMAGE_MAX_WIDTH = 540;

/** material:// 图片 → docx ImageRun 段落；解析失败时降级为文字占位 */
function imageToDocx(alt: string, ref: string, resolver?: MaterialImageResolver): (Paragraph | Table)[] {
  const resolved = resolveImageRef(ref, resolver);
  if (!resolved) {
    return [
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `【图片：${alt || ref}（未找到，请在资料清单中确认）】`, italics: true })],
      }),
    ];
  }
  const size = readImageSize(resolved.buffer, resolved.mimeType) ?? { width: 540, height: 360 };
  const scale = Math.min(1, DOCX_IMAGE_MAX_WIDTH / size.width);
  const type = resolved.mimeType.includes('png') ? 'png' : 'jpg';
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: alt ? 20 : 80 },
      children: [
        new ImageRun({
          type,
          data: resolved.buffer,
          transformation: {
            width: Math.round(size.width * scale),
            height: Math.round(size.height * scale),
          },
        }),
      ],
    }),
  ];
  if (alt) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: alt, size: 18, color: '666666' })],
      }),
    );
  }
  return out;
}

/** 把一段 Markdown 正文转换为 docx 段落/表格数组 */
function markdownToParagraphs(md: string, resolver?: MaterialImageResolver): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  for (const block of parseMarkdownBlocks(md)) {
    switch (block.type) {
      // 小标题用加粗段落表示（不进入正式标题层级，避免打乱目录结构）
      case 'heading':
        out.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [new TextRun({ text: block.text, bold: true })],
          }),
        );
        break;
      case 'bullet':
        out.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(block.text) }));
        break;
      case 'ordered':
        out.push(
          new Paragraph({
            indent: { left: 360 },
            children: inlineRuns(block.text),
          }),
        );
        break;
      case 'table':
        out.push(tableToDocx(block));
        // 表格后补空段落，避免紧贴下一段
        out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
        break;
      case 'image':
        out.push(...imageToDocx(block.alt, block.ref, resolver));
        break;
      default:
        // 普通段落（首行缩进 2 字符，符合中文公文习惯）
        out.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { firstLine: 480 },
            children: inlineRuns(block.text),
          }),
        );
    }
  }

  return out;
}

/** 递归渲染节点：标题 + （叶子）正文 */
function renderNodes(nodes: OutlineNode[], depth: number, resolver?: MaterialImageResolver): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const headingLevel = HEADING_BY_DEPTH[Math.min(depth, HEADING_BY_DEPTH.length - 1)];

  for (const n of nodes) {
    out.push(
      new Paragraph({
        heading: headingLevel,
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: n.title, bold: true })],
      }),
    );
    if (n.children.length > 0) {
      out.push(...renderNodes(n.children, depth + 1, resolver));
    } else if (n.content && n.content.trim()) {
      out.push(...markdownToParagraphs(n.content, resolver));
    }
  }
  return out;
}

function normalizeMarkdownBlock(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function renderMarkdownNodes(nodes: OutlineNode[], depth: number): string[] {
  const chunks: string[] = [];
  const headingDepth = Math.min(depth + 2, 6);

  for (const node of nodes) {
    chunks.push(`${'#'.repeat(headingDepth)} ${node.title}`);
    if (node.children.length > 0) {
      chunks.push(...renderMarkdownNodes(node.children, depth + 1));
    } else if (node.content?.trim()) {
      chunks.push(normalizeMarkdownBlock(node.content));
    }
  }

  return chunks;
}

export function buildMarkdown(outline: Outline): string {
  const title = outline.title || '投标技术方案';
  const chunks = [`# ${title}`, ...renderMarkdownNodes(outline.nodes, 0)];
  return `${chunks.filter((chunk) => chunk.trim()).join('\n\n')}\n`;
}

export async function buildDocx(outline: Outline, options: BuildDocxOptions = {}): Promise<Buffer> {
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: outline.title || '投标技术方案', bold: true, size: 36 })],
  });

  const doc = new Document({
    sections: [
      {
        children: [titlePara, ...renderNodes(outline.nodes, 0, options.resolveImage)],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function loadPdfFonts(doc: PDFDocument): Promise<PdfFonts> {
  doc.registerFontkit(fontkit);

  for (const candidate of FONT_CANDIDATES) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const bytes = fs.readFileSync(candidate);
      const regular = await doc.embedFont(bytes, { subset: true });
      return { regular, bold: regular, standardFallback: false };
    } catch {
      // 继续尝试下一个系统字体。
    }
  }

  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    standardFallback: true,
  };
}

function sanitizeForFont(text: string, fonts: PdfFonts): string {
  if (!fonts.standardFallback) return text;
  return text.replace(/[^\x20-\x7E]/g, '?');
}

function textWidth(text: string, font: PDFFont, size: number, fonts: PdfFonts): number {
  return font.widthOfTextAtSize(sanitizeForFont(text, fonts), size);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, fonts: PdfFonts): string[] {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  let line = '';

  for (const char of chars) {
    const next = `${line}${char}`;
    if (line && textWidth(next, font, size, fonts) > maxWidth) {
      lines.push(line.trimEnd());
      line = char.trimStart();
    } else {
      line = next;
    }
  }

  if (line.trim()) lines.push(line.trimEnd());
  return lines.length > 0 ? lines : [''];
}

function addPage(ctx: PdfContext): void {
  ctx.page = ctx.doc.addPage([A4.width, A4.height]);
  ctx.y = A4.height - PDF_MARGIN.top;
}

function ensureSpace(ctx: PdfContext, height: number): void {
  if (ctx.y - height < PDF_MARGIN.bottom) addPage(ctx);
}

function drawLine(
  ctx: PdfContext,
  text: string,
  x: number,
  size: number,
  font: PDFFont,
  color = rgb(0.08, 0.13, 0.2),
): void {
  ctx.page.drawText(sanitizeForFont(text, ctx.fonts), {
    x,
    y: ctx.y,
    size,
    font,
    color,
  });
}

function drawWrappedParagraph(
  ctx: PdfContext,
  text: string,
  options?: {
    font?: PDFFont;
    size?: number;
    firstLineIndent?: number;
    leftIndent?: number;
    after?: number;
    before?: number;
    color?: ReturnType<typeof rgb>;
  },
): void {
  const size = options?.size ?? 11;
  const font = options?.font ?? ctx.fonts.regular;
  const lineHeight = size * 1.72;
  const before = options?.before ?? 0;
  const after = options?.after ?? 8;
  const leftIndent = options?.leftIndent ?? 0;
  const firstLineIndent = options?.firstLineIndent ?? 0;
  const maxWidth = A4.width - PDF_MARGIN.left - PDF_MARGIN.right - leftIndent;
  const firstWidth = maxWidth - firstLineIndent;
  const firstLines = wrapText(text, font, size, firstWidth, ctx.fonts);

  ensureSpace(ctx, before + lineHeight);
  ctx.y -= before;

  firstLines.forEach((line, idx) => {
    const x = PDF_MARGIN.left + leftIndent + (idx === 0 ? firstLineIndent : 0);
    ensureSpace(ctx, lineHeight);
    drawLine(ctx, line, x, size, font, options?.color);
    ctx.y -= lineHeight;
  });
  ctx.y -= after;
}

const PDF_TABLE_FONT_SIZE = 9;
const PDF_TABLE_CELL_PADDING = 4;
const PDF_TABLE_BORDER = rgb(0.55, 0.6, 0.68);

/** 逐行绘制 Markdown 表格：等分列宽、单元格自动换行、跨页续排 */
function drawPdfTable(ctx: PdfContext, block: TableBlock): void {
  const columnCount = Math.max(block.headers.length, 1);
  const contentWidth = A4.width - PDF_MARGIN.left - PDF_MARGIN.right;
  const columnWidth = contentWidth / columnCount;
  const innerWidth = columnWidth - PDF_TABLE_CELL_PADDING * 2;
  const lineHeight = PDF_TABLE_FONT_SIZE * 1.4;

  const drawRow = (cells: string[], bold: boolean) => {
    const font = bold ? ctx.fonts.bold : ctx.fonts.regular;
    const wrapped = cells
      .slice(0, columnCount)
      .map((cell) => wrapText(cell || ' ', font, PDF_TABLE_FONT_SIZE, innerWidth, ctx.fonts));
    while (wrapped.length < columnCount) wrapped.push([' ']);
    const rowHeight =
      Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + PDF_TABLE_CELL_PADDING * 2;

    ensureSpace(ctx, rowHeight);
    const top = ctx.y;
    const bottom = top - rowHeight;

    // 边框
    for (let c = 0; c <= columnCount; c++) {
      const x = PDF_MARGIN.left + c * columnWidth;
      ctx.page.drawLine({
        start: { x, y: top },
        end: { x, y: bottom },
        thickness: 0.6,
        color: PDF_TABLE_BORDER,
      });
    }
    for (const y of [top, bottom]) {
      ctx.page.drawLine({
        start: { x: PDF_MARGIN.left, y },
        end: { x: PDF_MARGIN.left + contentWidth, y },
        thickness: 0.6,
        color: PDF_TABLE_BORDER,
      });
    }

    // 单元格文本
    wrapped.forEach((lines, c) => {
      const x = PDF_MARGIN.left + c * columnWidth + PDF_TABLE_CELL_PADDING;
      let textY = top - PDF_TABLE_CELL_PADDING - PDF_TABLE_FONT_SIZE;
      for (const line of lines) {
        ctx.page.drawText(sanitizeForFont(line, ctx.fonts), {
          x,
          y: textY,
          size: PDF_TABLE_FONT_SIZE,
          font,
          color: rgb(0.08, 0.13, 0.2),
        });
        textY -= lineHeight;
      }
    });

    ctx.y = bottom;
  };

  ctx.y -= 4;
  drawRow(block.headers, true);
  for (const row of block.rows) drawRow(row, false);
  ctx.y -= 10;
}

/** material:// 图片嵌入 PDF；解析失败时降级为文字占位 */
async function drawPdfImage(
  ctx: PdfContext,
  alt: string,
  ref: string,
  resolver?: MaterialImageResolver,
): Promise<void> {
  const resolved = resolveImageRef(ref, resolver);
  if (!resolved) {
    drawWrappedParagraph(ctx, `【图片：${alt || ref}（未找到，请在资料清单中确认）】`, {
      color: rgb(0.45, 0.45, 0.5),
      after: 6,
    });
    return;
  }

  const image = resolved.mimeType.includes('png')
    ? await ctx.doc.embedPng(resolved.buffer)
    : await ctx.doc.embedJpg(resolved.buffer);

  const contentWidth = A4.width - PDF_MARGIN.left - PDF_MARGIN.right;
  const maxHeight = A4.height - PDF_MARGIN.top - PDF_MARGIN.bottom - 30;
  const scale = Math.min(contentWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;

  ensureSpace(ctx, height + 12);
  const x = PDF_MARGIN.left + (contentWidth - width) / 2;
  ctx.page.drawImage(image, { x, y: ctx.y - height, width, height });
  ctx.y -= height + 6;

  if (alt) {
    const captionSize = 9;
    const captionWidth = textWidth(alt, ctx.fonts.regular, captionSize, ctx.fonts);
    ensureSpace(ctx, captionSize * 1.6);
    drawLine(ctx, alt, PDF_MARGIN.left + (contentWidth - captionWidth) / 2, captionSize, ctx.fonts.regular, rgb(0.4, 0.4, 0.45));
    ctx.y -= captionSize * 1.9;
  } else {
    ctx.y -= 6;
  }
}

async function markdownLinesToPdf(ctx: PdfContext, md: string, resolver?: MaterialImageResolver): Promise<void> {
  for (const block of parseMarkdownBlocks(md)) {
    switch (block.type) {
      case 'heading':
        drawWrappedParagraph(ctx, block.text, {
          font: ctx.fonts.bold,
          size: 12,
          before: 8,
          after: 5,
        });
        break;
      case 'bullet':
        drawWrappedParagraph(ctx, `• ${block.text}`, {
          leftIndent: 18,
          after: 5,
        });
        break;
      case 'ordered':
        drawWrappedParagraph(ctx, block.text, {
          leftIndent: 18,
          after: 5,
        });
        break;
      case 'table':
        drawPdfTable(ctx, block);
        break;
      case 'image':
        await drawPdfImage(ctx, block.alt, block.ref, resolver);
        break;
      default:
        drawWrappedParagraph(ctx, block.text, { firstLineIndent: 22 });
    }
  }
}

async function renderPdfNodes(
  ctx: PdfContext,
  nodes: OutlineNode[],
  depth: number,
  resolver?: MaterialImageResolver,
): Promise<void> {
  for (const node of nodes) {
    const size = Math.max(12, 17 - depth * 1.5);
    drawWrappedParagraph(ctx, node.title, {
      font: ctx.fonts.bold,
      size,
      before: depth === 0 ? 14 : 9,
      after: 6,
      color: rgb(0.03, 0.28, 0.67),
    });

    if (node.children.length > 0) {
      await renderPdfNodes(ctx, node.children, depth + 1, resolver);
    } else if (node.content?.trim()) {
      await markdownLinesToPdf(ctx, node.content, resolver);
    }
  }
}

async function drawSeal(doc: PDFDocument, seal: PdfSealOptions): Promise<void> {
  if (seal.placements.length === 0) return;
  const image =
    seal.mimeType === 'image/png'
      ? await doc.embedPng(seal.image)
      : await doc.embedJpg(seal.image);

  const pages = doc.getPages();
  for (const placement of seal.placements) {
    const page = pages[placement.page - 1];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const width = Math.min(Math.max(placement.widthRatio || 0.18, 0.05), 0.6) * pageWidth;
    const scale = width / image.width;
    const height = image.height * scale;
    const x = Math.min(Math.max(placement.xRatio, 0), 1) * pageWidth;
    const yTop = Math.min(Math.max(placement.yRatio, 0), 1) * pageHeight;
    const y = pageHeight - yTop - height;

    page.drawImage(image, {
      x: Math.min(Math.max(x, 0), Math.max(pageWidth - width, 0)),
      y: Math.min(Math.max(y, 0), Math.max(pageHeight - height, 0)),
      width,
      height,
      opacity: Math.min(Math.max(placement.opacity || 1, 0.1), 1),
      rotate: degrees(placement.rotation || 0),
    });
  }
}

export async function buildPdf(outline: Outline, options: BuildPdfOptions = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts = await loadPdfFonts(doc);
  const firstPage = doc.addPage([A4.width, A4.height]);
  const ctx: PdfContext = {
    doc,
    page: firstPage,
    fonts,
    y: A4.height - PDF_MARGIN.top,
  };

  const title = outline.title || '投标技术方案';
  const titleSize = 20;
  const titleLines = wrapText(
    title,
    fonts.bold,
    titleSize,
    A4.width - PDF_MARGIN.left - PDF_MARGIN.right,
    fonts,
  );
  for (const line of titleLines) {
    const lineWidth = textWidth(line, fonts.bold, titleSize, fonts);
    drawLine(ctx, line, (A4.width - lineWidth) / 2, titleSize, fonts.bold);
    ctx.y -= titleSize * 1.8;
  }
  ctx.y -= 18;

  await renderPdfNodes(ctx, outline.nodes, 0, options.resolveImage);

  if (options.seal) {
    await drawSeal(doc, options.seal);
  }

  return Buffer.from(await doc.save());
}
