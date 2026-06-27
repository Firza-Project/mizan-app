import { useState, useEffect } from 'react';
import MobileEmulator from './components/MobileEmulator';
import { initDB, syncFromSupabase } from './services/db';

export default function App() {
  const [theme, setTheme] = useState(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  // Initialize localStorage DB
  useEffect(() => {
    initDB();

    // Background sync from Supabase on startup
    const runSync = async () => {
      await syncFromSupabase();
    };
    runSync();

    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className="app-portal-wrapper" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      {/* Top Header Bar */}
      <header className="app-portal-header">
        <div className="portal-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontWeight: 'bold', fontFamily: 'var(--font-serif)' }}>
          <img src="/logo.png" alt="Mizan Logo" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
          Mizan App
        </div>
        <button onClick={toggleTheme} className="theme-toggle-btn">
          {theme === 'light' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      {/* Main Content Dashboard */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
        <MobileEmulator />
      </main>
    </div>
  );
}
