// 资料文件解析：在招标文档格式基础上，支持图片（证照/扫描件）与表格（财务表 xlsx/csv）。
// 图片保留原件供插入正文与导出；xlsx/csv 解析为规范 Markdown 表格，可直接放入对应章节。
import ExcelJS from 'exceljs';
import { parseDocument } from './docParser.js';
import type { MaterialFileType } from './types.js';

/** 资料内容形态：文档（有全文文本）、图片（证照/扫描件）、表格（财务表等） */
export type MaterialKind = 'document' | 'image' | 'table';

export interface MaterialParseResult {
  /** 解析文本：文档为全文 Markdown；表格为 Markdown 表格；图片为占位说明 */
  text: string;
  fileType: MaterialFileType;
  kind: MaterialKind;
}

const MAX_TABLE_ROWS = 300;
const MAX_TABLE_COLS = 24;

export function detectMaterialFileType(fileName: string): MaterialFileType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return 'xlsx';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  return null;
}

export function materialMimeType(fileType: MaterialFileType): string {
  switch (fileType) {
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** 把二维数组渲染为 Markdown 表格（首行为表头） */
export function rowsToMarkdownTable(rows: string[][]): string {
  const width = Math.min(
    rows.reduce((max, row) => Math.max(max, row.length), 0),
    MAX_TABLE_COLS,
  );
  if (width === 0) return '';
  const normalized = rows
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => Array.from({ length: width }, (_, i) => escapeCell(row[i] ?? '')));
  const [header, ...body] = normalized;
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];
  if (rows.length > MAX_TABLE_ROWS) {
    lines.push('', `（表格较长，已截取前 ${MAX_TABLE_ROWS} 行）`);
  }
  return lines.join('\n');
}

/** 简易 CSV 解析（支持引号包裹、内嵌逗号和换行） */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const text = input.replace(/^﻿/, '');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

async function parseXlsxToMarkdown(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const chunks: string[] = [];

  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cell.text ?? '';
      });
      rows.push(values.map((v) => v ?? ''));
    });
    if (rows.length === 0) return;
    const table = rowsToMarkdownTable(rows);
    if (!table) return;
    if (workbook.worksheets.length > 1) {
      chunks.push(`**${sheet.name}**`, '', table);
    } else {
      chunks.push(table);
    }
  });

  return chunks.join('\n\n').trim();
}

export async function parseMaterialFile(buffer: Buffer, fileName: string): Promise<MaterialParseResult> {
  const fileType = detectMaterialFileType(fileName);
  if (!fileType) {
    throw new Error('暂不支持的文件格式。资料支持 PDF、Word(.docx)、txt、md、png、jpg、xlsx、csv。');
  }

  if (fileType === 'png' || fileType === 'jpg') {
    return {
      text: `（图片资料：${fileName}，已存档，可通过「插入章节」放入投标文件对应位置。）`,
      fileType,
      kind: 'image',
    };
  }

  if (fileType === 'xlsx') {
    const table = await parseXlsxToMarkdown(buffer);
    if (!table) throw new Error('Excel 解析结果为空，请确认表格内有数据。');
    return { text: table, fileType, kind: 'table' };
  }

  if (fileType === 'csv') {
    const rows = parseCsv(buffer.toString('utf-8'));
    const table = rowsToMarkdownTable(rows);
    if (!table) throw new Error('CSV 解析结果为空，请确认文件内有数据。');
    return { text: table, fileType, kind: 'table' };
  }

  const parsed = await parseDocument(buffer, fileName);
  return { text: parsed.text, fileType: parsed.fileType, kind: 'document' };
}
