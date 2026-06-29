import { useState } from 'react';
import { api } from '../api';
import type { AuthProfile } from '../types';
import { IconAlertTriangle, IconCheckCircle, IconPlug } from '../components/Icons';

interface AuthPageProps {
  onAuthenticated: (user: AuthProfile) => void;
  onAdminEntry?: () => void;
}

export default function AuthPage({ onAuthenticated, onAdminEntry }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const user =
        mode === 'register'
          ? await api.register(email, password, displayName)
          : await api.login(email, password);
      setMessage({ ok: true, text: '登录成功' });
      onAuthenticated(user);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand">
          <img src="/logo.png" alt="中集易标 easy bidding" />
          <div>
            <h1>中集易标</h1>
            <p>按量充值的 AI 标书工作台</p>
          </div>
        </div>

        <div className="provider-tabs auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            注册
          </button>
        </div>

        <div className="field">
          <label>邮箱</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
        </div>

        {mode === 'register' && (
          <div className="field">
            <label>客户名称</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="公司或联系人" />
          </div>
        )}

        <div className="field">
          <label>密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '至少 8 位' : '请输入密码'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
          />
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            <IconPlug />
            {submitting ? '处理中…' : mode === 'register' ? '创建账户' : '登录'}
          </button>
          {onAdminEntry && (
            <button className="btn btn-ghost" onClick={onAdminEntry} disabled={submitting}>
              管理员后台
            </button>
          )}
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
