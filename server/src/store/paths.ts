// 统一管理本地数据目录。开发期默认放在 server/data 下；
// 桌面版会通过 EASY_BIDDING_DATA_DIR 指向用户数据目录，避免把运行期数据写进安装目录。
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/store -> server 根目录
export const SERVER_ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = process.env.EASY_BIDDING_DATA_DIR
  ? path.resolve(process.env.EASY_BIDDING_DATA_DIR)
  : path.join(SERVER_ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
export const BILLING_DIR = path.join(DATA_DIR, 'billing');
export const AUTH_DIR = path.join(DATA_DIR, 'auth');
export const CHECKS_DIR = path.join(DATA_DIR, 'checks');
export const CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');

export function ensureDirs(): void {
  for (const dir of [DATA_DIR, UPLOAD_DIR, PROJECTS_DIR, KNOWLEDGE_DIR, BILLING_DIR, AUTH_DIR, CHECKS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
