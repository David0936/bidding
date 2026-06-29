// 文件式项目存储。每个项目一个目录：
//   data/projects/<id>/project.json   元数据
//   data/projects/<id>/tender.txt     招标文件解析出的纯文本
//   data/projects/<id>/original.<ext> 上传的原始文件
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECTS_DIR, ensureDirs } from '../store/paths.js';
import type { Project, TenderDoc } from './types.js';
import type { Outline } from './outline/types.js';

function projectDir(id: string): string {
  return path.join(PROJECTS_DIR, id);
}
function metaFile(id: string): string {
  return path.join(projectDir(id), 'project.json');
}
function tenderTextFile(id: string): string {
  return path.join(projectDir(id), 'tender.txt');
}
function outlineFile(id: string): string {
  return path.join(projectDir(id), 'outline.json');
}

function nowIso(): string {
  return new Date().toISOString();
}

function readMeta(id: string): Project | null {
  try {
    const raw = fs.readFileSync(metaFile(id), 'utf-8');
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

function writeMeta(project: Project): void {
  ensureDirs();
  fs.mkdirSync(projectDir(project.id), { recursive: true });
  fs.writeFileSync(metaFile(project.id), JSON.stringify(project, null, 2), 'utf-8');
}

export function createProject(name?: string): Project {
  const id = randomUUID();
  const ts = nowIso();
  const project: Project = {
    id,
    name: name?.trim() || '未命名标书',
    createdAt: ts,
    updatedAt: ts,
    tender: null,
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

export function getProject(id: string): Project | null {
  return readMeta(id);
}

export function updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  const updated: Project = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  };
  writeMeta(updated);
  return updated;
}

export function deleteProject(id: string): boolean {
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/** 保存招标文件解析结果（文本另存为文件，元数据记录摘要） */
export function saveTender(id: string, tender: TenderDoc, text: string, originalBuffer?: Buffer, originalExt?: string): Project | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(tenderTextFile(id), text, 'utf-8');
  if (originalBuffer && originalExt) {
    fs.writeFileSync(path.join(projectDir(id), `original.${originalExt}`), originalBuffer);
  }
  return updateProject(id, { tender });
}

export function getTenderText(id: string): string | null {
  try {
    return fs.readFileSync(tenderTextFile(id), 'utf-8');
  } catch {
    return null;
  }
}

/** 保存目录（同时更新项目 updatedAt） */
export function saveOutline(id: string, outline: Outline): Outline | null {
  const current = readMeta(id);
  if (!current) return null;
  ensureDirs();
  fs.mkdirSync(projectDir(id), { recursive: true });
  fs.writeFileSync(outlineFile(id), JSON.stringify(outline, null, 2), 'utf-8');
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
