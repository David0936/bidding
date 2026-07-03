import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { AgentOverview, AgentReferral, AgentType } from '../types';
import { IconAlertTriangle, IconCheckCircle, IconPlus, IconWallet } from '../components/Icons';

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  personal: '个人代理人',
  enterprise: '企业代理人',
};

const REFERRAL_STATUS_LABELS: Record<AgentReferral['status'], string> = {
  lead: '线索',
  pending_settlement: '待结算',
  settled: '已结算',
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatMoney(cents: number) {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default function AgentPage() {
  const [overview, setOverview] = useState<AgentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    type: 'personal' as AgentType,
    applicantName: '',
    phone: '',
    companyName: '',
    city: '',
    industry: '',
    channel: '',
    note: '',
  });
  const [leadForm, setLeadForm] = useState({
    customerName: '',
    customerEmail: '',
    rechargeYuan: '',
    note: '',
  });

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      setOverview(await api.getAgentOverview());
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!overview?.application) return;
    setForm((current) => ({
      ...current,
      type: overview.application?.type ?? current.type,
      applicantName: overview.application?.applicantName ?? current.applicantName,
      phone: overview.application?.phone ?? current.phone,
      companyName: overview.application?.companyName ?? current.companyName,
      city: overview.application?.city ?? current.city,
      industry: overview.application?.industry ?? current.industry,
      channel: overview.application?.channel ?? current.channel,
      note: overview.application?.note ?? current.note,
    }));
  }, [overview?.application]);

  const profile = overview?.profile ?? null;
  const summary = overview?.summary;
  const selectedTier = useMemo(
    () => overview?.program.find((tier) => tier.type === form.type) ?? overview?.program[0] ?? null,
    [form.type, overview?.program],
  );

  async function handleApply() {
    setSaving(true);
    setMessage(null);
    try {
      const next = await api.applyAgent(form);
      setOverview(next);
      setMessage({ ok: true, text: '代理人资料已提交，邀请码已开通，可先登记线索。' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLead() {
    const rechargeYuan = Number(leadForm.rechargeYuan || 0);
    setLeadSaving(true);
    setMessage(null);
    try {
      const next = await api.createAgentReferral({
        customerName: leadForm.customerName,
        customerEmail: leadForm.customerEmail,
        rechargeCents: Number.isFinite(rechargeYuan) ? Math.round(rechargeYuan * 100) : 0,
        note: leadForm.note,
      });
      setOverview(next);
      setLeadForm({ customerName: '', customerEmail: '', rechargeYuan: '', note: '' });
      setMessage({ ok: true, text: '客户线索已登记。' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLeadSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-header">
        <h1>代理人</h1>
        <p>加载代理人信息…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>代理人</h1>
        <p>用邀请码绑定客户，线下公对公充值后可按约定比例登记佣金。</p>
      </div>

      {message && (
        <div className={`result ${message.ok ? 'ok' : 'err'}`}>
          {message.ok ? <IconCheckCircle /> : <IconAlertTriangle />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="agent-summary-grid">
        <div className="agent-summary-card">
          <span>代理状态</span>
          <strong>{profile ? AGENT_TYPE_LABELS[profile.type] : '未开通'}</strong>
          <em>{profile ? `邀请码 ${profile.inviteCode}` : '提交资料后生成邀请码'}</em>
        </div>
        <div className="agent-summary-card">
          <span>佣金比例</span>
          <strong>{profile ? formatPercent(profile.commissionRate) : selectedTier ? formatPercent(selectedTier.commissionRate) : '-'}</strong>
          <em>客户返利 {profile ? formatPercent(profile.customerRebateRate) : selectedTier ? formatPercent(selectedTier.customerRebateRate) : '-'}</em>
        </div>
        <div className="agent-summary-card">
          <span>待结算佣金</span>
          <strong>{formatMoney(summary?.pendingCommissionCents ?? 0)}</strong>
          <em>已结算 {formatMoney(summary?.settledCommissionCents ?? 0)}</em>
        </div>
        <div className="agent-summary-card">
          <span>绑定客户</span>
          <strong>{summary?.invitedCustomerCount ?? 0}</strong>
          <em>累计充值 {formatMoney(summary?.totalRechargeCents ?? 0)}</em>
        </div>
      </div>

      <div className="agent-layout">
        <div className="card">
          <div className="step-head">
            <div className="step-no">01</div>
            <div>
              <h2>代理人资料</h2>
              <p className="hint" style={{ margin: 0 }}>
                当前版本提交后自动开通邀请码；正式运营时可改为管理员审核。
              </p>
            </div>
          </div>

          <div className="agent-tier-select">
            {overview?.program.map((tier) => (
              <button
                type="button"
                className="agent-tier-card"
                data-active={form.type === tier.type}
                onClick={() => setForm((current) => ({ ...current, type: tier.type }))}
                key={tier.type}
              >
                <strong>{tier.name}</strong>
                <span>佣金 {formatPercent(tier.commissionRate)} · 客户返利 {formatPercent(tier.customerRebateRate)}</span>
              </button>
            ))}
          </div>

          <div className="row">
            <label>
              申请人姓名
              <input value={form.applicantName} onChange={(e) => setForm({ ...form, applicantName: e.target.value })} />
            </label>
            <label>
              联系电话
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>
          {form.type === 'enterprise' && (
            <label>
              企业名称
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </label>
          )}
          <div className="row">
            <label>
              所在城市
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="如：广东省 / 深圳市" />
            </label>
            <label>
              所属行业
              <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="如：制造业、招采咨询" />
            </label>
          </div>
          <label>
            获客渠道
            <input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="如：老客户、人脉、公众号、行业社群" />
          </label>
          <label>
            备注
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} />
          </label>
          <div className="actions">
            <button className="btn btn-primary" onClick={handleApply} disabled={saving}>
              <IconCheckCircle />
              {saving ? '提交中…' : profile ? '更新资料' : '申请并开通邀请码'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="step-head">
            <div className="step-no">02</div>
            <div>
              <h2>线索登记</h2>
              <p className="hint" style={{ margin: 0 }}>
                线下成交后登记充值金额，系统按代理比例估算待结算佣金。
              </p>
            </div>
          </div>

          {profile ? (
            <>
              <div className="agent-code-box">
                <IconWallet />
                <div>
                  <span>当前邀请码</span>
                  <strong>{profile.inviteCode}</strong>
                </div>
                <button
                  className="mini-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(profile.inviteCode);
                    setMessage({ ok: true, text: '邀请码已复制。' });
                  }}
                >
                  复制
                </button>
              </div>
              <label>
                客户名称
                <input value={leadForm.customerName} onChange={(e) => setLeadForm({ ...leadForm, customerName: e.target.value })} />
              </label>
              <label>
                客户邮箱 / 联系方式
                <input value={leadForm.customerEmail} onChange={(e) => setLeadForm({ ...leadForm, customerEmail: e.target.value })} />
              </label>
              <label>
                预计或实际充值金额（元）
                <input value={leadForm.rechargeYuan} onChange={(e) => setLeadForm({ ...leadForm, rechargeYuan: e.target.value })} inputMode="decimal" />
              </label>
              <label>
                跟进备注
                <textarea value={leadForm.note} onChange={(e) => setLeadForm({ ...leadForm, note: e.target.value })} rows={3} />
              </label>
              <div className="actions">
                <button className="btn btn-primary" onClick={handleCreateLead} disabled={leadSaving}>
                  <IconPlus />
                  {leadSaving ? '登记中…' : '登记客户线索'}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-tip">先提交代理人资料后，再登记客户线索。</div>
          )}
        </div>
      </div>

      <div className="agent-program-grid">
        {overview?.program.map((tier) => (
          <div className="agent-program-card" key={tier.type}>
            <div className="agent-program-head">
              <strong>{tier.name}</strong>
              <span>{formatPercent(tier.commissionRate)} 佣金</span>
            </div>
            <p>客户返利 {formatPercent(tier.customerRebateRate)}，适合{tier.type === 'enterprise' ? '有行业客户资源的公司或团队' : '个人顾问、销售和自媒体'}。</p>
            <ul>
              {[...tier.requirements, ...tier.benefits].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="step-head">
          <div className="step-no">03</div>
          <div>
            <h2>客户线索与佣金</h2>
            <p className="hint" style={{ margin: 0 }}>
              这里记录代理人自己登记的客户，后续可接管理员结算审核。
            </p>
          </div>
        </div>

        {overview?.referrals.length === 0 ? (
          <div className="empty-tip">暂无线索记录。</div>
        ) : (
          <div className="agent-referral-list">
            {overview?.referrals.map((referral) => (
              <div className="agent-referral-row" key={referral.id}>
                <div>
                  <strong>{referral.customerName}</strong>
                  <span>
                    {referral.customerEmail || '未填联系方式'} · {formatTime(referral.createdAt)}
                  </span>
                </div>
                <div>
                  <span>{formatMoney(referral.rechargeCents)}</span>
                  <strong>{formatMoney(referral.commissionCents)}</strong>
                </div>
                <em data-status={referral.status}>{REFERRAL_STATUS_LABELS[referral.status]}</em>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
