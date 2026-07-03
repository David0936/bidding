export type BillingAccountStatus = 'active' | 'suspended';
export type BillingPlanCode = 'trial' | 'standard' | 'vip' | 'enterprise';
export type BillingFeatureCode = 'workspace' | 'export' | 'knowledge' | 'duplicateCheck' | 'rejectionCheck' | 'seal';
export type BillingFeatureFlags = Record<BillingFeatureCode, boolean>;

export type BillingTransactionType = 'trial' | 'recharge' | 'consume' | 'adjust' | 'refund';
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
  /** 当前是否已过套餐到期日 */
  planExpired: boolean;
  /** 距离套餐到期的天数；长期有效为 null，过期为负数 */
  daysUntilPlanExpires: number | null;
  /** 过期后会降级为试用版权益；接口校验以此为准 */
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
  orders: PaymentOrder[];
  transactions: BillingTransaction[];
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

export interface BillingState {
  accounts: BillingAccount[];
  transactions: BillingTransaction[];
  orders: PaymentOrder[];
}
