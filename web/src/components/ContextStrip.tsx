import React from 'react';
import { Indicator } from '../types';

interface Props {
  indicators: Indicator[];
  onSelect: (id: string) => void;
}

const STATE_COLORS: Record<string, { dot: string; text: string }> = {
  green:   { dot: '#16a34a', text: '#16a34a' },
  amber:   { dot: '#d97706', text: '#d97706' },
  red:     { dot: '#dc2626', text: '#dc2626' },
  unknown: { dot: '#94a3b8', text: '#94a3b8' },
};

export function ContextStrip({ indicators, onSelect }: Props) {
  const contextIndicators = indicators.filter(i => i.category === 'context');
  if (contextIndicators.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 14, paddingBottom: 10,
        borderBottom: '1px solid rgba(15,23,42,0.07)',
      }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>◈</span>
        <h2 style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 13, fontWeight: 700,
          color: '#475569',
          textTransform: 'uppercase', letterSpacing: '0.8px',
        }}>Context Indicators</h2>
        <span style={{
          fontSize: 10.5, color: '#94a3b8',
          background: 'rgba(15,23,42,0.04)',
          padding: '2px 8px', borderRadius: 5, marginLeft: 4,
          border: '1px solid rgba(15,23,42,0.06)',
        }}>Display only — not in composite</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {contextIndicators.map(ind => {
          const state  = ind.reading?.state ?? 'unknown';
          const colors = STATE_COLORS[state];

          return (
            <div
              key={ind.id}
              onClick={() => onSelect(ind.id)}
              style={{
                background: '#ffffff',
                border: '1px solid rgba(15,23,42,0.08)',
                borderRadius: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex', alignItems: 'center', gap: 12,
                flex: '1 1 190px', minWidth: 175,
                boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = colors.dot + '44';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 14px rgba(15,23,42,0.1)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(15,23,42,0.08)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(15,23,42,0.06)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
              }}
            >
              {/* State dot */}
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: colors.dot,
                boxShadow: ind.reading ? `0 0 5px ${colors.dot}88` : 'none',
                flexShrink: 0,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, color: '#94a3b8', marginBottom: 2, letterSpacing: '0.3px' }}>{ind.id}</div>
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  color: '#0f172a', marginBottom: 4,
                  fontFamily: "'Outfit', sans-serif",
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{ind.name}</div>

                {ind.reading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: colors.text, fontFamily: "'Outfit', sans-serif" }}>
                      {ind.reading.rawValue !== null
                        ? `${ind.reading.rawValue}${ind.unit === '%' ? '%' : ind.unit ? ` ${ind.unit}` : ''}`
                        : '—'}
                    </span>
                    {ind.reading.freshness === 'stale' && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: '#94a3b8', background: 'rgba(15,23,42,0.05)',
                        padding: '1px 5px', borderRadius: 3,
                        textTransform: 'uppercase', border: '1px solid rgba(15,23,42,0.07)',
                      }}>stale</span>
                    )}
                  </div>
                )}
                {!ind.reading && (
                  <div style={{ fontSize: 11.5, color: '#94a3b8' }}>No data</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
