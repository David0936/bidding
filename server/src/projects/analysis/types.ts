export interface TenderRequirement {
  title: string;
  detail: string;
  source?: string;
  score?: string;
  category?: string;
}

export interface RejectionRequirement {
  kind: 'invalid_bid' | 'rejection' | 'potential_risk';
  title: string;
  detail: string;
  source?: string;
}

export interface TenderAnalysis {
  summary: string;
  projectInfo: Record<string, string>;
  buyerInfo: Record<string, string>;
  deliveryAndServiceRequirements: Record<string, string>;
  keyRequirements: TenderRequirement[];
  rejectionRequirements: RejectionRequirement[];
  updatedAt: string;
}

export interface GlobalFact {
  id: string;
  category: string;
  title: string;
  value: string;
  source?: string;
  notes?: string;
}

export interface GlobalFacts {
  items: GlobalFact[];
  updatedAt: string;
}
