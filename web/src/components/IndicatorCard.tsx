import React, { useState } from 'react';
import { Indicator } from '../types';

interface Props {
  indicator: Indicator;
  onClick?: (id: string) => void;
}

const STATE_CONFIG = {
  green:   { color: '#16a34a', bg: 'rgba(22,163,74,0.07)',   border: 'rgba(22,163,74,0.22)',   label: 'Healthy'  },
  amber:   { color: '#d97706', bg: 'rgba(217,119,6,0.07)',   border: 'rgba(217,119,6,0.22)',   label: 'Caution'  },
  red:     { color: '#dc2626', bg: 'rgba(220,38,38,0.06)',   border: 'rgba(220,38,38,0.2)',    label: 'Elevated' },
  unknown: { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.18)', label: 'No Data'  },
};

const TREND_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  up:      { icon: '↑', color: '#dc2626', label: 'Risk rising'  },
  down:    { icon: '↓', color: '#16a34a', label: 'Risk falling' },
  flat:    { icon: '→', color: '#94a3b8', label: 'Flat'         },
  unknown: { icon: '·', color: '#94a3b8', label: 'Unknown'      },
};

function formatDate(dateStr: string): string {
  const d    = new Date(dateStr);
  const now  = Date.now();
  const diffH = (now - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 1)     return 'just now';
  if (diffH < 24)    return `${Math.floor(diffH)}h ago`;
  if (diffH < 24*7)  return `${Math.floor(diffH / 24)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRawValue(value: number | null, unit?: string): string {
  if (value === null) return '—';
  const fmt = Number.isInteger(value) ? value.toString() : value.toFixed(2);
  return unit ? `${fmt}${unit === '%' ? '%' : ` ${unit}`}` : fmt;
}

export function IndicatorCard({ indicator, onClick }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const state     = indicator.reading?.state ?? 'unknown';
  const cfg       = STATE_CONFIG[state];
  const freshness = indicator.reading?.freshness ?? 'stale';
  const isStale   = freshness === 'stale';
  const trend     = indicator.reading?.trend ?? 'unknown';
  const trendCfg  = TREND_ICONS[trend];

  return (
    <div
      onClick={() => onClick?.(indicator.id)}
      style={{
        background: isStale ? '#fafafa' : '#ffffff',
        border: `1px solid ${isStale ? 'rgba(15,23,42,0.06)' : cfg.border}`,
        borderRadius: 14,
        padding: '15px 18px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        opacity: isStale ? 0.75 : 1,
        position: 'relative',
        zIndex: showTooltip ? 100 : 1,
        boxShadow: isStale
          ? '0 1px 3px rgba(15,23,42,0.04)'
          : '0 2px 8px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
      }}
      onMouseEnter={e => {
        if (!isStale) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(15,23,42,0.1), 0 2px 6px rgba(15,23,42,0.06)';
          (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color + '55';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = isStale
          ? '0 1px 3px rgba(15,23,42,0.04)'
          : '0 2px 8px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)';
        (e.currentTarget as HTMLDivElement).style.borderColor = isStale ? 'rgba(15,23,42,0.06)' : cfg.border;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Left state accent bar */}
      {!isStale && (
        <div style={{
          position: 'absolute',
          top: 0, bottom: 0, left: 0,
          width: 3,
          background: cfg.color,
          opacity: 0.7,
          borderRadius: '14px 0 0 14px',
        }} />
      )}

      {/* Row 1: ID + badges + tooltip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, paddingLeft: isStale ? 0 : 6 }}>
        {/* State dot */}
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: cfg.color,
          boxShadow: isStale ? 'none' : `0 0 5px ${cfg.color}88`,
          flexShrink: 0,
          animation: (!isStale && state !== 'unknown') ? 'pulse-dot 2.5s ease-in-out infinite' : 'none',
        }} />

        {/* ID chip */}
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '1px 6px', borderRadius: 4,
          background: 'rgba(15,23,42,0.05)',
          color: '#64748b', letterSpacing: '0.5px',
        }}>{indicator.id}</span>

        <span className={`badge badge-${indicator.tier}`}>{indicator.tier}</span>
        {isStale && <span className="badge badge-stale">stale</span>}

        <div style={{ flex: 1 }} />

        {/* Tooltip */}
        <div
          style={{ position: 'relative', cursor: 'help' }}
          onClick={e => e.stopPropagation()}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span style={{ fontSize: 13, color: '#94a3b8' }}>ⓘ</span>
          {showTooltip && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 8px)', right: 0,
              background: '#ffffff',
              border: '1px solid rgba(15,23,42,0.1)',
              borderRadius: 12,
              padding: '12px 14px',
              width: 280, fontSize: 12,
              color: '#475569', lineHeight: 1.5,
              zIndex: 1000,
              boxShadow: '0 12px 40px rgba(15,23,42,0.15)',
            }}>
              <div style={{ color: '#b5882a', fontWeight: 700, marginBottom: 6, fontSize: 11 }}>How it's measured</div>
              <p style={{ marginBottom: 8 }}>{indicator.description}</p>
              {indicator.caveat && (
                <>
                  <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: 4, fontSize: 11 }}>Caveat</div>
                  <p style={{ color: '#94a3b8' }}>{indicator.caveat}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Name */}
      <div style={{
        fontSize: 13.5, fontWeight: 600,
        color: '#0f172a', lineHeight: 1.35,
        marginBottom: 12,
        paddingLeft: isStale ? 0 : 6,
        fontFamily: "'Outfit', sans-serif",
      }}>{indicator.name}</div>

      {/* Row 3: Values */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: isStale ? 0 : 6 }}>
        <div>
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Value</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', fontFamily: "'Outfit', sans-serif" }}>
            {formatRawValue(indicator.reading?.rawValue ?? null, indicator.unit)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: cfg.color, fontFamily: "'Outfit', sans-serif" }}>
            {indicator.reading ? indicator.reading.subScore : '—'}
          </div>
        </div>

        <div style={{
          padding: '3px 9px', borderRadius: 6,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          fontSize: 10.5, fontWeight: 700, color: cfg.color,
          textTransform: 'uppercase', letterSpacing: '0.4px',
        }}>{cfg.label}</div>

        <div style={{ flex: 1 }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          fontSize: 17, fontWeight: 700, color: trendCfg.color,
        }} title={trendCfg.label}>
          {trendCfg.icon}
        </div>
      </div>

      {/* Row 4: Source + date */}
      {indicator.reading && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid rgba(15,23,42,0.06)',
          fontSize: 11, color: '#94a3b8',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          paddingLeft: isStale ? 0 : 6,
        }}>
          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
            {indicator.reading.source}
          </span>
          <span style={{ color: '#cbd5e1' }}>·</span>
          <span>{formatDate(indicator.reading.asOf)}</span>
        </div>
      )}

      {!indicator.reading && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', paddingLeft: isStale ? 0 : 6 }}>
          Awaiting first data fetch — updates automatically on schedule.
        </div>
      )}
    </div>
  );
}
