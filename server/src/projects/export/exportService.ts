// 导出服务：把目录 + 正文渲染为 Markdown / Word(.docx) / PDF。
// 正文是 Markdown，这里做基础解析：小标题、无序/有序列表、加粗、普通段落。
import fs from 'node:fs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
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

export interface BuildPdfOptions {
  seal?: PdfSealOptions | null;
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

/** 把一段 Markdown 正文转换为 docx 段落数组 */
function markdownToParagraphs(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    // 标题 #, ##, ### → 用加粗段落表示（不进入正式标题层级，避免打乱目录结构）
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      out.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [new TextRun({ text: heading[2], bold: true })],
        }),
      );
      continue;
    }

    // 无序列表 - / * / •
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(bullet[1]) }));
      continue;
    }

    // 有序列表 1. 2. …（保留序号为普通段落，避免额外编号配置）
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      out.push(
        new Paragraph({
          indent: { left: 360 },
          children: inlineRuns(line.trim()),
        }),
      );
      continue;
    }

    // 普通段落（首行缩进 2 字符，符合中文公文习惯）
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        indent: { firstLine: 480 },
        children: inlineRuns(line.trim()),
      }),
    );
  }

  return out;
}

/** 递归渲染节点：标题 + （叶子）正文 */
function renderNodes(nodes: OutlineNode[], depth: number): Paragraph[] {
  const out: Paragraph[] = [];
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
      out.push(...renderNodes(n.children, depth + 1));
    } else if (n.content && n.content.trim()) {
      out.push(...markdownToParagraphs(n.content));
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

export async function buildDocx(outline: Outline): Promise<Buffer> {
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: outline.title || '投标技术方案', bold: true, size: 36 })],
  });

  const doc = new Document({
    sections: [
      {
        children: [titlePara, ...renderNodes(outline.nodes, 0)],
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

function markdownLinesToPdf(ctx: PdfContext, md: string): void {
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      drawWrappedParagraph(ctx, heading[2], {
        font: ctx.fonts.bold,
        size: 12,
        before: 8,
        after: 5,
      });
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      drawWrappedParagraph(ctx, `• ${bullet[1]}`, {
        leftIndent: 18,
        after: 5,
      });
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      drawWrappedParagraph(ctx, line.trim(), {
        leftIndent: 18,
        after: 5,
      });
      continue;
    }

    drawWrappedParagraph(ctx, line.trim(), { firstLineIndent: 22 });
  }
}

function renderPdfNodes(ctx: PdfContext, nodes: OutlineNode[], depth: number): void {
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
      renderPdfNodes(ctx, node.children, depth + 1);
    } else if (node.content?.trim()) {
      markdownLinesToPdf(ctx, node.content);
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

  renderPdfNodes(ctx, outline.nodes, 0);

  if (options.seal) {
    await drawSeal(doc, options.seal);
  }

  return Buffer.from(await doc.save());
}
