// 格式文书数据模型：从招标文件格式章抽取、填充、确认并插入投标文件。
import type { BidVolume } from '../types.js';

export type FormatDocKind = 'letter' | 'table' | 'attachment' | 'freeform' | 'cover' | 'toc';
export type FormatFieldSource = 'project' | 'bidder' | 'manual';
export type FormatDocStatus = 'draft' | 'confirmed';
export type FormatDocVolume = Extract<BidVolume, 'business' | 'price' | 'technical'>;

export interface FormatField {
  key: string;
  label: string;
  source: FormatFieldSource;
  value: string;
}

export interface FormatDoc {
  id: string;
  title: string;
  kind: FormatDocKind;
  originalText: string;
  filledText: string;
  fields: FormatField[];
  volume: FormatDocVolume;
  status: FormatDocStatus;
  note?: string;
}

export interface FormatDocsResult {
  sourceChapter: string;
  docs: FormatDoc[];
  generatedAt: string;
  updatedAt: string;
}
