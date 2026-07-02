import type { ResponseItemPriority } from '../responseMatrix/types.js';

export type DeviationScope = 'business' | 'technical';
export type DeviationType = 'no_deviation' | 'positive' | 'negative' | 'pending' | 'not_applicable';

export interface DeviationTableItem {
  id: string;
  sourceResponseId?: string;
  scope: DeviationScope;
  deviationType: DeviationType;
  priority: ResponseItemPriority;
  sourceClause?: string;
  requirement: string;
  response: string;
  deviationDescription: string;
  handlingSuggestion: string;
  suggestedSection?: string;
  risk?: string;
}

export interface DeviationTable {
  summary: string;
  items: DeviationTableItem[];
  generatedAt: string;
  updatedAt: string;
}
