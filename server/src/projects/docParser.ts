// 文档解析：把上传的 PDF / Word / 纯文本解析为纯文本字符串。
// 注意：pdf-parse v1 的入口 index.js 含调试代码，直接 import 在 ESM 下会尝试读取测试文件而报错，
// 因此这里直接引用其内部实现 lib/pdf-parse.js 规避该问题。
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type { TenderFileType } from './types.js';

export interface ParseResult {
  text: string;
  fileType: TenderFileType;
}

/** 根据文件名后缀判断类型 */
export function detectFileType(fileName: string): TenderFileType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'txt';
  return null;
}

/** 规整解析后的文本：合并多余空行、去除行尾空白 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseDocument(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const fileType = detectFileType(fileName);
  if (!fileType) {
    throw new Error('暂不支持的文件格式，请上传 PDF、Word(.docx) 或 txt 文件。');
  }

  if (fileType === 'pdf') {
    const data = await pdfParse(buffer);
    const text = normalizeText(data.text || '');
    if (!text) throw new Error('PDF 解析结果为空，可能是扫描件（图片型 PDF），暂不支持 OCR。');
    return { text, fileType };
  }

  if (fileType === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = normalizeText(value || '');
    if (!text) throw new Error('Word 文档解析结果为空。');
    return { text, fileType };
  }

  // txt / md
  const text = normalizeText(buffer.toString('utf-8'));
  if (!text) throw new Error('文本文件内容为空。');
  return { text, fileType };
}
