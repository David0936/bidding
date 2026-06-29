// 统一管理本地数据目录。所有运行期产物（配置、上传、生成结果）都放在 server/data 下。
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/store -> server 根目录
export const SERVER_ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = path.join(SERVER_ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');

export function ensureDirs(): void {
  for (const dir of [DATA_DIR, UPLOAD_DIR, PROJECTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
