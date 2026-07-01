import React, { useEffect, useState } from 'react';
import { fetchHealth, fetchJobs } from '../api';

interface AdapterStatus {
  adapter: string;
  status: string;
  lastRun: string | null;
  nextRun: string | null;
  cadenceHours: number;
}


interface IndicatorStatus {
  id: string;
  name: string;
  freshness: 'live' | 'stale';
  asOf: string | null;
}

interface HealthData {
  status: string;
  adapters: AdapterStatus[];
  indicators: IndicatorStatus[];
  timestamp: string;
}

type Job = { id: number; adapter: string; status: string; message: string; ran_at: string };

const ADAPTER_ICONS: Record<string, string> = {
  fred:    '🏛',
  edgar:   '📋',
  prices:  '📈',
  census:  '🏢',
  news:    '📰',
  manual:  '✍️',
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  success:    { color: '#16a34a', bg: 'rgba(22,163,74,0.08)',    border: 'rgba(22,163,74,0.2)',    label: 'Success'  },
  live:       { color: '#16a34a', bg: 'rgba(22,163,74,0.08)',    border: 'rgba(22,163,74,0.2)',    label: 'Live'     },
  error:      { color: '#dc2626', bg: 'rgba(220,38,38,0.07)',    border: 'rgba(220,38,38,0.2)',    label: 'Error'    },
  stale:      { color: '#dc2626', bg: 'rgba(220,38,38,0.07)',    border: 'rgba(220,38,38,0.2)',    label: 'Stale'    },
  partial:    { color: '#d97706', bg: 'rgba(217,119,6,0.08)',    border: 'rgba(217,119,6,0.2)',    label: 'Partial'  },
  never_run:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.18)', label: 'Never Run'},
};

function getStatus(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG['never_run'];
}

function StatusPill({ status }: { status: string }) {
  const cfg = getStatus(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px',
      borderRadius: 999,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      fontSize: 10.5, fontWeight: 700,
      color: cfg.color,
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: cfg.color,
        boxShadow: `0 0 5px ${cfg.color}`,
        display: 'inline-block',
        animation: (status === 'success' || status === 'live') ? 'pulse-dot 2.5s ease-in-out infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const diffH = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 1)  return 'Just now';
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function formatNextRun(nextRunStr: string | null): string {
  if (!nextRunStr) return '—';
  const d = new Date(nextRunStr);
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return 'Overdue';
  const diffH  = diffMs / 3600000;
  const diffM  = diffMs / 60000;
  if (diffM < 60) return `in ${Math.round(diffM)}m`;
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  return `in ${Math.round(diffH / 24)}d`;
}


export function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [jobs, setJobs]     = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchHealth(), fetchJobs()])
      .then(([h, j]) => { setHealth(h as HealthData); setJobs(j as Job[]); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}>
      <div className="loading-spinner" />
    </div>
  );
  if (error) return <div className="error-card" style={{ margin: '24px 0' }}>{error}</div>;
  if (!health) return null;

  const successCount = health.adapters.filter(a => a.status === 'success').length;
  const liveCount    = health.indicators.filter(i => i.freshness === 'live').length;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Overview KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        {[
          { icon: '🔌', label: 'Adapters Online', value: `${successCount} / ${health.adapters.length}`,  color: '#16a34a' },
          { icon: '📡', label: 'Live Indicators', value: `${liveCount} / ${health.indicators.length}`,   color: '#d97706' },
          { icon: '🕐', label: 'Last Checked',    value: formatDate(health.timestamp),                   color: '#475569' },
          { icon: '⚙️', label: 'Server Status',   value: health.status.toUpperCase(),                   color: '#16a34a' },
        ].map(({ icon, label, value, color }) => (
          <div key={label} style={{
            background: '#fff',
            border: '1px solid rgba(15,23,42,0.08)',
            borderRadius: 14, padding: '16px 20px',
            boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
          }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Adapter Status Grid ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h2 style={{
            fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: '#0f172a',
          }}>Data Adapters</h2>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(15,23,42,0.05)', color: '#64748b',
            border: '1px solid rgba(15,23,42,0.08)', fontWeight: 600,
          }}>{health.adapters.length} adapters</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {health.adapters.map(a => {
            const cfg = getStatus(a.status);
            return (
              <div key={a.adapter} style={{
                background: '#fff',
                border: `1px solid ${cfg.border}`,
                borderRadius: 14, padding: '16px 18px',
                boxShadow: '0 2px 8px rgba(15,23,42,0.05)',
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Accent top bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: cfg.color, opacity: 0.5,
                }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 22 }}>{ADAPTER_ICONS[a.adapter] ?? '🔧'}</div>
                  <StatusPill status={a.status} />
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: '#0f172a', textTransform: 'capitalize', marginBottom: 6,
                  fontFamily: "'Outfit', sans-serif",
                }}>{a.adapter}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                  Last: <span style={{ color: '#475569', fontWeight: 600 }}>{formatDate(a.lastRun)}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Next: <span style={{
                    color: a.nextRun && new Date(a.nextRun) < new Date() ? '#dc2626' : '#16a34a',
                    fontWeight: 600,
                  }}>{formatNextRun(a.nextRun)}</span>
                  <span style={{ color: '#cbd5e1', marginLeft: 4 }}>({a.cadenceHours}h cadence)</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Indicator Freshness Table ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
            Indicator Freshness
          </h2>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(15,23,42,0.05)', color: '#64748b',
            border: '1px solid rgba(15,23,42,0.08)', fontWeight: 600,
          }}>{health.indicators.length} indicators</span>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '48px 1fr auto auto',
            gap: 12, padding: '10px 16px',
            background: '#f8fafc',
            borderBottom: '1px solid rgba(15,23,42,0.07)',
            fontSize: 10, fontWeight: 700,
            color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px',
          }}>
            <span>ID</span><span>Indicator</span><span>Status</span><span style={{ textAlign: 'right' }}>As Of</span>
          </div>

          {health.indicators.map((ind, i) => (
            <div key={ind.id} style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr auto auto',
              gap: 12, padding: '11px 16px',
              alignItems: 'center',
              borderBottom: i < health.indicators.length - 1 ? '1px solid rgba(15,23,42,0.05)' : 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <span style={{
                fontSize: 10, fontWeight: 800,
                padding: '2px 6px', borderRadius: 5,
                background: 'rgba(15,23,42,0.05)',
                color: '#475569', letterSpacing: '0.5px',
                display: 'inline-block',
              }}>{ind.id}</span>
              <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{ind.name}</span>
              <StatusPill status={ind.freshness} />
              <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right', fontWeight: 500 }}>
                {formatDate(ind.asOf)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Job Run Log ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
            Recent Job Runs
          </h2>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(15,23,42,0.05)', color: '#64748b',
            border: '1px solid rgba(15,23,42,0.08)', fontWeight: 600,
          }}>last 50</span>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
          maxHeight: 420, overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '20px 130px 1fr 80px',
            gap: 12, padding: '10px 16px',
            background: '#f8fafc',
            borderBottom: '1px solid rgba(15,23,42,0.07)',
            fontSize: 10, fontWeight: 700,
            color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px',
            position: 'sticky', top: 0,
          }}>
            <span></span><span>Job</span><span>Message</span><span style={{ textAlign: 'right' }}>When</span>
          </div>

          {jobs.slice(0, 50).map((job, i) => {
            const cfg = getStatus(job.status);
            return (
              <div key={job.id} style={{
                display: 'grid',
                gridTemplateColumns: '20px 130px 1fr 80px',
                gap: 12, padding: '9px 16px',
                alignItems: 'center',
                borderBottom: i < Math.min(jobs.length, 50) - 1 ? '1px solid rgba(15,23,42,0.04)' : 'none',
                fontSize: 12,
              }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: cfg.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }} />
                <span style={{ color: '#475569', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.adapter}
                </span>
                <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.message}
                </span>
                <span style={{ color: '#94a3b8', textAlign: 'right', fontWeight: 500 }}>
                  {formatDate(job.ran_at)}
                </span>
              </div>
            );
          })}

          {jobs.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No job runs recorded yet.
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
