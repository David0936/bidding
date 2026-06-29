import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { AdminBillingOverview, BillingAccount } from '../types';
import { IconAlertTriangle, IconCheckCircle, IconPlug, IconSave, IconSettings, IconWallet } from '../components/Icons';
import SettingsPage from './SettingsPage';

type AdminTab = 'billing' | 'models';

function formatCredits(value: number) {
  return `${value.toFixed(2)} 点`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function accountLabel(account: BillingAccount) {
  return `${account.name || account.id}（${account.id}）`;
}

interface AdminPageProps {
  onBackToCustomer?: () => void;
}

export default function AdminPage({ onBackToCustomer }: AdminPageProps) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [secret, setSecret] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState<AdminTab>('billing');
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [credits, setCredits] = useState(100);
  const [description, setDescription] = useState('线下公对公收款，管理员手工分配额度');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadAdminOverview() {
    const next = await api.getAdminBillingOverview();
    setOverview(next);
    setSelectedAccountId((current) => current || next.accounts[0]?.id || '');
  }

  useEffect(() => {
    api
      .getAdminMe()
      .then((res) => {
        setAuthed(res.authenticated);
        if (res.authenticated) void loadAdminOverview();
      })
      .catch(() => {
        api.adminLogout();
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  const selectedAccount = useMemo(
    () => overview?.accounts.find((account) => account.id === selectedAccountId) ?? null,
    [overview, selectedAccountId],
  );

  async function handleLogin() {
    setLoggingIn(true);
    setMessage(null);
    try {
      await api.adminLogin(secret);
      setAuthed(true);
      setSecret('');
      await loadAdminOverview();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleAllocate() {
    if (!selectedAccountId) {
      setMessage({ ok: false, text: '请选择客户账户。' });
      return;
    }
    setMessage(null);
    try {
      const next = await api.adminAllocateCredits(selectedAccountId, credits, description);
      setOverview(next);
      setMessage({ ok: true, text: `已为账户分配 ${formatCredits(credits)}。` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleLogout() {
    api.adminLogout();
    setAuthed(false);
    setOverview(null);
    setMessage(null);
  }

  if (checking) {
    return (
      <div className="page-header">
        <h1>管理员后台</h1>
        <p>校验管理员权限…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div>
        <div className="page-header">
          <h1>管理员后台</h1>
          <p>平台模型配置和客户额度分配仅管理员可见。</p>
          {onBackToCustomer && (
            <button type="button" className="link-btn" onClick={onBackToCustomer}>
              返回客户登录
            </button>
          )}
        </div>
        <div className="card">
          <h2>管理员登录</h2>
          <p className="hint">请输入后台管理员密钥。客户账号不能访问此后台。</p>
          <div className="field">
            <label>管理员密钥</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLogin();
              }}
              placeholder="EASY_BIDDING_ADMIN_SECRET"
            />
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={handleLogin} disabled={loggingIn}>
              <IconPlug />
              {loggingIn ? '登录中…' : '登录后台'}
            </button>
          </div>
          {message && (
            <div className={`result ${message.ok ? 'ok' : 'err'}`}>
              {message.ok ? <IconCheckCircle /> : <IconAlertTriangle />}
              <span>{message.text}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>管理员后台</h1>
        <p>模型配置、客户额度和运营账本集中在这里管理。</p>
        {onBackToCustomer && (
          <button type="button" className="link-btn" onClick={onBackToCustomer}>
            返回客户登录
          </button>
        )}
      </div>

      <div className="provider-tabs">
        <button className={tab === 'billing' ? 'active' : ''} onClick={() => setTab('billing')}>
          <IconWallet />
          客户额度
        </button>
        <button className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}>
          <IconSettings />
          模型配置
        </button>
      </div>

      <div className="actions admin-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => void loadAdminOverview()}>
          <IconSave />
          刷新后台数据
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          退出管理员
        </button>
      </div>

      {tab === 'models' ? (
        <SettingsPage />
      ) : (
        <>
          <div className="billing-summary">
            <div className="metric-card">
              <span>客户账户</span>
              <strong>{overview?.totals.accountCount ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>累计分配额度</span>
              <strong>{formatCredits(overview?.totals.totalRechargedCredits ?? 0)}</strong>
            </div>
            <div className="metric-card">
              <span>累计消耗额度</span>
              <strong>{formatCredits(overview?.totals.totalConsumedCredits ?? 0)}</strong>
            </div>
          </div>

          <div className="card">
            <h2>手工分配额度</h2>
            <p className="hint">客户线下公对公转账到账后，在这里给对应账户增加额度。</p>
            <div className="field">
              <label>客户账户</label>
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                {overview?.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
            </div>
            {selectedAccount && (
              <div className="desktop-meta">
                <div className="desktop-meta-item">
                  <span>当前余额</span>
                  <strong>{formatCredits(selectedAccount.balanceCredits)}</strong>
                </div>
                <div className="desktop-meta-item">
                  <span>累计消耗</span>
                  <strong>{formatCredits(selectedAccount.totalConsumedCredits)}</strong>
                </div>
              </div>
            )}
            <div className="row">
              <div className="field">
                <label>分配额度</label>
                <input type="number" min="1" step="10" value={credits} onChange={(e) => setCredits(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>备注</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={handleAllocate}>
                <IconWallet />
                确认分配额度
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
            <h2>客户账户</h2>
            <div className="ledger-table">
              <div className="ledger-head admin-account-head">
                <span>账户</span>
                <span>余额</span>
                <span>累计分配</span>
                <span>更新时间</span>
              </div>
              {overview?.accounts.length ? (
                overview.accounts.map((account) => (
                  <div className="ledger-row admin-account-row" key={account.id}>
                    <span>
                      <strong>{account.name}</strong>
                      <em>{account.id}</em>
                    </span>
                    <span>{formatCredits(account.balanceCredits)}</span>
                    <span>{formatCredits(account.totalRechargedCredits)}</span>
                    <span>{formatTime(account.updatedAt)}</span>
                  </div>
                ))
              ) : (
                <div className="empty">暂无客户账户</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
