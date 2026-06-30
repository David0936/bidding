import fs from 'node:fs';
import path from 'node:path';
import { BILLING_DIR, ensureDirs } from '../store/paths.js';
import { DEFAULT_ACCOUNT_ID } from './requestContext.js';
import type {
  BillingAccount,
  AdminBillingOverview,
  BillingOverview,
  BillingState,
  BillingTransaction,
  PaymentOrder,
  PaymentProvider,
  PricingPolicy,
  TokenUsage,
  BillingAccountStatus,
  BillingFeatureCode,
  BillingFeatureFlags,
  BillingPlanCode,
} from './types.js';

const BILLING_FILE = path.join(BILLING_DIR, 'ledger.json');
const FEATURE_CODES: BillingFeatureCode[] = ['workspace', 'export', 'knowledge', 'duplicateCheck', 'rejectionCheck', 'seal'];

const PLAN_PRESETS: Record<
  BillingPlanCode,
  { name: string; projectLimit: number; featureFlags: BillingFeatureFlags }
> = {
  trial: {
    name: '试用版',
    projectLimit: 2,
    featureFlags: {
      workspace: true,
      export: false,
      knowledge: false,
      duplicateCheck: false,
      rejectionCheck: false,
      seal: false,
    },
  },
  standard: {
    name: '基础版',
    projectLimit: 20,
    featureFlags: {
      workspace: true,
      export: true,
      knowledge: false,
      duplicateCheck: false,
      rejectionCheck: false,
      seal: false,
    },
  },
  vip: {
    name: 'VIP 专业版',
    projectLimit: 100,
    featureFlags: {
      workspace: true,
      export: true,
      knowledge: true,
      duplicateCheck: true,
      rejectionCheck: true,
      seal: true,
    },
  },
  enterprise: {
    name: '企业版',
    projectLimit: 1000,
    featureFlags: {
      workspace: true,
      export: true,
      knowledge: true,
      duplicateCheck: true,
      rejectionCheck: true,
      seal: true,
    },
  },
};

export class BillingError extends Error {
  status: number;

  constructor(message: string, status = 402) {
    super(message);
    this.name = 'BillingError';
    this.status = status;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function roundCredits(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getPricingPolicy(): PricingPolicy {
  return {
    creditsPerThousandTokens: parseNumberEnv('EASY_BIDDING_CREDITS_PER_1K_TOKENS', 1),
    minimumChargeCredits: parseNumberEnv('EASY_BIDDING_MIN_AI_CHARGE_CREDITS', 0.1),
    trialCredits: parseNumberEnv('EASY_BIDDING_TRIAL_CREDITS', 200),
    centsPerCredit: parseNumberEnv('EASY_BIDDING_CENTS_PER_CREDIT', 100),
    currency: process.env.EASY_BIDDING_PAYMENT_CURRENCY || 'CNY',
  };
}

function blankState(): BillingState {
  return { accounts: [], transactions: [], orders: [] };
}

function normalizePlanCode(value: unknown, fallback: BillingPlanCode): BillingPlanCode {
  const code = String(value ?? '').trim();
  return ['trial', 'standard', 'vip', 'enterprise'].includes(code) ? (code as BillingPlanCode) : fallback;
}

function normalizeFeatureFlags(value: unknown, fallback: BillingFeatureFlags): BillingFeatureFlags {
  const incoming = value && typeof value === 'object' ? (value as Partial<Record<BillingFeatureCode, unknown>>) : {};
  return FEATURE_CODES.reduce((acc, code) => {
    acc[code] = typeof incoming[code] === 'boolean' ? incoming[code] : fallback[code];
    return acc;
  }, {} as BillingFeatureFlags);
}

function normalizeAccount(account: BillingAccount): BillingAccount {
  const legacyPlan = account.planName === '按量充值' ? 'standard' : 'trial';
  const planCode = normalizePlanCode(account.planCode, legacyPlan);
  const preset = PLAN_PRESETS[planCode];
  return {
    ...account,
    ownerEmail: account.ownerEmail ?? undefined,
    ownerUserId: account.ownerUserId ?? undefined,
    planCode,
    planName: account.planName && account.planName !== '按量充值' ? account.planName : preset.name,
    planExpiresAt: account.planExpiresAt ?? undefined,
    projectLimit:
      Number.isFinite(Number(account.projectLimit)) && Number(account.projectLimit) >= 0
        ? Number(account.projectLimit)
        : preset.projectLimit,
    featureFlags: normalizeFeatureFlags(account.featureFlags, preset.featureFlags),
    adminNote: account.adminNote ?? undefined,
    status: account.status ?? 'active',
  };
}

function readState(): BillingState {
  ensureDirs();
  if (!fs.existsSync(BILLING_FILE)) return blankState();
  try {
    const parsed = JSON.parse(fs.readFileSync(BILLING_FILE, 'utf8')) as Partial<BillingState>;
    return {
      accounts: Array.isArray(parsed.accounts)
        ? parsed.accounts.map((account) => normalizeAccount(account as BillingAccount))
        : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch {
    return blankState();
  }
}

function writeState(state: BillingState): void {
  ensureDirs();
  fs.writeFileSync(BILLING_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function transactionId(): string {
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function orderId(): string {
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function expirePendingOrders(state: BillingState): void {
  const now = Date.now();
  let changed = false;
  state.orders = state.orders.map((order) => {
    if (order.status !== 'pending') return order;
    if (new Date(order.expiresAt).getTime() > now) return order;
    changed = true;
    return { ...order, status: 'expired', updatedAt: nowIso() };
  });
  if (changed) writeState(state);
}

interface AccountIdentityInput {
  name?: string;
  ownerEmail?: string;
  ownerUserId?: string;
}

function normalizeIdentity(input?: string | AccountIdentityInput): AccountIdentityInput {
  if (!input) return {};
  if (typeof input === 'string') return { name: input };
  return input;
}

function createAccount(accountId: string, state: BillingState, input?: string | AccountIdentityInput): BillingAccount {
  const timestamp = nowIso();
  const pricing = getPricingPolicy();
  const trialCredits = roundCredits(pricing.trialCredits);
  const identity = normalizeIdentity(input);
  const preset = PLAN_PRESETS.trial;
  const account: BillingAccount = {
    id: accountId,
    ownerEmail: identity.ownerEmail?.trim().toLowerCase() || undefined,
    ownerUserId: identity.ownerUserId?.trim() || undefined,
    name: identity.name?.trim() || (accountId === DEFAULT_ACCOUNT_ID ? '默认客户账户' : accountId),
    planCode: 'trial',
    planName: preset.name,
    planExpiresAt: undefined,
    projectLimit: preset.projectLimit,
    featureFlags: { ...preset.featureFlags },
    status: 'active',
    adminNote: undefined,
    balanceCredits: trialCredits,
    totalRechargedCredits: trialCredits,
    totalConsumedCredits: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  state.accounts.push(account);
  if (trialCredits > 0) {
    state.transactions.unshift({
      id: transactionId(),
      accountId,
      type: 'trial',
      credits: trialCredits,
      balanceAfter: trialCredits,
      description: '系统初始化试用额度',
      createdAt: timestamp,
      referenceId: 'trial',
    });
  }
  return account;
}

function getOrCreateAccount(
  accountId: string,
  state: BillingState,
  input?: string | AccountIdentityInput,
): BillingAccount {
  const existing = state.accounts.find((item) => item.id === accountId);
  const identity = normalizeIdentity(input);
  if (existing) {
    let changed = false;
    if (identity.name?.trim() && (!existing.name || existing.name === existing.id)) {
      existing.name = identity.name.trim();
      changed = true;
    }
    if (identity.ownerEmail?.trim() && existing.ownerEmail !== identity.ownerEmail.trim().toLowerCase()) {
      existing.ownerEmail = identity.ownerEmail.trim().toLowerCase();
      changed = true;
    }
    if (identity.ownerUserId?.trim() && existing.ownerUserId !== identity.ownerUserId.trim()) {
      existing.ownerUserId = identity.ownerUserId.trim();
      changed = true;
    }
    if (!existing.status) existing.status = 'active';
    if (changed) existing.updatedAt = nowIso();
    return existing;
  }
  return createAccount(accountId, state, identity);
}

export function ensureBillingAccount(accountId: string, identity?: string | AccountIdentityInput): BillingAccount {
  const state = readState();
  const account = getOrCreateAccount(accountId, state, identity);
  writeState(state);
  return account;
}

export function getBillingOverview(accountId = DEFAULT_ACCOUNT_ID): BillingOverview {
  const state = readState();
  const account = getOrCreateAccount(accountId, state);
  expirePendingOrders(state);
  writeState(state);
  return {
    account,
    transactions: state.transactions.filter((item) => item.accountId === accountId).slice(0, 100),
    orders: state.orders.filter((item) => item.accountId === accountId).slice(0, 50),
    pricing: getPricingPolicy(),
  };
}

export function getAdminBillingOverview(): AdminBillingOverview {
  const state = readState();
  expirePendingOrders(state);
  writeState(state);
  const paidOrders = state.orders.filter((order) => order.status === 'paid');
  return {
    accounts: [...state.accounts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    orders: [...state.orders].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    transactions: [...state.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    pricing: getPricingPolicy(),
    totals: {
      accountCount: state.accounts.length,
      activeAccountCount: state.accounts.filter((account) => account.status === 'active').length,
      pendingOrderCount: state.orders.filter((order) => order.status === 'pending').length,
      paidOrderCount: paidOrders.length,
      totalRechargedCredits: roundCredits(
        state.accounts.reduce((sum, account) => sum + account.totalRechargedCredits, 0),
      ),
      totalConsumedCredits: roundCredits(
        state.accounts.reduce((sum, account) => sum + account.totalConsumedCredits, 0),
      ),
      paidAmountCents: paidOrders.reduce((sum, order) => sum + order.amountCents, 0),
    },
  };
}

export function updateAdminBillingAccount(
  accountId: string,
  input: {
    status?: BillingAccountStatus;
    adminNote?: string;
    name?: string;
    planCode?: BillingPlanCode;
    planName?: string;
    planExpiresAt?: string | null;
    projectLimit?: number;
    featureFlags?: Partial<BillingFeatureFlags>;
  },
): AdminBillingOverview {
  const state = readState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new BillingError('客户账户不存在。', 404);

  const status = input.status;
  if (status && !['active', 'suspended'].includes(status)) {
    throw new BillingError('账户状态不正确。', 400);
  }
  if (status) account.status = status;
  if (typeof input.adminNote === 'string') {
    account.adminNote = input.adminNote.trim().slice(0, 500) || undefined;
  }
  if (typeof input.name === 'string' && input.name.trim()) {
    account.name = input.name.trim().slice(0, 80);
  }
  if (input.planCode) {
    const planCode = normalizePlanCode(input.planCode, account.planCode);
    const preset = PLAN_PRESETS[planCode];
    account.planCode = planCode;
    account.planName = preset.name;
    account.projectLimit = preset.projectLimit;
    account.featureFlags = { ...preset.featureFlags };
  }
  if (typeof input.planName === 'string' && input.planName.trim()) {
    account.planName = input.planName.trim().slice(0, 80);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'planExpiresAt')) {
    const raw = input.planExpiresAt;
    account.planExpiresAt = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }
  if (typeof input.projectLimit === 'number') {
    if (!Number.isFinite(input.projectLimit) || input.projectLimit < 0) {
      throw new BillingError('项目数上限必须大于等于 0。', 400);
    }
    account.projectLimit = Math.trunc(input.projectLimit);
  }
  if (input.featureFlags && typeof input.featureFlags === 'object') {
    account.featureFlags = normalizeFeatureFlags(input.featureFlags, account.featureFlags);
  }
  account.updatedAt = nowIso();
  writeState(state);
  return getAdminBillingOverview();
}

function isExpired(account: BillingAccount): boolean {
  if (!account.planExpiresAt) return false;
  const expiresAt = new Date(account.planExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

function effectiveFeatureFlags(account: BillingAccount): BillingFeatureFlags {
  if (!isExpired(account)) return account.featureFlags;
  return { ...PLAN_PRESETS.trial.featureFlags };
}

function assertActiveAccount(account: BillingAccount): void {
  if (account.status !== 'active') {
    throw new BillingError('账户已暂停，请联系管理员恢复后再使用。', 403);
  }
}

export function assertFeatureAccess(accountId: string, feature: BillingFeatureCode): void {
  if (process.env.EASY_BIDDING_BILLING_ENABLED === 'false') return;
  const state = readState();
  const account = getOrCreateAccount(accountId, state);
  writeState(state);
  assertActiveAccount(account);
  if (!effectiveFeatureFlags(account)[feature]) {
    throw new BillingError('当前套餐未开通该功能，请联系管理员升级 VIP。', 403);
  }
}

export function assertProjectCreationAllowed(accountId: string, existingProjectCount: number): void {
  if (process.env.EASY_BIDDING_BILLING_ENABLED === 'false') return;
  const state = readState();
  const account = getOrCreateAccount(accountId, state);
  writeState(state);
  assertActiveAccount(account);
  if (!effectiveFeatureFlags(account).workspace) {
    throw new BillingError('当前套餐未开通标书工作台，请联系管理员处理。', 403);
  }
  if (account.projectLimit > 0 && existingProjectCount >= account.projectLimit) {
    throw new BillingError(
      `当前套餐最多可创建 ${account.projectLimit} 个项目，请联系管理员升级 VIP 或清理旧项目。`,
      403,
    );
  }
}

function featureForAiUsage(feature?: string): BillingFeatureCode {
  if (feature === 'knowledge.analyzeDocument') return 'knowledge';
  if (feature === 'checks.rejection') return 'rejectionCheck';
  return 'workspace';
}

interface RechargeInput {
  credits: number;
  description?: string;
  referenceId?: string;
}

export function recordRecharge(accountId: string, input: RechargeInput): BillingOverview {
  const credits = roundCredits(Number(input.credits));
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new BillingError('充值额度必须大于 0。', 400);
  }

  const state = readState();
  applyRecharge(state, accountId, {
    credits,
    description: input.description?.trim() || '人工充值额度',
    referenceId: input.referenceId,
  });
  writeState(state);
  return getBillingOverview(accountId);
}

function applyRecharge(
  state: BillingState,
  accountId: string,
  input: { credits: number; description: string; referenceId?: string },
): BillingTransaction {
  const account = getOrCreateAccount(accountId, state);
  const credits = roundCredits(input.credits);
  account.balanceCredits = roundCredits(account.balanceCredits + credits);
  account.totalRechargedCredits = roundCredits(account.totalRechargedCredits + credits);
  account.updatedAt = nowIso();

  const transaction: BillingTransaction = {
    id: transactionId(),
    accountId,
    type: 'recharge',
    credits,
    balanceAfter: account.balanceCredits,
    description: input.description,
    createdAt: account.updatedAt,
    referenceId: input.referenceId,
  };
  state.transactions.unshift(transaction);
  return transaction;
}

interface CreateOrderInput {
  credits: number;
  provider?: PaymentProvider;
  description?: string;
}

export function createRechargeOrder(accountId: string, input: CreateOrderInput): BillingOverview {
  const credits = roundCredits(Number(input.credits));
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new BillingError('充值额度必须大于 0。', 400);
  }

  const state = readState();
  getOrCreateAccount(accountId, state);
  expirePendingOrders(state);
  const pricing = getPricingPolicy();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const order: PaymentOrder = {
    id: orderId(),
    accountId,
    credits,
    amountCents: Math.round(credits * pricing.centsPerCredit),
    currency: pricing.currency,
    provider: input.provider ?? 'manual',
    status: 'pending',
    description: input.description?.trim() || `充值 ${credits.toFixed(2)} 点额度`,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt,
  };

  state.orders.unshift(order);
  writeState(state);
  return getBillingOverview(accountId);
}

export function cancelRechargeOrder(accountId: string, orderIdValue: string): BillingOverview {
  const state = readState();
  expirePendingOrders(state);
  const order = state.orders.find((item) => item.id === orderIdValue && item.accountId === accountId);
  if (!order) throw new BillingError('充值订单不存在。', 404);
  if (order.status !== 'pending') throw new BillingError('当前订单状态不可取消。', 400);
  const timestamp = nowIso();
  order.status = 'cancelled';
  order.cancelledAt = timestamp;
  order.updatedAt = timestamp;
  writeState(state);
  return getBillingOverview(accountId);
}

export function confirmRechargeOrder(
  accountId: string,
  orderIdValue: string,
  input: { providerTradeNo?: string; description?: string } = {},
): BillingOverview {
  const state = readState();
  expirePendingOrders(state);
  const order = state.orders.find((item) => item.id === orderIdValue && item.accountId === accountId);
  if (!order) throw new BillingError('充值订单不存在。', 404);
  if (order.status === 'paid') return getBillingOverview(accountId);
  if (order.status !== 'pending') throw new BillingError('当前订单状态不可确认支付。', 400);
  if (new Date(order.expiresAt).getTime() <= Date.now()) {
    order.status = 'expired';
    order.updatedAt = nowIso();
    writeState(state);
    throw new BillingError('充值订单已过期，请重新创建订单。', 400);
  }

  const timestamp = nowIso();
  const transaction = applyRecharge(state, accountId, {
    credits: order.credits,
    description: input.description?.trim() || `充值订单 ${order.id} 支付入账`,
    referenceId: order.id,
  });
  order.status = 'paid';
  order.paidAt = timestamp;
  order.updatedAt = timestamp;
  order.providerTradeNo = input.providerTradeNo?.trim() || order.providerTradeNo;
  order.rechargeTransactionId = transaction.id;
  writeState(state);
  return getBillingOverview(accountId);
}

export function confirmRechargeOrderById(
  orderIdValue: string,
  input: {
    providerTradeNo?: string;
    description?: string;
    amountCents?: number;
    currency?: string;
  } = {},
): BillingOverview {
  const state = readState();
  expirePendingOrders(state);
  const order = state.orders.find((item) => item.id === orderIdValue);
  if (!order) throw new BillingError('充值订单不存在。', 404);
  if (typeof input.amountCents === 'number' && input.amountCents !== order.amountCents) {
    throw new BillingError('支付回调金额与订单金额不一致。', 400);
  }
  if (input.currency && input.currency !== order.currency) {
    throw new BillingError('支付回调币种与订单币种不一致。', 400);
  }
  return confirmRechargeOrder(order.accountId, order.id, {
    providerTradeNo: input.providerTradeNo,
    description: input.description,
  });
}

interface ConsumptionInput {
  credits: number;
  description: string;
  feature?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  referenceId?: string;
}

export function ensureSufficientCredits(accountId: string, requiredCredits: number, feature?: string): void {
  if (process.env.EASY_BIDDING_BILLING_ENABLED === 'false') return;

  const required = roundCredits(requiredCredits);
  const state = readState();
  const account = getOrCreateAccount(accountId, state);
  writeState(state);

  assertActiveAccount(account);
  const billingFeature = featureForAiUsage(feature);
  if (!effectiveFeatureFlags(account)[billingFeature]) {
    throw new BillingError('当前套餐未开通该功能，请联系管理员升级 VIP。', 403);
  }
  if (account.balanceCredits < required) {
    throw new BillingError(
      `额度不足：当前余额 ${account.balanceCredits.toFixed(2)}，本次预计需要 ${required.toFixed(2)}。请先充值后再继续。`,
    );
  }
  if (feature && required > 0) {
    return;
  }
}

export function recordConsumption(accountId: string, input: ConsumptionInput): BillingTransaction | null {
  if (process.env.EASY_BIDDING_BILLING_ENABLED === 'false') return null;

  const credits = roundCredits(Number(input.credits));
  if (!Number.isFinite(credits) || credits <= 0) {
    return null;
  }

  const state = readState();
  const account = getOrCreateAccount(accountId, state);
  assertActiveAccount(account);
  if (account.balanceCredits < credits) {
    throw new BillingError(
      `额度不足：当前余额 ${account.balanceCredits.toFixed(2)}，本次实际消耗 ${credits.toFixed(2)}。请充值后重试。`,
    );
  }

  account.balanceCredits = roundCredits(account.balanceCredits - credits);
  account.totalConsumedCredits = roundCredits(account.totalConsumedCredits + credits);
  account.updatedAt = nowIso();

  const transaction: BillingTransaction = {
    id: transactionId(),
    accountId,
    type: 'consume',
    credits: -credits,
    balanceAfter: account.balanceCredits,
    description: input.description,
    createdAt: account.updatedAt,
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    usage: input.usage,
    referenceId: input.referenceId,
  };

  state.transactions.unshift(transaction);
  writeState(state);
  return transaction;
}
