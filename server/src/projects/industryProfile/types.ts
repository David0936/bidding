export type TenderIndustry =
  | 'software_it'
  | 'power_energy'
  | 'construction_infrastructure'
  | 'municipal_transport'
  | 'water_conservancy'
  | 'security_weak_current'
  | 'medical_education'
  | 'environmental_sanitation'
  | 'property_logistics'
  | 'industrial_manufacturing'
  | 'chemical_hazardous'
  | 'mining'
  | 'government_consulting'
  | 'general_procurement'
  | 'other';

export type ProcurementObjectType =
  | 'engineering'
  | 'goods'
  | 'service'
  | 'software'
  | 'equipment'
  | 'epc'
  | 'operation'
  | 'consulting'
  | 'mixed'
  | 'other';

export type IndustryConfidence = 'high' | 'medium' | 'low';

export interface TenderIndustryProfile {
  industry: TenderIndustry;
  procurementType: ProcurementObjectType;
  confidence: IndustryConfidence;
  title: string;
  reasoning: string;
  keywords: string[];
  materialHints: string[];
  responseFocus: string[];
  riskFocus: string[];
  templateHints: string[];
  generatedAt: string;
}
