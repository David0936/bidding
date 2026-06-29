import { useState } from 'react';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import { IconDocumentText, IconSettings } from './components/Icons';

type Tab = 'home' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  // 优先使用 public/logo.png 官方 logo；不存在时回退到「易」字印章占位
  const [logoOk, setLogoOk] = useState(true);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          {logoOk ? (
            <img
              className="brand-logo"
              src="/logo.png"
              alt="易标 easy bidding"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <div className="logo">
              <span className="logo-monogram">易</span>
            </div>
          )}
          <div>
            <div className="title">易标</div>
            <div className="subtitle">easy bidding</div>
          </div>
        </div>

        <div
          className={`nav-item ${tab === 'home' ? 'active' : ''}`}
          onClick={() => setTab('home')}
        >
          <IconDocumentText />
          <span>标书工作台</span>
        </div>
        <div
          className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <IconSettings />
          <span>设置</span>
        </div>

        <div className="nav-spacer" />
        <div className="subtitle" style={{ padding: '0 10px' }}>
          v0.1.0 · 中集数科
        </div>
      </aside>

      <main className="main">
        {tab === 'home' ? <WorkspacePage onGoSettings={() => setTab('settings')} /> : <SettingsPage />}
      </main>
    </div>
  );
}
