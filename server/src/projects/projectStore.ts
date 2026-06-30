// 文件式项目存储。每个项目一个目录：
//   data/projects/<id>/project.json   元数据
//   data/projects/<id>/tender-original.md 原始完整招标文件 Markdown
//   data/projects/<id>/tender.md     当前招标文件 Markdown 工作稿（可按标段聚焦）
//   data/projects/<id>/original-plan.md 已有方案 Markdown 工作稿
//   data/projects/<id>/original.<ext> 上传的原始文件
//   data/projects/<id>/seal-image.bin 电子印章图片
//   data/projects/<id>/seal-placements.json 电子印章坐标
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECTS_DIR, ensureDirs } from '../store/paths.js';
import type { BidSection, ElectronicSeal, Project, SealPlacement, TenderDoc } from './types.js';
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
function tenderMarkdownFile(id: string): string {
  return path.join(projectDir(id), 'tender.md');
}
function tenderOriginalMarkdownFile(id: string): string {
  return path.join(projectDir(id), 'tender-original.md');
}
function originalPlanTextFile(id: string): string {
  return path.join(projectDir(id), 'original-plan.txt');
}
function originalPlanMarkdownFile(id: string): string {
  return path.join(projectDir(id), 'original-plan.md');
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

function readFirstExisting(files: string[]): string | null {
  for (const file of files) {
    try {
      return fs.readFileSync(file, 'utf-8');
    } catch {
      // Try the next known storage path.
    }
  }
  return null;
}

function readMeta(id: string): Project | null {
  try {
    const raw = fs.readFileSync(metaFile(id), 'utf-8');
    const parsed = JSON.parse(raw) as Project;
    const bidSections = Array.isArray(parsed.bidSections) ? parsed.bidSections : [];
    const selectedSection =
      typeof parsed.selectedBidSectionId === 'string'
        ? bidSections.find((section) => section.id === parsed.selectedBidSectionId)
        : null;
    return {
      ...parsed,
      accountId: parsed.accountId ?? DEFAULT_PROJECT_ACCOUNT_ID,
      tender: parsed.tender
        ? {
            ...parsed.tender,
            markdownPath: parsed.tender.markdownPath ?? 'tender.md',
            originalMarkdownPath: parsed.tender.originalMarkdownPath ?? 'tender-original.md',
          }
        : null,
      bidSectionMode: parsed.bidSectionMode ?? (bidSections.length >= 2 ? 'multiple' : 'single'),
      bidSections,
      selectedBidSectionId: selectedSection?.id ?? null,
      selectedBidSectionTitle: selectedSection?.title ?? null,
      originalPlan: parsed.originalPlan
        ? {
            ...parsed.originalPlan,
            markdownPath: parsed.originalPlan.markdownPath ?? 'original-plan.md',
          }
        : null,
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
    bidSectionMode: 'single',
    bidSections: [],
    selectedBidSectionId: null,
    selectedBidSectionTitle: null,
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

function clearGeneratedFiles(id: string, options: { includeAnalysis?: boolean } = {}): void {
  const files = [outlineFile(id), globalFactsFile(id), consistencyAuditFile(id)];
  if (options.includeAnalysis) files.push(analysisFile(id));
  for (const file of files) {
    fs.rmSync(file, { force: true });
  }
}

function buildFocusedTenderMarkdown(original: string, section: BidSection): string {
  const lines = original.split(/\r?\n/);
  const startLine = Math.min(Math.max(section.startLine, 1), Math.max(lines.length, 1));
  const endLine = Math.min(Math.max(section.endLine, startLine), Math.max(lines.length, startLine));
  const excerpt = lines.slice(startLine - 1, endLine).join('\n').trim();
  return [
    '# 投标范围工作稿',
    '',
    `> 当前选择：${section.title}`,
    `> 原文行号：${startLine}-${endLine}`,
    '> 后续 AI 生成优先围绕该标段/分包；公共条款仍以原始全文为准。',
    '',
    '## 当前标段/分包原文',
    '',
    excerpt || section.title,
    '',
    '---',
    '',
    '# 原始招标文件全文（公共条款参考）',
    '',
    original.trim(),
    '',
  ].join('\n');
}

/** 保存招标文件解析结果（Markdown 另存为文件，元数据记录摘要） */
export function saveTender(id: string, tender: TenderDoc, text: string, originalBuffer?: Buffer, originalExt?: string): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(tenderOriginalMarkdownFile(id), text, 'utf-8');
  fs.writeFileSync(tenderMarkdownFile(id), text, 'utf-8');
  fs.rmSync(tenderTextFile(id), { force: true });
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
  return updateProject(id, {
    tender: {
      ...tender,
      markdownPath: 'tender.md',
      originalMarkdownPath: 'tender-original.md',
    },
    bidSectionMode: 'single',
    bidSections: [],
    selectedBidSectionId: null,
    selectedBidSectionTitle: null,
  });
}

export function getTenderText(id: string): string | null {
  return readFirstExisting([tenderMarkdownFile(id), tenderTextFile(id)]);
}

export function getTenderOriginalText(id: string): string | null {
  return readFirstExisting([tenderOriginalMarkdownFile(id), tenderMarkdownFile(id), tenderTextFile(id)]);
}

export function saveBidSections(id: string, sections: BidSection[], accountId?: string): Project | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  const normalized = sections
    .filter((section) => section.title.trim())
    .map((section, index) => ({
      ...section,
      id: section.id || `section-${index + 1}`,
      title: section.title.trim(),
      startLine: Math.max(1, Math.trunc(section.startLine)),
      endLine: Math.max(Math.trunc(section.endLine), Math.trunc(section.startLine)),
    }));
  const selectedSection = current.selectedBidSectionId
    ? normalized.find((section) => section.id === current.selectedBidSectionId)
    : null;
  return updateProject(
    id,
    {
      bidSectionMode: normalized.length >= 2 ? 'multiple' : 'single',
      bidSections: normalized,
      selectedBidSectionId: selectedSection?.id ?? null,
      selectedBidSectionTitle: selectedSection?.title ?? null,
    },
    accountId,
  );
}

export function selectBidSection(id: string, sectionId: string, accountId?: string): Project | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  const section = current.bidSections.find((item) => item.id === sectionId);
  if (!section) return null;
  const original = getTenderOriginalText(id);
  if (!original) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(tenderMarkdownFile(id), buildFocusedTenderMarkdown(original, section), 'utf-8');
  fs.rmSync(tenderTextFile(id), { force: true });
  clearGeneratedFiles(id, { includeAnalysis: true });
  return updateProject(
    id,
    {
      selectedBidSectionId: section.id,
      selectedBidSectionTitle: section.title,
    },
    accountId,
  );
}

export function resetBidSection(id: string, accountId?: string): Project | null {
  const current = getProject(id, accountId);
  if (!current) return null;
  const original = getTenderOriginalText(id);
  if (!original) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(tenderMarkdownFile(id), original, 'utf-8');
  fs.rmSync(tenderTextFile(id), { force: true });
  clearGeneratedFiles(id, { includeAnalysis: true });
  return updateProject(
    id,
    {
      selectedBidSectionId: null,
      selectedBidSectionTitle: null,
    },
    accountId,
  );
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
  fs.writeFileSync(originalPlanMarkdownFile(id), text, 'utf-8');
  fs.rmSync(originalPlanTextFile(id), { force: true });
  for (const entry of fs.readdirSync(projectDir(id))) {
    if (entry.startsWith('original-plan.')) {
      fs.rmSync(path.join(projectDir(id), entry), { force: true });
    }
  }
  if (originalBuffer && originalExt) {
    fs.writeFileSync(path.join(projectDir(id), `original-plan.${originalExt}`), originalBuffer);
  }
  clearGeneratedFiles(id);
  return updateProject(id, {
    originalPlan: {
      ...originalPlan,
      markdownPath: 'original-plan.md',
    },
  });
}

export function getOriginalPlanText(id: string): string | null {
  return readFirstExisting([originalPlanMarkdownFile(id), originalPlanTextFile(id)]);
}

export function deleteOriginalPlan(id: string): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  fs.rmSync(originalPlanTextFile(id), { force: true });
  fs.rmSync(originalPlanMarkdownFile(id), { force: true });
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
