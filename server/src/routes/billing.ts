import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { getCurrentAccountId } from '../billing/requestContext.js';
import { isAdminRequest, requireAdmin } from '../admin/adminAuth.js';
import {
  cancelRechargeOrder,
  confirmRechargeOrderById,
  confirmRechargeOrder,
  createRechargeOrder,
  getAdminBillingOverview,
  getBillingOverview,
  recordRecharge,
} from '../billing/billingStore.js';
import type { PaymentProvider } from '../billing/types.js';

export const billingRouter = Router();

function canRecharge(req: Request): boolean {
  if (process.env.EASY_BIDDING_ALLOW_SELF_RECHARGE === 'true') return true;
  const adminSecret = process.env.EASY_BIDDING_ADMIN_SECRET;
  if (!adminSecret) return false;
  return req.headers['x-easy-bidding-admin-secret'] === adminSecret;
}

function hasAdminSecret(req: Request): boolean {
  return isAdminRequest(req);
}

function canConfirmPayment(req: Request): boolean {
  if (process.env.EASY_BIDDING_ALLOW_MOCK_PAYMENT === 'true') return true;
  return hasAdminSecret(req);
}

function normalizeProvider(value: unknown): PaymentProvider {
  const provider = String(value ?? '').trim();
  const allowed = new Set(['manual', 'mock', 'wechat', 'alipay', 'stripe', 'bank_transfer']);
  return allowed.has(provider) ? (provider as PaymentProvider) : 'manual';
}

function verifyWebhookSignature(req: Request): boolean {
  const secret = process.env.EASY_BIDDING_PAYMENT_WEBHOOK_SECRET;
  if (!secret) return false;
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
  const incoming = String(req.headers['x-easy-bidding-signature'] ?? '').trim();
  const normalizedIncoming = incoming.startsWith('sha256=') ? incoming.slice('sha256='.length) : incoming;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const incomingBuffer = Buffer.from(normalizedIncoming, 'hex');
  return (
    expectedBuffer.length === incomingBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, incomingBuffer)
  );
}

billingRouter.get('/admin/overview', requireAdmin, (_req, res) => {
  res.json(getAdminBillingOverview());
});

billingRouter.post('/admin/allocate', requireAdmin, (req, res) => {
  const accountId = String(req.body?.accountId ?? '').trim();
  if (!accountId) return res.status(400).json({ message: '缺少客户账户 ID。' });
  const credits = Number(req.body?.credits);
  const description = String(req.body?.description ?? '').trim();
  const referenceId = String(req.body?.referenceId ?? '').trim() || undefined;
  recordRecharge(accountId, {
    credits,
    description: description || '管理员手工分配额度',
    referenceId,
  });
  res.json(getAdminBillingOverview());
});

billingRouter.get('/account', (_req, res) => {
  res.json(getBillingOverview(getCurrentAccountId()));
});

billingRouter.get('/transactions', (_req, res) => {
  res.json(getBillingOverview(getCurrentAccountId()).transactions);
});

billingRouter.get('/orders', (_req, res) => {
  res.json(getBillingOverview(getCurrentAccountId()).orders);
});

billingRouter.post('/orders', (req, res) => {
  const overview = createRechargeOrder(getCurrentAccountId(), {
    credits: Number(req.body?.credits),
    provider: normalizeProvider(req.body?.provider),
    description: String(req.body?.description ?? '').trim() || undefined,
  });
  res.json(overview);
});

billingRouter.post('/orders/:id/cancel', (req, res) => {
  res.json(cancelRechargeOrder(getCurrentAccountId(), req.params.id));
});

billingRouter.post('/orders/:id/confirm', (req, res) => {
  if (!canConfirmPayment(req)) {
    return res.status(403).json({
      message: '当前订单不能直接确认支付。请使用支付平台回调或管理员密钥完成入账。',
    });
  }
  const overview = confirmRechargeOrder(getCurrentAccountId(), req.params.id, {
    providerTradeNo: String(req.body?.providerTradeNo ?? '').trim() || undefined,
    description: String(req.body?.description ?? '').trim() || undefined,
  });
  res.json(overview);
});

billingRouter.post('/orders/:id/mock-pay', (req, res) => {
  if (process.env.EASY_BIDDING_ALLOW_MOCK_PAYMENT !== 'true') {
    return res.status(403).json({ message: '未开启演示支付确认。' });
  }
  res.json(
    confirmRechargeOrder(getCurrentAccountId(), req.params.id, {
      providerTradeNo: `mock_${Date.now()}`,
      description: '演示支付入账',
    }),
  );
});

billingRouter.post('/payment-webhook/generic', (req, res) => {
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ message: '支付回调签名无效。' });
  }

  const status = String(req.body?.status ?? '').trim();
  if (status !== 'paid') {
    return res.json({ ok: true, ignored: true, message: '非支付成功状态，已忽略。' });
  }

  const orderId = String(req.body?.orderId ?? '').trim();
  const providerTradeNo = String(req.body?.providerTradeNo ?? '').trim() || undefined;
  const amountCents = Number(req.body?.amountCents);
  const currency = String(req.body?.currency ?? '').trim() || undefined;
  const overview = confirmRechargeOrderById(orderId, {
    providerTradeNo,
    amountCents: Number.isFinite(amountCents) ? amountCents : undefined,
    currency,
    description: '支付回调确认入账',
  });
  res.json({ ok: true, orderId, accountId: overview.account.id, balanceCredits: overview.account.balanceCredits });
});

billingRouter.post('/recharge', (req, res) => {
  if (!canRecharge(req)) {
    return res.status(403).json({
      message: '当前未开放自助充值。请接入支付回调或使用管理员密钥执行充值。',
    });
  }
  const credits = Number(req.body?.credits);
  const description = String(req.body?.description ?? '').trim();
  const referenceId = String(req.body?.referenceId ?? '').trim() || undefined;
  const overview = recordRecharge(getCurrentAccountId(), {
    credits,
    description: description || '人工充值额度',
    referenceId,
  });
  res.json(overview);
});
