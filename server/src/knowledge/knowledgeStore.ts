import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { KNOWLEDGE_DIR, ensureDirs } from '../store/paths.js';
import type {
  KnowledgeDocument,
  KnowledgeFolder,
  KnowledgeItem,
  KnowledgeOverview,
} from './types.js';
import type { TenderFileType } from '../projects/types.js';

const DEFAULT_KNOWLEDGE_ACCOUNT_ID = process.env.EASY_BIDDING_DEFAULT_ACCOUNT_ID || 'default-account';

interface KnowledgeState {
  folders: KnowledgeFolder[];
  documents: KnowledgeDocument[];
  items: KnowledgeItem[];
}

const INDEX_FILE = path.join(KNOWLEDGE_DIR, 'index.json');
const TEXT_DIR = path.join(KNOWLEDGE_DIR, 'texts');
const ORIGINAL_DIR = path.join(KNOWLEDGE_DIR, 'originals');

function nowIso(): string {
  return new Date().toISOString();
}

function ensureKnowledgeDirs(): void {
  ensureDirs();
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  fs.mkdirSync(ORIGINAL_DIR, { recursive: true });
}

function defaultState(): KnowledgeState {
  return { folders: [], documents: [], items: [] };
}

function defaultFolderId(accountId: string): string {
  return accountId === DEFAULT_KNOWLEDGE_ACCOUNT_ID
    ? 'default'
    : `default-${accountId.replace(/[^\w.-]/g, '_')}`;
}

function ensureDefaultFolder(state: KnowledgeState, accountId: string): KnowledgeFolder {
  const id = defaultFolderId(accountId);
  const existing = state.folders.find((folder) => folder.accountId === accountId && folder.id === id);
  if (existing) return existing;
  const ts = nowIso();
  const folder: KnowledgeFolder = {
    id,
    accountId,
    name: '默认资料库',
    createdAt: ts,
    updatedAt: ts,
  };
  state.folders.unshift(folder);
  return folder;
}

function normalizeState(parsed: Partial<KnowledgeState>): KnowledgeState {
  return {
    folders: Array.isArray(parsed.folders)
      ? parsed.folders.map((folder) => ({
          ...folder,
          accountId: folder.accountId ?? DEFAULT_KNOWLEDGE_ACCOUNT_ID,
        }))
      : [],
    documents: Array.isArray(parsed.documents)
      ? parsed.documents.map((doc) => ({
          ...doc,
          accountId: doc.accountId ?? DEFAULT_KNOWLEDGE_ACCOUNT_ID,
        }))
      : [],
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          ...item,
          accountId: item.accountId ?? DEFAULT_KNOWLEDGE_ACCOUNT_ID,
        }))
      : [],
  };
}

function readState(): KnowledgeState {
  ensureKnowledgeDirs();
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
    return normalizeState(JSON.parse(raw) as Partial<KnowledgeState>);
  } catch {
    const state = defaultState();
    writeState(state);
    return state;
  }
}

function writeState(state: KnowledgeState): void {
  ensureKnowledgeDirs();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function textFile(id: string): string {
  return path.join(TEXT_DIR, `${id}.txt`);
}

function originalFile(id: string, ext: TenderFileType): string {
  return path.join(ORIGINAL_DIR, `${id}.${ext}`);
}

export function getKnowledgeOverview(accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID): KnowledgeOverview {
  const state = readState();
  ensureDefaultFolder(state, accountId);
  writeState(state);
  return {
    folders: state.folders.filter((folder) => folder.accountId === accountId),
    documents: state.documents.filter((doc) => doc.accountId === accountId),
    items: state.items.filter((item) => item.accountId === accountId),
  };
}

export function createKnowledgeFolder(name?: string, accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID): KnowledgeFolder {
  const state = readState();
  ensureDefaultFolder(state, accountId);
  const ts = nowIso();
  const folder: KnowledgeFolder = {
    id: randomUUID(),
    accountId,
    name: name?.trim() || '新资料夹',
    createdAt: ts,
    updatedAt: ts,
  };
  state.folders.push(folder);
  writeState(state);
  return folder;
}

export function deleteKnowledgeFolder(id: string, accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID): boolean {
  if (id === defaultFolderId(accountId)) return false;
  const state = readState();
  const exists = state.folders.some((folder) => folder.id === id && folder.accountId === accountId);
  if (!exists) return false;
  const removedDocs = state.documents.filter((doc) => doc.folderId === id && doc.accountId === accountId);
  for (const doc of removedDocs) {
    fs.rmSync(textFile(doc.id), { force: true });
    fs.rmSync(originalFile(doc.id, doc.fileType), { force: true });
  }
  state.folders = state.folders.filter((folder) => !(folder.id === id && folder.accountId === accountId));
  state.documents = state.documents.filter((doc) => !(doc.folderId === id && doc.accountId === accountId));
  state.items = state.items.filter((item) => !(item.folderId === id && item.accountId === accountId));
  writeState(state);
  return true;
}

export function saveKnowledgeDocument(params: {
  accountId?: string;
  folderId: string;
  fileName: string;
  fileType: TenderFileType;
  text: string;
  originalBuffer?: Buffer;
}): KnowledgeDocument {
  const state = readState();
  const accountId = params.accountId ?? DEFAULT_KNOWLEDGE_ACCOUNT_ID;
  const defaultFolder = ensureDefaultFolder(state, accountId);
  const folderId = state.folders.some((folder) => folder.id === params.folderId && folder.accountId === accountId)
    ? params.folderId
    : defaultFolder.id;
  const ts = nowIso();
  const document: KnowledgeDocument = {
    id: randomUUID(),
    accountId,
    folderId,
    fileName: params.fileName,
    fileType: params.fileType,
    charCount: params.text.length,
    createdAt: ts,
    updatedAt: ts,
  };
  fs.writeFileSync(textFile(document.id), params.text, 'utf-8');
  if (params.originalBuffer) {
    fs.writeFileSync(originalFile(document.id, params.fileType), params.originalBuffer);
  }
  state.documents.unshift(document);
  writeState(state);
  return document;
}

export function getKnowledgeDocumentText(id: string): string | null {
  try {
    return fs.readFileSync(textFile(id), 'utf-8');
  } catch {
    return null;
  }
}

export function deleteKnowledgeDocument(id: string, accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID): boolean {
  const state = readState();
  const doc = state.documents.find((item) => item.id === id && item.accountId === accountId);
  if (!doc) return false;
  fs.rmSync(textFile(doc.id), { force: true });
  fs.rmSync(originalFile(doc.id, doc.fileType), { force: true });
  state.documents = state.documents.filter((item) => !(item.id === id && item.accountId === accountId));
  state.items = state.items.filter((item) => !(item.documentId === id && item.accountId === accountId));
  writeState(state);
  return true;
}

export function replaceKnowledgeItems(
  documentId: string,
  items: Array<Omit<KnowledgeItem, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>>,
  accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID,
): KnowledgeItem[] {
  const state = readState();
  const doc = state.documents.find((item) => item.id === documentId && item.accountId === accountId);
  if (!doc) return [];
  const ts = nowIso();
  const saved = items.map((item) => ({
    ...item,
    id: randomUUID(),
    accountId,
    folderId: doc.folderId,
    documentId,
    createdAt: ts,
    updatedAt: ts,
  }));
  state.items = [
    ...saved,
    ...state.items.filter((item) => !(item.documentId === documentId && item.accountId === accountId)),
  ];
  state.documents = state.documents.map((item) =>
    item.id === documentId && item.accountId === accountId ? { ...item, analyzedAt: ts, updatedAt: ts } : item,
  );
  writeState(state);
  return saved;
}

export function deleteKnowledgeItem(id: string, accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID): boolean {
  const state = readState();
  const before = state.items.length;
  state.items = state.items.filter((item) => !(item.id === id && item.accountId === accountId));
  if (state.items.length === before) return false;
  writeState(state);
  return true;
}

export function listKnowledgeItems(accountId = DEFAULT_KNOWLEDGE_ACCOUNT_ID): KnowledgeItem[] {
  return readState().items.filter((item) => item.accountId === accountId);
}
