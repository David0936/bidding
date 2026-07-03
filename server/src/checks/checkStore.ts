import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CHECKS_DIR, ensureDirs } from '../store/paths.js';
import type { DuplicateCheckRecord, DuplicateCheckResult } from './types.js';

const DUPLICATE_RECORDS_FILE = path.join(CHECKS_DIR, 'duplicate-records.json');
const MAX_RECORDS_PER_ACCOUNT = 80;

function readRecords(): DuplicateCheckRecord[] {
  ensureDirs();
  if (!fs.existsSync(DUPLICATE_RECORDS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(DUPLICATE_RECORDS_FILE, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: DuplicateCheckRecord[]): void {
  ensureDirs();
  fs.writeFileSync(DUPLICATE_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

export function listDuplicateRecords(accountId: string): DuplicateCheckRecord[] {
  return readRecords()
    .filter((record) => record.accountId === accountId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveDuplicateRecord(
  accountId: string,
  input: {
    tenderFileName?: string;
    result: DuplicateCheckResult;
  },
): DuplicateCheckRecord {
  const records = readRecords();
  const accountRecords = records.filter((record) => record.accountId === accountId);
  const otherRecords = records.filter((record) => record.accountId !== accountId);
  const record: DuplicateCheckRecord = {
    id: randomUUID(),
    accountId,
    createdAt: new Date().toISOString(),
    tenderFileName: input.tenderFileName,
    bidFileNames: input.result.files.map((file) => file.name),
    fileCount: input.result.files.length,
    duplicateSentenceCount: input.result.duplicateSentenceCount,
    tenderExcludedSentenceCount: input.result.tenderExcludedSentenceCount,
    topGroups: input.result.groups.slice(0, 12),
  };

  writeRecords([record, ...accountRecords].slice(0, MAX_RECORDS_PER_ACCOUNT).concat(otherRecords));
  return record;
}
