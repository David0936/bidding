// 文件式项目存储。每个项目一个目录：
//   data/projects/<id>/project.json   元数据
//   data/projects/<id>/tender.txt     招标文件解析出的纯文本
//   data/projects/<id>/original-plan.txt 已有方案解析出的纯文本
//   data/projects/<id>/original.<ext> 上传的原始文件
//   data/projects/<id>/seal-image.bin 电子印章图片
//   data/projects/<id>/seal-placements.json 电子印章坐标
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECTS_DIR, ensureDirs } from '../store/paths.js';
import type { ElectronicSeal, Project, SealPlacement, TenderDoc } from './types.js';
import type { Outline } from './outline/types.js';
import type { GlobalFacts, TenderAnalysis } from './analysis/types.js';
import type { ConsistencyAudit } from './audit/types.js';

const DEFAULT_PROJECT_ACCOUNT_ID = process.env.EASY_BIDDING_DEFAULT_ACCOUNT_ID || 'default-account';

function projectDir(id: string): string {
  return path.join(PROJECTS_DIR, id);
}
function metaFile(id: string): string {
  return path.join(projectDir(id), 'project.json');
}
function tenderTextFile(id: string): string {
  return path.join(projectDir(id), 'tender.txt');
}
function originalPlanTextFile(id: string): string {
  return path.join(projectDir(id), 'original-plan.txt');
}
function outlineFile(id: string): string {
  return path.join(projectDir(id), 'outline.json');
}
function analysisFile(id: string): string {
  return path.join(projectDir(id), 'analysis.json');
}
function globalFactsFile(id: string): string {
  return path.join(projectDir(id), 'global-facts.json');
}
function consistencyAuditFile(id: string): string {
  return path.join(projectDir(id), 'consistency-audit.json');
}
function sealImageFile(id: string): string {
  return path.join(projectDir(id), 'seal-image.bin');
}
function sealPlacementsFile(id: string): string {
  return path.join(projectDir(id), 'seal-placements.json');
}

function nowIso(): string {
  return new Date().toISOString();
}

function readMeta(id: string): Project | null {
  try {
    const raw = fs.readFileSync(metaFile(id), 'utf-8');
    const parsed = JSON.parse(raw) as Project;
    return {
      ...parsed,
      accountId: parsed.accountId ?? DEFAULT_PROJECT_ACCOUNT_ID,
      originalPlan: parsed.originalPlan ?? null,
      seal: parsed.seal ?? null,
    };
  } catch {
    return null;
  }
}

function writeMeta(project: Project): void {
  ensureDirs();
  fs.mkdirSync(projectDir(project.id), { recursive: true });
  fs.writeFileSync(metaFile(project.id), JSON.stringify(project, null, 2), 'utf-8');
}

function belongsToAccount(project: Project | null, accountId?: string): project is Project {
  if (!project) return false;
  if (!accountId) return true;
  return project.accountId === accountId;
}

export function createProject(name?: string, accountId = DEFAULT_PROJECT_ACCOUNT_ID): Project {
  const id = randomUUID();
  const ts = nowIso();
  const project: Project = {
    id,
    accountId,
    name: name?.trim() || '未命名标书',
    createdAt: ts,
    updatedAt: ts,
    tender: null,
    originalPlan: null,
    seal: null,
  };
  writeMeta(project);
  return project;
}

export function listProjects(): Project[] {
  ensureDirs();
  const ids = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const projects = ids
    .map((id) => readMeta(id))
    .filter((p): p is Project => p !== null);
  // 最近更新在前
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listProjectsForAccount(accountId: string): Project[] {
  return listProjects().filter((project) => project.accountId === accountId);
}

export function getProject(id: string, accountId?: string): Project | null {
  const project = readMeta(id);
  return belongsToAccount(project, accountId) ? project : null;
}

export function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'accountId' | 'createdAt'>>,
  accountId?: string,
): Project | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  const updated: Project = {
    ...current,
    ...patch,
    id: current.id,
    accountId: current.accountId,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  };
  writeMeta(updated);
  return updated;
}

export function deleteProject(id: string, accountId?: string): boolean {
  const current = getProject(id, accountId);
  if (!current) return false;
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function clearGeneratedFiles(id: string): void {
  for (const file of [outlineFile(id), globalFactsFile(id), consistencyAuditFile(id)]) {
    fs.rmSync(file, { force: true });
  }
}

/** 保存招标文件解析结果（文本另存为文件，元数据记录摘要） */
export function saveTender(id: string, tender: TenderDoc, text: string, originalBuffer?: Buffer, originalExt?: string): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(tenderTextFile(id), text, 'utf-8');
  for (const entry of fs.readdirSync(projectDir(id))) {
    if (entry.startsWith('original.')) {
      fs.rmSync(path.join(projectDir(id), entry), { force: true });
    }
  }
  if (originalBuffer && originalExt) {
    fs.writeFileSync(path.join(projectDir(id), `original.${originalExt}`), originalBuffer);
  }
  for (const file of [analysisFile(id)]) fs.rmSync(file, { force: true });
  clearGeneratedFiles(id);
  return updateProject(id, { tender });
}

export function getTenderText(id: string): string | null {
  try {
    return fs.readFileSync(tenderTextFile(id), 'utf-8');
  } catch {
    return null;
  }
}

/** 保存已有方案解析结果（用于扩写模式） */
export function saveOriginalPlan(
  id: string,
  originalPlan: TenderDoc,
  text: string,
  originalBuffer?: Buffer,
  originalExt?: string,
): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(originalPlanTextFile(id), text, 'utf-8');
  for (const entry of fs.readdirSync(projectDir(id))) {
    if (entry.startsWith('original-plan.')) {
      fs.rmSync(path.join(projectDir(id), entry), { force: true });
    }
  }
  if (originalBuffer && originalExt) {
    fs.writeFileSync(path.join(projectDir(id), `original-plan.${originalExt}`), originalBuffer);
  }
  clearGeneratedFiles(id);
  return updateProject(id, { originalPlan });
}

export function getOriginalPlanText(id: string): string | null {
  try {
    return fs.readFileSync(originalPlanTextFile(id), 'utf-8');
  } catch {
    return null;
  }
}

export function deleteOriginalPlan(id: string): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  fs.rmSync(originalPlanTextFile(id), { force: true });
  for (const entry of fs.existsSync(projectDir(id)) ? fs.readdirSync(projectDir(id)) : []) {
    if (entry.startsWith('original-plan.')) {
      fs.rmSync(path.join(projectDir(id), entry), { force: true });
    }
  }
  clearGeneratedFiles(id);
  return updateProject(id, { originalPlan: null });
}

/** 保存目录（同时更新项目 updatedAt） */
export function saveOutline(id: string, outline: Outline): Outline | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(outlineFile(id), JSON.stringify(outline, null, 2), 'utf-8');
  fs.rmSync(consistencyAuditFile(id), { force: true });
  updateProject(id, {});
  return outline;
}

export function getOutline(id: string): Outline | null {
  try {
    return JSON.parse(fs.readFileSync(outlineFile(id), 'utf-8')) as Outline;
  } catch {
    return null;
  }
}

/** 保存招标文件关键项解析结果 */
export function saveAnalysis(id: string, analysis: TenderAnalysis): TenderAnalysis | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(analysisFile(id), JSON.stringify(analysis, null, 2), 'utf-8');
  updateProject(id, {});
  return analysis;
}

export function getAnalysis(id: string): TenderAnalysis | null {
  try {
    return JSON.parse(fs.readFileSync(analysisFile(id), 'utf-8')) as TenderAnalysis;
  } catch {
    return null;
  }
}

/** 保存全局事实变量 */
export function saveGlobalFacts(id: string, facts: GlobalFacts): GlobalFacts | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(globalFactsFile(id), JSON.stringify(facts, null, 2), 'utf-8');
  fs.rmSync(consistencyAuditFile(id), { force: true });
  updateProject(id, {});
  return facts;
}

export function getGlobalFacts(id: string): GlobalFacts | null {
  try {
    return JSON.parse(fs.readFileSync(globalFactsFile(id), 'utf-8')) as GlobalFacts;
  } catch {
    return null;
  }
}

export function saveConsistencyAudit(id: string, audit: ConsistencyAudit): ConsistencyAudit | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(consistencyAuditFile(id), JSON.stringify(audit, null, 2), 'utf-8');
  updateProject(id, {});
  return audit;
}

export function getConsistencyAudit(id: string): ConsistencyAudit | null {
  try {
    return JSON.parse(fs.readFileSync(consistencyAuditFile(id), 'utf-8')) as ConsistencyAudit;
  } catch {
    return null;
  }
}

export function saveSeal(
  id: string,
  seal: ElectronicSeal,
  imageBuffer: Buffer,
  accountId?: string,
): Project | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(sealImageFile(id), imageBuffer);
  return updateProject(id, { seal }, accountId);
}

export function getSealImage(id: string): Buffer | null {
  try {
    return fs.readFileSync(sealImageFile(id));
  } catch {
    return null;
  }
}

export function deleteSeal(id: string, accountId?: string): Project | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  fs.rmSync(sealImageFile(id), { force: true });
  fs.rmSync(sealPlacementsFile(id), { force: true });
  return updateProject(id, { seal: null }, accountId);
}

export function saveSealPlacements(
  id: string,
  placements: SealPlacement[],
  accountId?: string,
): SealPlacement[] | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(sealPlacementsFile(id), JSON.stringify(placements, null, 2), 'utf-8');
  updateProject(id, {}, accountId);
  return placements;
}

export function getSealPlacements(id: string): SealPlacement[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(sealPlacementsFile(id), 'utf-8')) as SealPlacement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
