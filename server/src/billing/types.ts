export type BillingAccountStatus = 'active' | 'suspended';

export type BillingTransactionType = 'trial' | 'recharge' | 'consume' | 'adjust' | 'refund';
export type PaymentOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired';
export type PaymentProvider = 'manual' | 'mock' | 'wechat' | 'alipay' | 'stripe' | 'bank_transfer';

export interface BillingAccount {
  id: string;
  ownerUserId?: string;
  ownerEmail?: string;
  name: string;
  planName: string;
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
  orders: PaymentOrder[];
  transactions: BillingTransaction[];
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

export interface BillingState {
  accounts: BillingAccount[];
  transactions: BillingTransaction[];
  orders: PaymentOrder[];
}
