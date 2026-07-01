import React, { useEffect, useState, useCallback } from 'react';
import { BubbleGauge }   from './components/BubbleGauge';
import { IndicatorCard } from './components/IndicatorCard';
import { HistoryChart }  from './components/HistoryChart';
import { ContextStrip }  from './components/ContextStrip';
import { HealthPage }    from './components/HealthPage';
import { HowToRead }     from './components/HowToRead';
import { C3ReviewQueue } from './components/C3ReviewQueue';
import { fetchDashboard, triggerRefresh } from './api';
import { DashboardData } from './types';

type Tab = 'dashboard' | 'health' | 'howto';

function App() {
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<Tab>('dashboard');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [refreshing, setRefreshing]      = useState(false);
  const [lastUpdated, setLastUpdated]    = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [showC3Queue, setShowC3Queue]    = useState(false);
  const [c3PendingCount, setC3PendingCount] = useState(0);
  const [showAbout, setShowAbout]        = useState(false);

  const loadData = useCallback(() => {
    setLoading(prev => !data ? true : prev);
    fetchDashboard()
      .then(d => {
        setData(d);
        setLastUpdated(new Date());
        setError(null);
        // Pulse for 2 seconds on each successful refresh
        setJustRefreshed(true);
        setTimeout(() => setJustRefreshed(false), 2000);
      })
      .catch(err => setError(err.message ?? 'Failed to load dashboard data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60 * 1000); // auto-refresh every 1 min
    return () => clearInterval(interval);
  }, [loadData]);

  // Poll for pending C3 entries count (every 5 min)
  useEffect(() => {
    const fetchC3Count = () => {
      const token = localStorage.getItem('adminToken') || 'GR8CXZLL9NXZO4IO';
      fetch('/api/c3/pending', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then((entries: unknown[]) => setC3PendingCount(entries.length))
        .catch(() => {});
    };
    fetchC3Count();
    const interval = setInterval(fetchC3Count, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    const token = localStorage.getItem('adminToken') || 'GR8CXZLL9NXZO4IO';
    setRefreshing(true);
    try {
      await triggerRefresh(token);
      setTimeout(loadData, 2000);
    } catch { console.warn('Refresh failed'); }
    finally { setRefreshing(false); }
  };

  const handleCardClick = (id: string) => {
    setHistoryId(id);
  };

  const warnings  = data?.indicators.filter(i => i.category === 'warning')  ?? [];
  const allclears = data?.indicators.filter(i => i.category === 'allclear') ?? [];
  const context   = data?.indicators.filter(i => i.category === 'context')  ?? [];

  const TAB_CONFIG: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard'     },
    { id: 'health',    icon: '🔧', label: 'System Health' },
    { id: 'howto',     icon: '📖', label: 'How To Read'   },
  ];

  return (
    <div className="app-wrapper">
      <div className="app-container">

        {/* ─── Header ─────────────────────────────────────────────── */}
        <header className="app-header">
          <div className="app-header-brand">
            <div className="app-header-logo">🌡</div>
            <div>
              <h1>AI Bubble Pressure Monitor</h1>
              <div className="app-header-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {justRefreshed && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#16a34a',
                    display: 'inline-block',
                    boxShadow: '0 0 6px #16a34a',
                    animation: 'pulse-dot 1s ease-in-out 2',
                    flexShrink: 0,
                  }} />
                )}
                {lastUpdated
                  ? justRefreshed
                    ? `Updated just now`
                    : `Updated automatically at ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Connecting to server...'}
              </div>
            </div>
          </div>

          <div className="app-header-actions">
            <span className="header-badge">Educational Only</span>
            <button
              className="btn btn-ghost"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Force-refresh all data adapters (requires admin token)"
              id="refresh-btn"
              style={{ gap: 6 }}
            >
              <span style={{
                display: 'inline-block',
                animation: refreshing ? 'spin 0.7s linear infinite' : 'none',
              }}>⟳</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* ─── Nav Tabs ───────────────────────────────────────────── */}
        <nav className="app-nav">
          {TAB_CONFIG.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            id={`tab-${t.id}`}
          >
            <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
          </button>
        ))}
        {/* C3 review queue button with pending badge */}
        <button
          className="nav-tab"
          onClick={() => setShowC3Queue(true)}
          id="tab-c3-queue"
          style={{ marginLeft: 'auto', position: 'relative' }}
          title="C3 Circular-Financing review queue"
        >
          <span style={{ marginRight: 5 }}>🔍</span>C3 Queue
          {c3PendingCount > 0 && (
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: 16, height: 16, borderRadius: '50%',
              background: '#dc2626', color: '#fff',
              fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}>{c3PendingCount}</span>
          )}
        </button>
        </nav>

        {/* ─── Loading ────────────────────────────────────────────── */}
        {loading && (
          <div className="loading-screen" style={{ minHeight: 400 }}>
            <div className="loading-spinner" />
            <p style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 500 }}>
              Fetching indicator data…
            </p>
          </div>
        )}

        {/* ─── Error ──────────────────────────────────────────────── */}
        {error && !loading && (
          <div style={{ marginBottom: 24 }}>
            <div className="error-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <strong>Could not connect to the API server.</strong>
                <br />
                Make sure the server is running on port 3001.
                <span style={{ color: '#ef4444', marginLeft: 4 }}>{error}</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── Dashboard Tab ──────────────────────────────────────── */}
        {tab === 'dashboard' && !loading && data && (
          <div className="fade-in">

            {/* About This Tool Banner */}
            <div style={{
              background: '#ffffff',
              border: '1px solid rgba(181,136,42,0.22)',
              borderRadius: 16,
              padding: '18px 22px',
              marginBottom: 28,
              boxShadow: '0 4px 16px rgba(181,136,42,0.05)',
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setShowAbout(!showAbout)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 17 }}>💡</span>
                  <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14.5, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    About This Tool
                  </h3>
                </div>
                <span style={{ fontSize: 12, color: '#b5882a', fontWeight: 600 }}>
                  {showAbout ? 'Hide ▴' : 'Read more ▾'}
                </span>
              </div>
              {showAbout && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(181,136,42,0.15)', fontSize: 13.5, color: '#475569', lineHeight: 1.7 }}>
                  Every so often, an exciting new invention comes along and everyone rushes to invest in it. It happened with trains in the 1800s, radio in the 1920s, and the internet in the late 1990s. Each time, the invention was real and changed the world — but people got so excited that prices climbed way too high, and those who paid the most lost a lot when things calmed down. Now the same thing may be happening with AI. So there's one big question: is this a bubble, and if it is, how close are we to the moment it pops? This tool was built to help answer that using real facts, not just gut feeling. It watches a set of simple "warning lights" (signs the boom might be getting too hot) and "all-clear lights" (signs it's healthy and real), checks each one using trusted data, and adds them up into a single score you can follow over time. It's here to help you think clearly — it's not a crystal ball, and it's not financial advice. The goal is simple: to let anyone, expert or not, see where things stand today, understand why, and decide for themselves.
                </div>
              )}
            </div>

            {/* Bubble Gauge */}
            <BubbleGauge composite={data.composite} />

            {/* Two-column indicator grid */}
            <div className="indicator-grid">

              {/* Warning column */}
              <div className="indicator-column">
                <div className="column-header">
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: 'rgba(220,38,38,0.08)',
                    border: '1px solid rgba(220,38,38,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0,
                  }}>⚠️</div>
                  <h2>Warning Lights</h2>
                  {/* Mini status dots */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                    {warnings.map(w => (
                      <div key={w.id} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: w.reading?.state === 'red'   ? '#dc2626'
                          : w.reading?.state === 'amber' ? '#d97706'
                          : w.reading?.state === 'green' ? '#16a34a'
                          : '#94a3b8',
                        boxShadow: w.reading?.state === 'red' ? '0 0 4px #dc2626'
                          : w.reading?.state === 'green' ? '0 0 4px #16a34a' : 'none',
                      }} title={`${w.id}: ${w.reading?.state ?? 'unknown'}`} />
                    ))}
                  </div>
                </div>
                {warnings.map(w => (
                  <IndicatorCard key={w.id} indicator={w} onClick={handleCardClick} />
                ))}
              </div>

              {/* All-clear column */}
              <div className="indicator-column">
                <div className="column-header">
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: 'rgba(22,163,74,0.08)',
                    border: '1px solid rgba(22,163,74,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0,
                  }}>✅</div>
                  <h2>All-Clear Lights</h2>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                    {allclears.map(g => (
                      <div key={g.id} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: g.reading?.state === 'red'   ? '#dc2626'
                          : g.reading?.state === 'amber' ? '#d97706'
                          : g.reading?.state === 'green' ? '#16a34a'
                          : '#94a3b8',
                        boxShadow: g.reading?.state === 'green' ? '0 0 4px #16a34a' : 'none',
                      }} title={`${g.id}: ${g.reading?.state ?? 'unknown'}`} />
                    ))}
                  </div>
                </div>
                {allclears.map(g => (
                  <IndicatorCard key={g.id} indicator={g} onClick={handleCardClick} />
                ))}
              </div>
            </div>

            {/* Context strip */}
            <ContextStrip indicators={context} onSelect={handleCardClick} />

            {/* Footer */}
            <footer style={{
              borderTop: '1px solid rgba(15,23,42,0.07)',
              paddingTop: 24, marginTop: 8,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              alignItems: 'center',
            }}>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
                <strong style={{ color: '#475569' }}>AI Bubble Pressure Monitor</strong> — Educational heuristic tool, not investment advice.
                {' '}Tiers: <span style={{ color: '#16a34a', fontWeight: 600 }}>auto</span> (live API) ·
                <span style={{ color: '#d97706', fontWeight: 600 }}> semi</span> (scraped) ·
                <span style={{ color: '#7c3aed', fontWeight: 600 }}> seeded</span> (auto-refreshed).
                {' '}Stale indicators are excluded from the composite score.
              </p>
              <p style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'right', lineHeight: 1.6, whiteSpace: 'nowrap' }}>
                FRED · EDGAR · Alpha Vantage<br />
                US Census · Auto-seeded baselines
              </p>
            </footer>
          </div>
        )}

        {/* ─── Health Tab ─────────────────────────────────────────── */}
        {tab === 'health' && <HealthPage />}

        {/* ─── How To Read Tab ────────────────────────────────────── */}
        {tab === 'howto' && (
          <div className="fade-in"><HowToRead /></div>
        )}

      </div>

      {/* ─── Modals ─────────────────────────────────────────────── */}
      {historyId && (
        <HistoryChart indicatorId={historyId} onClose={() => setHistoryId(null)} />
      )}

      {showC3Queue && (
        <C3ReviewQueue
          onClose={() => { setShowC3Queue(false); setC3PendingCount(0); }}
        />
      )}

    </div>
  );
}

export default App;
