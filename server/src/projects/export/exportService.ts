// 导出服务：把目录 + 正文渲染为 Word(.docx)。
// 正文是 Markdown，这里做基础解析：小标题、无序/有序列表、加粗、普通段落。
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { Outline, OutlineNode } from '../outline/types.js';

const HEADING_BY_DEPTH = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
];

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
