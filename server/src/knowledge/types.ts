import type { TenderFileType } from '../projects/types.js';

export interface KnowledgeFolder {
  id: string;
  accountId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  accountId: string;
  folderId: string;
  fileName: string;
  fileType: TenderFileType;
  charCount: number;
  markdownPath?: string;
  createdAt: string;
  updatedAt: string;
  analyzedAt?: string;
}

export interface KnowledgeItem {
  id: string;
  accountId: string;
  folderId: string;
  documentId: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeOverview {
  folders: KnowledgeFolder[];
  documents: KnowledgeDocument[];
  items: KnowledgeItem[];
}
