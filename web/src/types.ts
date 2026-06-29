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
export type PaymentOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired';
export type PaymentProvider = 'manual' | 'mock' | 'wechat' | 'alipay' | 'stripe' | 'bank_transfer';

export interface BillingAccount {
  id: string;
  name: string;
  planName: string;
  status: 'active' | 'suspended';
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
}

export interface PaymentOrder {
  id: string;
  accountId: string;
  credits: number;
  amountCents: number;
  currency: string;
  provider: PaymentProvider;
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
    totalRechargedCredits: number;
    totalConsumedCredits: number;
    paidAmountCents: number;
  };
}

// ===== 标书项目 =====
export type TenderFileType = 'pdf' | 'docx' | 'txt' | 'md';

export interface TenderDoc {
  fileName: string;
  fileType: TenderFileType;
  charCount: number;
  uploadedAt: string;
  markdownPath?: string;
  originalMarkdownPath?: string;
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
}

export interface Outline {
  title: string;
  nodes: OutlineNode[];
  updatedAt: string;
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
