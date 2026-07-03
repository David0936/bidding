import { useEffect, useState } from 'react';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import DuplicateCheckPage from './pages/DuplicateCheckPage';
import BillingPage from './pages/BillingPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import ProjectManagementPage from './pages/ProjectManagementPage';
import RejectionCheckPage from './pages/RejectionCheckPage';
import WorkspacePage from './pages/WorkspacePage';
import { IconDocumentText, IconSettings, IconWallet } from './components/Icons';
import { api } from './api';
import type { AuthProfile } from './types';

type Tab = 'home' | 'projects' | 'knowledge' | 'duplicate' | 'rejection' | 'billing' | 'admin';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [adminStandalone, setAdminStandalone] = useState(false);
  const [workspaceProjectId, setWorkspaceProjectId] = useState('');
  // 优先使用 public/logo.png 官方 logo；不存在时回退到「易」字印章占位。
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        api.clearAuthToken();
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setTab('home');
  }

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="page-header">
            <h1>中集易标</h1>
            <p>加载客户账户…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    if (adminStandalone) {
      return (
        <div className="standalone-admin">
          <main className="main">
            <AdminPage onBackToCustomer={() => setAdminStandalone(false)} />
          </main>
        </div>
      );
    }
    return <AuthPage onAuthenticated={setUser} onAdminEntry={() => setAdminStandalone(true)} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          {logoOk ? (
            <img
              className="brand-logo"
              src="/logo.png"
              alt="中集易标 easy bidding"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div className="logo">
              <span className="logo-monogram">易</span>
            </div>
          )}
          <div>
            <div className="title">中集易标</div>
            <div className="subtitle">easy bidding</div>
          </div>
        </div>

        <button
          type="button"
          className={`nav-item ${tab === 'home' ? 'active' : ''}`}
          onClick={() => setTab('home')}
        >
          <IconDocumentText />
          <span>写标书</span>
        </button>
        <button
          type="button"
          className={`nav-item ${tab === 'projects' ? 'active' : ''}`}
          onClick={() => setTab('projects')}
        >
          <IconDocumentText />
          <span>项目管理</span>
        </button>
        <button
          type="button"
          className={`nav-item ${tab === 'duplicate' ? 'active' : ''}`}
          onClick={() => setTab('duplicate')}
        >
          <IconDocumentText />
          <span>标书查重</span>
        </button>
        <button
          type="button"
          className={`nav-item ${tab === 'knowledge' ? 'active' : ''}`}
          onClick={() => setTab('knowledge')}
        >
          <IconDocumentText />
          <span>知识库</span>
        </button>
        <button
          type="button"
          className={`nav-item ${tab === 'rejection' ? 'active' : ''}`}
          onClick={() => setTab('rejection')}
        >
          <IconDocumentText />
          <span>废标项检查</span>
        </button>
        <button
          type="button"
          className={`nav-item ${tab === 'billing' ? 'active' : ''}`}
          onClick={() => setTab('billing')}
        >
          <IconWallet />
          <span>额度中心</span>
        </button>
        <div className="nav-spacer" />
        <button
          type="button"
          className={`nav-item ${tab === 'admin' ? 'active' : ''}`}
          onClick={() => setTab('admin')}
        >
          <IconSettings />
          <span>管理员后台</span>
        </button>
        <div className="account-chip">
          <strong>{user.displayName}</strong>
          <span>{user.email}</span>
          <button type="button" className="link-btn" onClick={handleLogout}>
            退出登录
          </button>
        </div>
        <div className="subtitle" style={{ padding: '0 10px' }}>
          v0.1.0 · 中集数科
        </div>
      </aside>

      <main className="main">
        {tab === 'home' && <WorkspacePage onGoSettings={() => setTab('admin')} openProjectId={workspaceProjectId} />}
        {tab === 'projects' && (
          <ProjectManagementPage
            onOpenProject={(projectId) => {
              setWorkspaceProjectId(projectId);
              setTab('home');
            }}
          />
        )}
        {tab === 'knowledge' && <KnowledgeBasePage onGoSettings={() => setTab('admin')} />}
        {tab === 'duplicate' && <DuplicateCheckPage />}
        {tab === 'rejection' && <RejectionCheckPage onGoSettings={() => setTab('admin')} />}
        {tab === 'billing' && <BillingPage />}
        {tab === 'admin' && <AdminPage />}
      </main>
    </div>
  );
}
