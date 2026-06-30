import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type {
  AdminBillingOverview,
  BillingAccount,
  BillingAccountStatus,
  BillingFeatureCode,
  BillingFeatureFlags,
  BillingPlanCode,
} from '../types';
import { IconAlertTriangle, IconCheckCircle, IconPlug, IconSave, IconSettings, IconWallet } from '../components/Icons';
import SettingsPage from './SettingsPage';

type AdminTab = 'billing' | 'models';

const FEATURE_LABELS: Record<BillingFeatureCode, string> = {
  workspace: '标书工作台',
  export: '导出 Word/PDF',
  knowledge: '知识库',
  duplicateCheck: '标书查重',
  rejectionCheck: '废标项检查',
  seal: '电子盖章',
};

const FEATURE_CODES = Object.keys(FEATURE_LABELS) as BillingFeatureCode[];

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

function formatCredits(value: number) {
  return `${value.toFixed(2)} 点`;
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

function accountLabel(account: BillingAccount) {
  const owner = account.ownerEmail ? ` · ${account.ownerEmail}` : '';
  return `${account.name || account.id}${owner}（${account.id}）`;
}

function accountStatusText(status: BillingAccountStatus) {
  return status === 'active' ? '正常' : '已暂停';
}

function planText(code: BillingPlanCode) {
  return PLAN_PRESETS[code]?.name ?? code;
}

function planExpiryText(account: BillingAccount) {
  if (!account.planExpiresAt) return '长期有效';
  if (account.planExpired) return `已过期 ${Math.abs(account.daysUntilPlanExpires ?? 0)} 天`;
  if (account.daysUntilPlanExpires === 0) return '今天到期';
  return `${formatDate(account.planExpiresAt)}，剩余 ${account.daysUntilPlanExpires} 天`;
}

function toDateInputValue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function fromDateInputValue(value: string) {
  return value ? new Date(`${value}T23:59:59.000+08:00`).toISOString() : null;
}

function accountSearchText(account: BillingAccount) {
  return [
    account.id,
    account.name,
    account.ownerEmail,
    account.ownerUserId,
    account.adminNote,
    account.status,
    account.planName,
    account.planCode,
    account.planExpired ? '过期' : '',
    account.daysUntilPlanExpires !== null && account.daysUntilPlanExpires <= 15 ? '临期' : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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
  const [accountQuery, setAccountQuery] = useState('');
  const [accountNameDraft, setAccountNameDraft] = useState('');
  const [accountNoteDraft, setAccountNoteDraft] = useState('');
  const [planCodeDraft, setPlanCodeDraft] = useState<BillingPlanCode>('trial');
  const [planExpiresAtDraft, setPlanExpiresAtDraft] = useState('');
  const [projectLimitDraft, setProjectLimitDraft] = useState(2);
  const [featureFlagsDraft, setFeatureFlagsDraft] = useState<BillingFeatureFlags>(PLAN_PRESETS.trial.featureFlags);
  const [savingAccount, setSavingAccount] = useState(false);
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
  const filteredAccounts = useMemo(() => {
    const query = accountQuery.trim().toLowerCase();
    const accounts = overview?.accounts ?? [];
    if (!query) return accounts;
    return accounts.filter((account) => accountSearchText(account).includes(query));
  }, [accountQuery, overview]);

  useEffect(() => {
    setAccountNameDraft(selectedAccount?.name ?? '');
    setAccountNoteDraft(selectedAccount?.adminNote ?? '');
    setPlanCodeDraft(selectedAccount?.planCode ?? 'trial');
    setPlanExpiresAtDraft(toDateInputValue(selectedAccount?.planExpiresAt));
    setProjectLimitDraft(selectedAccount?.projectLimit ?? PLAN_PRESETS.trial.projectLimit);
    setFeatureFlagsDraft(selectedAccount?.featureFlags ?? PLAN_PRESETS.trial.featureFlags);
  }, [
    selectedAccount?.id,
    selectedAccount?.name,
    selectedAccount?.adminNote,
    selectedAccount?.planCode,
    selectedAccount?.planExpiresAt,
    selectedAccount?.projectLimit,
    selectedAccount?.featureFlags,
  ]);

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

  async function handleSaveAccount() {
    if (!selectedAccount) {
      setMessage({ ok: false, text: '请选择客户账户。' });
      return;
    }
    setSavingAccount(true);
    setMessage(null);
    try {
      const next = await api.adminUpdateAccount(selectedAccount.id, {
        name: accountNameDraft,
        adminNote: accountNoteDraft,
        planCode: planCodeDraft,
        planExpiresAt: fromDateInputValue(planExpiresAtDraft),
        projectLimit: projectLimitDraft,
        featureFlags: featureFlagsDraft,
      });
      setOverview(next);
      setMessage({ ok: true, text: '客户资料已保存。' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingAccount(false);
    }
  }

  function handlePlanDraftChange(planCode: BillingPlanCode) {
    const preset = PLAN_PRESETS[planCode];
    setPlanCodeDraft(planCode);
    setProjectLimitDraft(preset.projectLimit);
    setFeatureFlagsDraft({ ...preset.featureFlags });
  }

  function patchFeatureFlag(code: BillingFeatureCode, enabled: boolean) {
    setFeatureFlagsDraft((current) => ({ ...current, [code]: enabled }));
  }

  async function handleSetAccountStatus(status: BillingAccountStatus) {
    if (!selectedAccount) {
      setMessage({ ok: false, text: '请选择客户账户。' });
      return;
    }
    setSavingAccount(true);
    setMessage(null);
    try {
      const next = await api.adminUpdateAccount(selectedAccount.id, { status });
      setOverview(next);
      setMessage({
        ok: true,
        text: status === 'active' ? '客户账户已恢复。' : '客户账户已暂停，后续 AI 调用会被拦截。',
      });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingAccount(false);
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
          <div className="billing-summary admin-summary">
            <div className="metric-card">
              <span>客户账户</span>
              <strong>
                {overview?.totals.activeAccountCount ?? 0} / {overview?.totals.accountCount ?? 0}
              </strong>
            </div>
            <div className="metric-card">
              <span>累计分配额度</span>
              <strong>{formatCredits(overview?.totals.totalRechargedCredits ?? 0)}</strong>
            </div>
            <div className="metric-card">
              <span>累计消耗额度</span>
              <strong>{formatCredits(overview?.totals.totalConsumedCredits ?? 0)}</strong>
            </div>
            <div className="metric-card">
              <span>15 天内到期</span>
              <strong>{overview?.totals.expiringSoonAccountCount ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>套餐已过期</span>
              <strong>{overview?.totals.expiredPlanAccountCount ?? 0}</strong>
            </div>
          </div>

          <div className="card">
            <h2>客户检索与状态</h2>
            <p className="hint">按客户名称、邮箱、账户 ID 或管理员备注搜索；可维护运营备注并暂停/恢复账户。</p>
            <div className="field">
              <label>搜索客户</label>
              <input
                value={accountQuery}
                onChange={(e) => setAccountQuery(e.target.value)}
                placeholder="输入客户名称、邮箱、账户 ID 或备注"
              />
            </div>
            <div className="field">
              <label>当前客户</label>
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                {(filteredAccounts.length ? filteredAccounts : overview?.accounts ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
            </div>
            {selectedAccount && (
              <>
                <div className="desktop-meta">
                  <div className="desktop-meta-item">
                    <span>客户邮箱</span>
                    <strong>{selectedAccount.ownerEmail || '未同步'}</strong>
                  </div>
                  <div className="desktop-meta-item">
                    <span>账户状态</span>
                    <strong>{accountStatusText(selectedAccount.status)}</strong>
                  </div>
                  <div className="desktop-meta-item">
                    <span>账户 ID</span>
                    <strong>{selectedAccount.id}</strong>
                  </div>
                  <div className="desktop-meta-item">
                    <span>套餐到期</span>
                    <strong>{planExpiryText(selectedAccount)}</strong>
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>客户名称</label>
                    <input value={accountNameDraft} onChange={(e) => setAccountNameDraft(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>管理员备注</label>
                    <input
                      value={accountNoteDraft}
                      onChange={(e) => setAccountNoteDraft(e.target.value)}
                      placeholder="到账记录、联系人、套餐约定等"
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>会员套餐</label>
                    <select value={planCodeDraft} onChange={(e) => handlePlanDraftChange(e.target.value as BillingPlanCode)}>
                      {(Object.keys(PLAN_PRESETS) as BillingPlanCode[]).map((code) => (
                        <option key={code} value={code}>
                          {planText(code)}
                        </option>
                      ))}
                    </select>
                    <p className="hint">切换套餐会套用默认功能权限。</p>
                  </div>
                  <div className="field">
                    <label>VIP 到期日</label>
                    <input
                      type="date"
                      value={planExpiresAtDraft}
                      onChange={(e) => setPlanExpiresAtDraft(e.target.value)}
                    />
                    <p className="hint">留空表示不设置到期日。</p>
                  </div>
                </div>
                <div className="field">
                  <label>项目数上限</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={projectLimitDraft}
                    onChange={(e) => setProjectLimitDraft(Number(e.target.value))}
                  />
                  <p className="hint">0 表示不限制项目数量。</p>
                </div>
                <div className="feature-toggle-grid">
                  {FEATURE_CODES.map((code) => (
                    <label className="feature-toggle" key={code}>
                      <input
                        type="checkbox"
                        checked={featureFlagsDraft[code]}
                        onChange={(e) => patchFeatureFlag(code, e.target.checked)}
                      />
                      <span>{FEATURE_LABELS[code]}</span>
                    </label>
                  ))}
                </div>
                <div className="actions">
                  <button className="btn btn-primary" onClick={handleSaveAccount} disabled={savingAccount}>
                    <IconSave />
                    {savingAccount ? '保存中…' : '保存客户资料'}
                  </button>
                  {selectedAccount.status === 'active' ? (
                    <button
                      className="btn btn-ghost btn-sm danger"
                      onClick={() => void handleSetAccountStatus('suspended')}
                      disabled={savingAccount}
                    >
                      <IconAlertTriangle />
                      暂停账户
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => void handleSetAccountStatus('active')}
                      disabled={savingAccount}
                    >
                      <IconCheckCircle />
                      恢复账户
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h2>手工分配额度</h2>
            <p className="hint">客户线下公对公转账到账后，在这里给对应账户增加额度。</p>
            <div className="field">
              <label>客户账户</label>
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                {(filteredAccounts.length ? filteredAccounts : overview?.accounts ?? []).map((account) => (
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
                <span>状态</span>
                <span>余额</span>
                <span>更新时间</span>
                <span>备注</span>
              </div>
              {filteredAccounts.length ? (
                filteredAccounts.map((account) => (
                  <div className="ledger-row admin-account-row" key={account.id}>
                    <span>
                      <strong>{account.name}</strong>
                      <em>
                        {account.ownerEmail || account.id} / {account.planName}
                      </em>
                    </span>
                    <span className="account-status-stack">
                      <span className={`badge ${account.status === 'active' ? 'badge-on' : 'badge-warn'}`}>
                        {accountStatusText(account.status)}
                      </span>
                      {account.planExpired && <span className="badge badge-warn">套餐过期</span>}
                      {!account.planExpired &&
                        account.daysUntilPlanExpires !== null &&
                        account.daysUntilPlanExpires <= 15 && (
                          <span className="badge badge-warn">临期 {account.daysUntilPlanExpires} 天</span>
                        )}
                    </span>
                    <span>{formatCredits(account.balanceCredits)}</span>
                    <span>{formatTime(account.updatedAt)}</span>
                    <span>{account.adminNote || '—'}</span>
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
