import type { MaterialFileType, TenderFileType } from '../types.js';

export type MaterialItemCategory =
  | 'qualification'
  | 'business'
  | 'technical'
  | 'financial'
  | 'legal'
  | 'personnel'
  | 'performance'
  | 'price'
  | 'seal'
  | 'other';

export type MaterialOwnerRole = 'business' | 'technical' | 'finance' | 'project_manager' | 'product' | 'legal' | 'admin';

export type MaterialItemStatus = 'pending' | 'uploaded' | 'needs_review' | 'not_required';

export interface ProjectMaterialFile {
  id: string;
  fileName: string;
  fileType: MaterialFileType;
  charCount: number;
  uploadedAt: string;
  originalPath?: string;
  textPath?: string;
}

export interface ProjectMaterialItem {
  id: string;
  category: MaterialItemCategory;
  ownerRole: MaterialOwnerRole;
  required: boolean;
  status: MaterialItemStatus;
  title: string;
  description: string;
  purpose: string;
  sourceClause?: string;
  suggestedSection?: string;
  acceptedFileTypes: MaterialFileType[];
  uploadTips?: string;
  files: ProjectMaterialFile[];
}

export interface ProjectMaterialChecklist {
  summary: string;
  items: ProjectMaterialItem[];
  generatedAt: string;
  updatedAt: string;
}
