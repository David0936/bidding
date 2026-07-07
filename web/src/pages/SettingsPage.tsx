// 设置页：配置 AI 模型。同时支持 OpenAI 兼容与 Claude 两种格式，可分别填写并测试连通。
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type {
  BidderProfile,
  DesktopPlatform,
  DesktopUpdateResult,
  ProviderType,
  RedactedAIConfig,
  TestResult,
} from '../types';
import {
  IconCheckCircle,
  IconCircle,
  IconAlertTriangle,
  IconSave,
  IconPlug,
  IconThermometer,
  IconDownload,
} from '../components/Icons';

const PRESETS = {
  openai: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  claude: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
};

const EMPTY_BIDDER_PROFILE: BidderProfile = {
  companyName: '',
  unifiedSocialCreditCode: '',
  address: '',
  phone: '',
  bankName: '',
  bankAccount: '',
  legalRep: {
    name: '',
    idNo: '',
    phone: '',
  },
  agent: {
    name: '',
    idNo: '',
    phone: '',
    email: '',
  },
};

function platformText(platform?: DesktopPlatform) {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform ?? '未知';
}

function updateResultText(result: DesktopUpdateResult) {
  if (!result.ok) {
    return result.message ?? '检查更新失败';
  }

  const version = result.updateInfo?.version;
  if (version) {
    return `发现可用版本 ${version}。后续发布流程会接入下载、签名校验与安装确认。`;
  }

  return '已完成检查，当前暂无可用更新。';
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [savedTip, setSavedTip] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<DesktopUpdateResult | null>(null);
  const [bidderProfile, setBidderProfile] = useState<BidderProfile>(EMPTY_BIDDER_PROFILE);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedTip, setProfileSavedTip] = useState(false);
  const [profileError, setProfileError] = useState('');

  // 表单状态
  const [provider, setProvider] = useState<ProviderType>('openai');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(PRESETS.openai.baseUrl);
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(PRESETS.openai.model);
  const [claudeBaseUrl, setClaudeBaseUrl] = useState(PRESETS.claude.baseUrl);
  const [claudeKey, setClaudeKey] = useState('');
  const [claudeModel, setClaudeModel] = useState(PRESETS.claude.model);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // 已保存的 Key 标记（用于占位提示）
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [claudeKeySet, setClaudeKeySet] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((cfg: RedactedAIConfig) => {
        setProvider(cfg.provider);
        setOpenaiBaseUrl(cfg.openai.baseUrl);
        setOpenaiModel(cfg.openai.model);
        setClaudeBaseUrl(cfg.claude.baseUrl);
        setClaudeModel(cfg.claude.model);
        setTemperature(cfg.temperature);
        setMaxTokens(cfg.maxTokens);
        setOpenaiKeySet(cfg.openaiKeySet);
        setClaudeKeySet(cfg.claudeKeySet);
      })
      .catch(() => {
        /* 使用默认值 */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const bridge = window.easyBiddingDesktop;
    if (!bridge) return;

    bridge
      .getVersion()
      .then(setDesktopVersion)
      .catch(() => setDesktopVersion(null));
  }, []);

  useEffect(() => {
    api
      .getBidderProfile()
      .then((profile) => setBidderProfile({ ...EMPTY_BIDDER_PROFILE, ...profile }))
      .catch((e) => setProfileError(e instanceof Error ? e.message : String(e)));
  }, []);

  const payload = useMemo(
    () => ({
      provider,
      openai: { baseUrl: openaiBaseUrl, apiKey: openaiKey, model: openaiModel },
      claude: { baseUrl: claudeBaseUrl, apiKey: claudeKey, model: claudeModel },
      temperature,
      maxTokens,
    }),
    [
      provider,
      openaiBaseUrl,
      openaiKey,
      openaiModel,
      claudeBaseUrl,
      claudeKey,
      claudeModel,
      temperature,
      maxTokens,
    ],
  );

  async function handleSave() {
    setSaving(true);
    setSavedTip(false);
    try {
      const cfg = await api.saveSettings(payload);
      setOpenaiKeySet(cfg.openaiKeySet);
      setClaudeKeySet(cfg.claudeKeySet);
      // 保存后清空明文输入框，改用「已设置」占位
      setOpenaiKey('');
      setClaudeKey('');
      setSavedTip(true);
      setTimeout(() => setSavedTip(false), 2500);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection(payload);
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleCheckUpdates() {
    const bridge = window.easyBiddingDesktop;
    if (!bridge) return;

    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const result = await bridge.checkForUpdates();
      setUpdateResult(result);
    } catch (e) {
      setUpdateResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCheckingUpdate(false);
    }
  }

  function patchBidderProfile(patch: Partial<BidderProfile>) {
    setBidderProfile((profile) => ({ ...profile, ...patch }));
  }

  function patchBidderPerson(
    key: 'legalRep' | 'agent',
    patch: Partial<BidderProfile['legalRep'] & BidderProfile['agent']>,
  ) {
    setBidderProfile((profile) => ({
      ...profile,
      [key]: { ...profile[key], ...patch },
    }));
  }

  async function handleSaveBidderProfile() {
    setProfileSaving(true);
    setProfileError('');
    setProfileSavedTip(false);
    try {
      const profile = await api.saveBidderProfile(bidderProfile);
      setBidderProfile({ ...EMPTY_BIDDER_PROFILE, ...profile });
      setProfileSavedTip(true);
      setTimeout(() => setProfileSavedTip(false), 2500);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-header">
        <h1>设置</h1>
        <p>加载中…</p>
      </div>
    );
  }

  const isOpenai = provider === 'openai';
  const keySet = isOpenai ? openaiKeySet : claudeKeySet;
  const desktopBridge = window.easyBiddingDesktop;

  return (
    <div>
      <div className="page-header">
        <h1>设置</h1>
        <p>配置 AI 模型。API Key 仅保存在本机，不上传任何服务器。</p>
      </div>

      <div className="card">
        <h2>AI 模型</h2>
        <p className="hint">两种格式都可填写，通过上方切换当前启用的提供方。</p>

        <div className="provider-tabs">
          <button
            className={isOpenai ? 'active' : ''}
            onClick={() => setProvider('openai')}
          >
            OpenAI 兼容
          </button>
          <button
            className={!isOpenai ? 'active' : ''}
            onClick={() => setProvider('claude')}
          >
            Claude
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span className={`badge ${keySet ? 'badge-on' : 'badge-off'}`}>
            {keySet ? <IconCheckCircle /> : <IconCircle />}
            {keySet ? '当前提供方 Key 已设置' : '当前提供方 Key 未设置'}
          </span>
        </div>

        {isOpenai ? (
          <>
            <div className="field">
              <label>接口地址 Base URL</label>
              <input
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
              />
              <div className="desc">
                兼容 OpenAI 的 /chat/completions 接口。如 DeepSeek、火山方舟、Moonshot、本地 Ollama 等。
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>模型名称</label>
                <input
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  placeholder="deepseek-chat"
                />
              </div>
              <div className="field">
                <label>API Key</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={openaiKeySet ? '已设置（如需修改请重新输入）' : 'sk-...'}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>接口地址 Base URL</label>
              <input
                value={claudeBaseUrl}
                onChange={(e) => setClaudeBaseUrl(e.target.value)}
                placeholder="https://api.anthropic.com"
              />
              <div className="desc">
                Anthropic Messages 接口（/v1/messages）。也可填写兼容 Claude 协议的中转地址。
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>模型名称</label>
                <input
                  value={claudeModel}
                  onChange={(e) => setClaudeModel(e.target.value)}
                  placeholder="claude-sonnet-4-6"
                />
              </div>
              <div className="field">
                <label>API Key</label>
                <input
                  type="password"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder={claudeKeySet ? '已设置（如需修改请重新输入）' : 'sk-ant-...'}
                />
              </div>
            </div>
          </>
        )}

        <div className="row">
          <div className="field">
            <label>
              <IconThermometer />
              采样温度 temperature
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
            <div className="desc">0 更稳定严谨，1 更有创造性。标书建议 0.5~0.8。</div>
          </div>
          <div className="field">
            <label>单次最大 token</label>
            <input
              type="number"
              step="256"
              min="256"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
            />
            <div className="desc">单次回复上限，影响章节生成长度。</div>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <IconSave />
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button className="btn btn-ghost" onClick={handleTest} disabled={testing}>
            <IconPlug />
            {testing ? '测试中…' : '测试连通'}
          </button>
          {savedTip && (
            <span className="badge badge-on">
              <IconCheckCircle />
              已保存
            </span>
          )}
        </div>

        {testResult && (
          <div className={`result ${testResult.ok ? 'ok' : 'err'}`}>
            {testResult.ok ? <IconCheckCircle /> : <IconAlertTriangle />}
            <span>
              {testResult.ok
                ? `连通成功（${testResult.provider} · ${testResult.model}）\n模型回复：${testResult.reply}`
                : `连通失败：${testResult.message}`}
            </span>
          </div>
        )}
      </div>

      <div className="card">
        <h2>投标主体档案</h2>
        <p className="hint">用于自动填写授权书、投标函、声明函、报价表等格式文书，字段可按项目逐步补齐。</p>

        <div className="field">
          <label>投标单位名称</label>
          <input
            value={bidderProfile.companyName}
            onChange={(e) => patchBidderProfile({ companyName: e.target.value })}
            placeholder="例如：广州茂海信息科技有限公司"
          />
        </div>
        <div className="row">
          <div className="field">
            <label>统一社会信用代码</label>
            <input
              value={bidderProfile.unifiedSocialCreditCode}
              onChange={(e) => patchBidderProfile({ unifiedSocialCreditCode: e.target.value })}
            />
          </div>
          <div className="field">
            <label>联系电话</label>
            <input value={bidderProfile.phone} onChange={(e) => patchBidderProfile({ phone: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>注册地址/通讯地址</label>
          <input value={bidderProfile.address} onChange={(e) => patchBidderProfile({ address: e.target.value })} />
        </div>
        <div className="row">
          <div className="field">
            <label>开户银行</label>
            <input value={bidderProfile.bankName} onChange={(e) => patchBidderProfile({ bankName: e.target.value })} />
          </div>
          <div className="field">
            <label>银行账号</label>
            <input value={bidderProfile.bankAccount} onChange={(e) => patchBidderProfile({ bankAccount: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>法定代表人</label>
            <input value={bidderProfile.legalRep.name} onChange={(e) => patchBidderPerson('legalRep', { name: e.target.value })} />
          </div>
          <div className="field">
            <label>法人身份证号</label>
            <input value={bidderProfile.legalRep.idNo} onChange={(e) => patchBidderPerson('legalRep', { idNo: e.target.value })} />
          </div>
          <div className="field">
            <label>法人电话</label>
            <input value={bidderProfile.legalRep.phone} onChange={(e) => patchBidderPerson('legalRep', { phone: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>授权代表</label>
            <input value={bidderProfile.agent.name} onChange={(e) => patchBidderPerson('agent', { name: e.target.value })} />
          </div>
          <div className="field">
            <label>代表身份证号</label>
            <input value={bidderProfile.agent.idNo} onChange={(e) => patchBidderPerson('agent', { idNo: e.target.value })} />
          </div>
          <div className="field">
            <label>代表电话</label>
            <input value={bidderProfile.agent.phone} onChange={(e) => patchBidderPerson('agent', { phone: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>授权代表邮箱</label>
          <input value={bidderProfile.agent.email} onChange={(e) => patchBidderPerson('agent', { email: e.target.value })} />
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={handleSaveBidderProfile} disabled={profileSaving}>
            <IconSave />
            {profileSaving ? '保存中…' : '保存投标主体档案'}
          </button>
          {profileSavedTip && (
            <span className="badge badge-on">
              <IconCheckCircle />
              已保存
            </span>
          )}
        </div>
        {profileError && (
          <div className="result err">
            <IconAlertTriangle />
            <span>{profileError}</span>
          </div>
        )}
      </div>

      {desktopBridge && (
        <div className="card">
          <h2>桌面应用</h2>
          <p className="hint">桌面版使用本机用户数据目录，并保留 GitHub 发布通道的更新检查能力。</p>

          <div className="desktop-meta">
            <div className="desktop-meta-item">
              <span>当前版本</span>
              <strong>{desktopVersion ?? '读取中'}</strong>
            </div>
            <div className="desktop-meta-item">
              <span>运行平台</span>
              <strong>{platformText(desktopBridge.platform)}</strong>
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-ghost" onClick={handleCheckUpdates} disabled={checkingUpdate}>
              <IconDownload />
              {checkingUpdate ? '检查中…' : '检查更新'}
            </button>
          </div>

          {updateResult && (
            <div className={`result ${updateResult.ok ? 'ok' : 'err'}`}>
              {updateResult.ok ? <IconCheckCircle /> : <IconAlertTriangle />}
              <span>{updateResultText(updateResult)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
