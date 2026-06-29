import { useState } from 'react';
import SettingsPage from './pages/SettingsPage';
import HomePage from './pages/HomePage';

type Tab = 'home' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">智</div>
          <div>
            <div className="title">智标 BidForge</div>
            <div className="subtitle">AI 标书写作工具</div>
          </div>
        </div>

        <div
          className={`nav-item ${tab === 'home' ? 'active' : ''}`}
          onClick={() => setTab('home')}
        >
          📝 标书工作台
        </div>
        <div
          className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          ⚙️ 设置
        </div>

        <div className="nav-spacer" />
        <div className="subtitle" style={{ padding: '0 10px' }}>
          v0.1.0 · 原创开源
        </div>
      </aside>

      <main className="main">
        {tab === 'home' ? <HomePage onGoSettings={() => setTab('settings')} /> : <SettingsPage />}
      </main>
    </div>
  );
}
