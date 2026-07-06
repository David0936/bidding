// 前端使用的类型（与后端 /api/settings 对齐）

export type ProviderType = 'openai' | 'claude';

export interface ProviderProfile {
  baseUrl: string;
  apiKey: string; // 读取时后端会脱敏为空字符串
  model: string;
}

export interface AIConfig {
  provider: ProviderType;
  openai: ProviderProfile;
  claude: ProviderProfile;
  temperature: number;
  maxTokens: number;
}

/** GET /api/settings 返回：附带 Key 是否已设置的标记 */
export interface RedactedAIConfig extends AIConfig {
  openaiKeySet: boolean;
  claudeKeySet: boolean;
}

export interface TestResult {
  ok: boolean;
  provider?: ProviderType;
  model?: string;
  reply?: string;
  message?: string;
  status?: number;
}

// ===== 桌面应用桥接 =====
export type DesktopPlatform = 'darwin' | 'win32' | 'linux' | string;

export interface DesktopUpdateResult {
  ok: boolean;
  message?: string;
  updateInfo?: {
    version?: string;
    releaseName?: string;
    releaseDate?: string;
  } | null;
}

export interface EasyBiddingDesktopBridge {
  platform: DesktopPlatform;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<DesktopUpdateResult>;
}

declare global {
  interface Window {
    easyBiddingDesktop?: EasyBiddingDesktopBridge;
  }
}

// ===== 客户账号 =====
export interface AuthProfile {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: AuthProfile;
}

export interface AuthMeResult {
  authenticated: boolean;
  user: AuthProfile | null;
}

export interface AdminLoginResult {
  token: string;
  expiresInSeconds: number;
}

export interface AdminMeResult {
  authenticated: boolean;
  role: 'admin' | null;
}

// ===== 额度 / 订阅计费 =====
export type BillingTransactionType = 'trial' | 'recharge' | 'consume' | 'adjust' | 'refund';
export type BillingAccountStatus = 'active' | 'suspended';
export type BillingPlanCode = 'trial' | 'standard' | 'vip' | 'enterprise';
export type BillingFeatureCode = 'workspace' | 'export' | 'knowledge' | 'duplicateCheck' | 'rejectionCheck' | 'seal';
export type BillingFeatureFlags = Record<BillingFeatureCode, boolean>;
export type PaymentOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired';
export type PaymentProvider = 'manual' | 'mock' | 'wechat' | 'alipay' | 'stripe' | 'bank_transfer';

export interface BillingAccount {
  id: string;
  ownerUserId?: string;
  ownerEmail?: string;
  name: string;
  planCode: BillingPlanCode;
  planName: string;
  planExpiresAt?: string;
  projectLimit: number;
  featureFlags: BillingFeatureFlags;
  planExpired: boolean;
  daysUntilPlanExpires: number | null;
  effectiveFeatureFlags: BillingFeatureFlags;
  status: BillingAccountStatus;
  adminNote?: string;
  balanceCredits: number;
  totalRechargedCredits: number;
  totalConsumedCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
}

export interface BillingTransaction {
  id: string;
  accountId: string;
  type: BillingTransactionType;
  credits: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
  feature?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  referenceId?: string;
}

export interface PricingPolicy {
  creditsPerThousandTokens: number;
  minimumChargeCredits: number;
  trialCredits: number;
  centsPerCredit: number;
  currency: string;
  wordUnitPerCredit: number;
  packages: PricingPackage[];
}

export type PricingPackageAudience = 'personal' | 'enterprise';

export interface PricingPackage {
  code: string;
  name: string;
  audience: PricingPackageAudience;
  subtitle: string;
  wordQuota: number;
  credits: number;
  amountCents: number;
  originalAmountCents?: number;
  discountLabel?: string;
  highlight?: boolean;
}

export interface PaymentOrder {
  id: string;
  accountId: string;
  credits: number;
  amountCents: number;
  currency: string;
  provider: PaymentProvider;
  packageCode?: string;
  packageName?: string;
  wordQuota?: number;
  status: PaymentOrderStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  paidAt?: string;
  cancelledAt?: string;
  providerTradeNo?: string;
  rechargeTransactionId?: string;
}

export interface BillingOverview {
  account: BillingAccount;
  transactions: BillingTransaction[];
  orders: PaymentOrder[];
  pricing: PricingPolicy;
}

export interface AdminBillingOverview {
  accounts: BillingAccount[];
  transactions: BillingTransaction[];
  orders: PaymentOrder[];
  pricing: PricingPolicy;
  totals: {
    accountCount: number;
    activeAccountCount: number;
    pendingOrderCount: number;
    paidOrderCount: number;
    expiringSoonAccountCount: number;
    expiredPlanAccountCount: number;
    totalRechargedCredits: number;
    totalConsumedCredits: number;
    paidAmountCents: number;
  };
}

// ===== 代理人 / 推广 =====
export type AgentType = 'personal' | 'enterprise';
export type AgentStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type AgentReferralStatus = 'lead' | 'pending_settlement' | 'settled';

export interface AgentProgramTier {
  type: AgentType;
  name: string;
  commissionRate: number;
  customerRebateRate: number;
  requirements: string[];
  benefits: string[];
}

export interface AgentApplication {
  id: string;
  accountId: string;
  type: AgentType;
  applicantName: string;
  phone: string;
  companyName?: string;
  city?: string;
  industry?: string;
  channel?: string;
  note?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfile {
  accountId: string;
  type: AgentType;
  status: AgentStatus;
  inviteCode: string;
  commissionRate: number;
  customerRebateRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentReferral {
  id: string;
  agentAccountId: string;
  inviteCode: string;
  customerName: string;
  customerEmail?: string;
  rechargeCents: number;
  commissionCents: number;
  status: AgentReferralStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
}

export interface AgentOverview {
  program: AgentProgramTier[];
  application: AgentApplication | null;
  profile: AgentProfile | null;
  referrals: AgentReferral[];
  summary: {
    invitedCustomerCount: number;
    totalRechargeCents: number;
    pendingCommissionCents: number;
    settledCommissionCents: number;
  };
}

export interface AgentAdminOverview {
  program: AgentProgramTier[];
  applications: AgentApplication[];
  profiles: AgentProfile[];
  referrals: AgentReferral[];
  summary: AgentOverview['summary'] & {
    agentCount: number;
    applicationCount: number;
  };
}

// ===== 标书项目 =====
export type TenderFileType = 'pdf' | 'docx' | 'txt' | 'md';
/** 客户补充资料支持的文件类型：文档 + 证照图片 + 表格 */
export type MaterialFileType = TenderFileType | 'png' | 'jpg' | 'xlsx' | 'csv';
/** 分册类型：技术标 / 商务标 / 价格标 / 其他 */
export type BidVolume = 'technical' | 'business' | 'price' | 'other';
export type BidSectionMode = 'single' | 'multiple';

export interface TenderDoc {
  fileName: string;
  fileType: TenderFileType;
  charCount: number;
  uploadedAt: string;
  markdownPath?: string;
  originalMarkdownPath?: string;
}

export interface BidSection {
  id: string;
  title: string;
  code?: string;
  startLine: number;
  endLine: number;
  summary?: string;
}

export interface ElectronicSeal {
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface SealPlacement {
  id: string;
  page: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  opacity: number;
  rotation: number;
}

export interface Project {
  id: string;
  accountId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tender: TenderDoc | null;
  bidSectionMode: BidSectionMode;
  bidSections: BidSection[];
  selectedBidSectionId: string | null;
  selectedBidSectionTitle: string | null;
  originalPlan: TenderDoc | null;
  seal: ElectronicSeal | null;
}

export interface UploadResult {
  project: Project;
  charCount: number;
  preview: string;
}

export interface SealState {
  project?: Project;
  seal: ElectronicSeal | null;
  placements: SealPlacement[];
}

// ===== 目录（大纲） =====
export interface OutlineNode {
  id: string;
  title: string;
  children: OutlineNode[];
  content?: string;
  estimatedWords?: number;
  /** 分册归属；未标记时按标题关键词自动判定 */
  volume?: BidVolume;
}

export interface Outline {
  title: string;
  nodes: OutlineNode[];
  updatedAt: string;
}

export interface OutlineVariant {
  id: string;
  name: string;
  summary: string;
  outline: Outline;
}

export interface OutlineVariantsResult {
  variants: OutlineVariant[];
  generatedAt: string;
}

// ===== 招标文件关键项解析 =====
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

// ===== 招标书行业/采购类型画像 =====
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

// ===== 全局事实 =====
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

// ===== 点对点响应矩阵 =====
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

// ===== 商务/技术偏离表 =====
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

// ===== 客户资料补齐清单 =====
export type MaterialItemCategory =
  | 'qualification'
  | 'business'
  | 'technical'
  | 'financial'
  | 'legal'
  | 'personnel'
  | 'performance'
  | 'price'
  | 'seal'
  | 'other';

export type MaterialOwnerRole = 'business' | 'technical' | 'finance' | 'project_manager' | 'product' | 'legal' | 'admin';
export type MaterialItemStatus = 'pending' | 'uploaded' | 'needs_review' | 'not_required';

export interface ProjectMaterialFile {
  id: string;
  fileName: string;
  fileType: MaterialFileType;
  charCount: number;
  uploadedAt: string;
}

export interface ProjectMaterialItem {
  id: string;
  category: MaterialItemCategory;
  ownerRole: MaterialOwnerRole;
  required: boolean;
  status: MaterialItemStatus;
  title: string;
  description: string;
  purpose: string;
  sourceClause?: string;
  suggestedSection?: string;
  acceptedFileTypes: MaterialFileType[];
  uploadTips?: string;
  files: ProjectMaterialFile[];
}

export interface ProjectMaterialChecklist {
  summary: string;
  items: ProjectMaterialItem[];
  generatedAt: string;
  updatedAt: string;
}

// ===== 全文一致性审计 =====
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

// ===== 提交前总检 =====
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

// ===== 标书查重 =====
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
  record?: DuplicateCheckRecord;
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

// ===== 废标项检查 =====
export interface RejectionCheckIssue {
  title: string;
  type: 'invalid_bid' | 'rejection' | 'typo' | 'logic' | 'risk';
  severity: 'high' | 'medium' | 'low';
  requirement: string;
  evidence?: string;
  suggestion: string;
}

export interface RejectionCheckResult {
  tenderFileName: string;
  bidFileName: string;
  summary: string;
  issues: RejectionCheckIssue[];
}

// ===== 知识库 =====
export interface KnowledgeFolder {
  id: string;
  accountId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  accountId: string;
  folderId: string;
  fileName: string;
  fileType: TenderFileType;
  charCount: number;
  markdownPath?: string;
  createdAt: string;
  updatedAt: string;
  analyzedAt?: string;
}

export interface KnowledgeItem {
  id: string;
  accountId: string;
  folderId: string;
  documentId: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeOverview {
  folders: KnowledgeFolder[];
  documents: KnowledgeDocument[];
  items: KnowledgeItem[];
}

export interface KnowledgeUploadResult {
  document: KnowledgeDocument;
  preview: string;
}
