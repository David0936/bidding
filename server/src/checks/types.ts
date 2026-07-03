export interface DuplicateFileSummary {
  id: string;
  name: string;
  charCount: number;
  sentenceCount: number;
}

export interface DuplicateSentenceGroup {
  sentence: string;
  files: string[];
  fileNames: string[];
  count: number;
}

export interface DuplicateCheckResult {
  files: DuplicateFileSummary[];
  groups: DuplicateSentenceGroup[];
  tenderExcludedSentenceCount: number;
  duplicateSentenceCount: number;
}

export interface DuplicateCheckRecord {
  id: string;
  accountId: string;
  createdAt: string;
  tenderFileName?: string;
  bidFileNames: string[];
  fileCount: number;
  duplicateSentenceCount: number;
  tenderExcludedSentenceCount: number;
  topGroups: DuplicateSentenceGroup[];
}
