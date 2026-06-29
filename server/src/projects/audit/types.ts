export interface ConsistencyIssue {
  id: string;
  nodeId: string;
  path: string[];
  factId?: string;
  factTitle?: string;
  severity: 'high' | 'medium' | 'low';
  problem: string;
  quote?: string;
  suggestion: string;
}

export interface ConsistencyAudit {
  issues: ConsistencyIssue[];
  checkedAt: string;
  summary: string;
}
