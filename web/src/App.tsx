import { useState } from 'react';
import SettingsPage from './pages/SettingsPage';
import WorkspacePage from './pages/WorkspacePage';
import { IconBrandMark, IconDocumentText, IconSettings } from './components/Icons';

type Tab = 'home' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <IconBrandMark />
          </div>
          <div>
            <div className="title">智标 BidForge</div>
            <div className="subtitle">AI 标书写作系统</div>
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
          v0.1.0
        </div>
      </aside>

      <main className="main">
        {tab === 'home' ? <WorkspacePage onGoSettings={() => setTab('settings')} /> : <SettingsPage />}
      </main>
    </div>
  );
}
