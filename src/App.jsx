import React, { useState, useEffect } from 'react';
import MobileEmulator from './components/MobileEmulator';
import { initDB, syncFromSupabase } from './services/db';

export default function App() {
  const [theme, setTheme] = useState('light');

  // Initialize localStorage DB
  useEffect(() => {
    initDB();

    // Background sync from Supabase on startup
    const runSync = async () => {
      await syncFromSupabase();
    };
    runSync();

    // Default theme based on system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = prefersDark ? 'dark' : 'light';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className="app-portal-wrapper" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      {/* Top Header Bar */}
      <header style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0.8rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 10
      }}>
        <div className="portal-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
          🌙 Mizan App
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
