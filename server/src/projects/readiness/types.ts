export type BidReadinessLevel = 'ready' | 'attention' | 'blocked';
export type BidReadinessSeverity = 'blocker' | 'high' | 'medium' | 'low';

export type BidReadinessCategory =
  | 'workflow'
  | 'response'
  | 'materials'
  | 'content'
  | 'consistency'
  | 'seal'
  | 'export';

export interface BidReadinessIssue {
  id: string;
  category: BidReadinessCategory;
  severity: BidReadinessSeverity;
  title: string;
  detail: string;
  action: string;
  source?: string;
}

export interface BidReadinessMetrics {
  score: number;
  responseTotal: number;
  responseOpen: number;
  responseCriticalOpen: number;
  requiredMaterials: number;
  uploadedRequiredMaterials: number;
  contentSections: number;
  generatedContentSections: number;
  consistencyIssues: number;
  highConsistencyIssues: number;
  sealPlacements: number;
}

export interface BidReadinessReport {
  level: BidReadinessLevel;
  score: number;
  summary: string;
  metrics: BidReadinessMetrics;
  issues: BidReadinessIssue[];
  generatedAt: string;
}
