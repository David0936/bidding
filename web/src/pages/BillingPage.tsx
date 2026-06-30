import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { BillingFeatureCode, BillingOverview, BillingTransaction, PaymentOrder } from '../types';
import { IconAlertTriangle, IconCheckCircle, IconPlus, IconWallet } from '../components/Icons';

const BILLING_FEATURE_LABELS: Record<BillingFeatureCode, string> = {
  workspace: '标书工作台',
  export: '导出 Word/PDF',
  knowledge: '知识库',
  duplicateCheck: '标书查重',
  rejectionCheck: '废标项检查',
  seal: '电子盖章',
};
const BILLING_FEATURE_CODES = Object.keys(BILLING_FEATURE_LABELS) as BillingFeatureCode[];

const TRANSACTION_FEATURE_LABELS: Record<string, string> = {
  'project.tenderAnalysis': '招标关键项解析',
  'project.outline': '目录生成',
  'project.globalFacts': '全局事实生成',
  'project.sectionContent': '章节正文生成',
  'project.consistencyAudit': '全文一致性审计',
  'checks.rejection': '废标项检查',
  'knowledge.analyzeDocument': '知识库整理',
  'ai.chat': 'AI 调用',
};

function formatCredits(value: number) {
  return `${value.toFixed(2)} 点`;
}

function formatMoney(cents: number, currency: string) {
  const symbol = currency === 'CNY' ? '¥' : `${currency} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDate(value?: string) {
  if (!value) return '长期有效';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function orderStatusText(order: PaymentOrder) {
  if (order.status === 'pending') return '待支付';
  if (order.status === 'paid') return '已支付';
  if (order.status === 'cancelled') return '已取消';
  return '已过期';
}

function transactionTitle(tx: BillingTransaction) {
  if (tx.type === 'consume') return TRANSACTION_FEATURE_LABELS[tx.feature ?? ''] ?? tx.description;
  if (tx.type === 'trial') return '试用额度';
  if (tx.type === 'recharge') return '额度充值';
  if (tx.type === 'refund') return '额度退回';
  return '额度调整';
}

function transactionMeta(tx: BillingTransaction) {
  const parts = [
    tx.provider && tx.model ? `${tx.provider} · ${tx.model}` : '',
    tx.usage ? `${tx.usage.totalTokens} tokens${tx.usage.estimated ? '（估算）' : ''}` : '',
  ].filter(Boolean);
  return parts.join(' / ') || tx.description;
}

export default function BillingPage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [recharging, setRecharging] = useState(false);
  const [credits, setCredits] = useState(100);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      setOverview(await api.getBillingOverview());
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const account = overview?.account;
  const recentTransactions = overview?.transactions ?? [];
  const recentOrders = overview?.orders ?? [];
  const spendRate = useMemo(() => {
    if (!overview) return '';
    return `${overview.pricing.creditsPerThousandTokens.toFixed(2)} 点 / 1000 tokens`;
  }, [overview]);

  async function handleCreateOrder() {
    if (!Number.isFinite(credits) || credits <= 0) {
      setMessage({ ok: false, text: '充值额度必须大于 0。' });
      return;
    }

    setRecharging(true);
    setMessage(null);
    try {
      const next = await api.createRechargeOrder(credits);
      setOverview(next);
      setMessage({ ok: true, text: `已创建 ${formatCredits(credits)} 的充值订单。` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRecharging(false);
    }
  }

  async function handleCancelOrder(order: PaymentOrder) {
    setMessage(null);
    try {
      const next = await api.cancelRechargeOrder(order.id);
      setOverview(next);
      setMessage({ ok: true, text: `订单 ${order.id} 已取消。` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  if (loading) {
    return (
      <div className="page-header">
        <h1>额度中心</h1>
        <p>加载中…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>额度中心</h1>
        <p>按 AI 算力用量扣除额度，支持后续接入在线支付与企业账户。</p>
      </div>

      {account && (
        <div className="billing-summary">
          <div className="billing-balance">
            <div className="billing-balance-head">
              <IconWallet />
              <span>{account.planName}</span>
            </div>
            <strong>{formatCredits(account.balanceCredits)}</strong>
            <p>{account.status === 'active' ? '账户正常' : '账户已暂停'}</p>
          </div>

          <div className="billing-metrics">
            <div className="metric-card">
              <span>累计充值</span>
              <strong>{formatCredits(account.totalRechargedCredits)}</strong>
            </div>
            <div className="metric-card">
              <span>累计消耗</span>
              <strong>{formatCredits(account.totalConsumedCredits)}</strong>
            </div>
            <div className="metric-card">
              <span>当前单价</span>
              <strong>{spendRate}</strong>
            </div>
            <div className="metric-card">
              <span>VIP 到期</span>
              <strong>{formatDate(account.planExpiresAt)}</strong>
            </div>
            <div className="metric-card">
              <span>项目上限</span>
              <strong>{account.projectLimit === 0 ? '不限' : `${account.projectLimit} 个`}</strong>
            </div>
            <div className="metric-card">
              <span>套餐状态</span>
              <strong>{account.status === 'active' ? '可用' : '已暂停'}</strong>
            </div>
          </div>
        </div>
      )}

      {account && (
        <div className="card">
          <h2>当前权益</h2>
          <p className="hint">功能由管理员开通；AI 生成会额外消耗账户额度。</p>
          <div className="feature-chip-grid">
            {BILLING_FEATURE_CODES.map((code) => (
              <span className={`badge ${account.featureFlags[code] ? 'badge-on' : 'badge-off'}`} key={code}>
                {account.featureFlags[code] ? <IconCheckCircle /> : <IconAlertTriangle />}
                {BILLING_FEATURE_LABELS[code]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>充值额度</h2>
        <p className="hint">提交充值申请后，请按线下公对公流程付款；管理员确认到账后会手工分配额度。</p>

        <div className="row">
          <div className="field">
            <label>充值点数</label>
            <input
              type="number"
              min="1"
              step="10"
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>订单金额</label>
            <input
              value={
                overview
                  ? formatMoney(Math.round(credits * overview.pricing.centsPerCredit), overview.pricing.currency)
                  : '-'
              }
              readOnly
            />
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={handleCreateOrder} disabled={recharging}>
            <IconPlus />
            {recharging ? '提交中…' : '提交充值申请'}
          </button>
        </div>

        {message && (
          <div className={`result ${message.ok ? 'ok' : 'err'}`}>
            {message.ok ? <IconCheckCircle /> : <IconAlertTriangle />}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      <div className="card">
        <h2>充值申请</h2>
        <div className="ledger-table">
          <div className="ledger-head order-head">
            <span>时间</span>
            <span>订单</span>
            <span>金额</span>
            <span>状态</span>
          </div>
          {recentOrders.length === 0 ? (
            <div className="empty">暂无充值订单</div>
          ) : (
            recentOrders.map((order) => (
              <div className="ledger-row order-row" key={order.id}>
                <span>{formatTime(order.createdAt)}</span>
                <span>
                  <strong>{order.description}</strong>
                  <em>{order.id} / {formatCredits(order.credits)}</em>
                </span>
                <span>{formatMoney(order.amountCents, order.currency)}</span>
                <span>
                  <strong>{orderStatusText(order)}</strong>
                  {order.status === 'pending' && (
                    <span className="order-actions">
                      <button className="mini-btn danger" onClick={() => void handleCancelOrder(order)}>
                        取消
                      </button>
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2>最近流水</h2>
        <div className="ledger-table">
          <div className="ledger-head">
            <span>时间</span>
            <span>类型</span>
            <span>额度</span>
            <span>余额</span>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="empty">暂无额度流水</div>
          ) : (
            recentTransactions.map((tx) => (
              <div className="ledger-row" key={tx.id}>
                <span>{formatTime(tx.createdAt)}</span>
                <span>
                  <strong>{transactionTitle(tx)}</strong>
                  <em>{transactionMeta(tx)}</em>
                </span>
                <span className={tx.credits >= 0 ? 'ledger-plus' : 'ledger-minus'}>
                  {tx.credits >= 0 ? '+' : ''}
                  {formatCredits(tx.credits)}
                </span>
                <span>{formatCredits(tx.balanceAfter)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
