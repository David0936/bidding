export type ResponseItemCategory =
  | 'qualification'
  | 'business'
  | 'technical'
  | 'scoring'
  | 'rejection'
  | 'delivery'
  | 'service'
  | 'price'
  | 'other';

export type ResponseItemPriority = 'critical' | 'high' | 'medium' | 'low';

export type ResponseItemStatus = 'covered' | 'partial' | 'missing' | 'risk' | 'not_applicable';

export type ResponseOwnerRole = 'business' | 'technical' | 'finance' | 'project_manager' | 'product' | 'legal' | 'admin';

export interface ResponseMatrixItem {
  id: string;
  category: ResponseItemCategory;
  ownerRole: ResponseOwnerRole;
  priority: ResponseItemPriority;
  status: ResponseItemStatus;
  sourceClause?: string;
  requirement: string;
  responseStrategy: string;
  suggestedSection?: string;
  evidence?: string;
  gap?: string;
  score?: string;
  risk?: string;
}

export interface ResponseMatrix {
  summary: string;
  items: ResponseMatrixItem[];
  generatedAt: string;
}
