import React from 'react';
import { CompositeIndex } from '../types';

interface Props {
  composite: CompositeIndex;
}

const STATE_COLORS = {
  green:   { primary: '#16a34a', glow: 'rgba(22,163,74,0.18)',  bg: 'rgba(22,163,74,0.07)',  label: 'Healthy' },
  amber:   { primary: '#d97706', glow: 'rgba(217,119,6,0.18)',  bg: 'rgba(217,119,6,0.07)',  label: 'Caution' },
  red:     { primary: '#dc2626', glow: 'rgba(220,38,38,0.18)',  bg: 'rgba(220,38,38,0.07)',  label: 'Risk'    },
  unknown: { primary: '#94a3b8', glow: 'rgba(148,163,184,0.15)', bg: 'rgba(148,163,184,0.06)', label: 'No Data' },
};

const SIZE   = 260;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R      = 100;
const SW     = 13;
const CIRC   = 2 * Math.PI * R;

const START_DEG    = 135;
const SPAN_DEG     = 270;
const SPAN_RATIO   = SPAN_DEG / 360;

const toSvgAngle = (deg: number) => deg - 90;

function ringPoint(deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

export function BubbleGauge({ composite }: Props) {
  const { score, state, band, verdict, staleCount, contributingCount, totalCount } = composite;
  const colors = STATE_COLORS[state] ?? STATE_COLORS.unknown;

  const trackDash  = `${CIRC * SPAN_RATIO} ${CIRC}`;
  const fillLength = CIRC * SPAN_RATIO * (score / 100);
  const fillDash   = `${fillLength} ${CIRC}`;
  const rotateTransform = `rotate(${toSvgAngle(START_DEG)} ${CX} ${CY})`;

  const tipAngle = START_DEG + SPAN_DEG * (score / 100);
  const tip      = ringPoint(tipAngle);

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid rgba(15,23,42,0.08)',
      borderRadius: 22,
      padding: '36px 44px',
      marginBottom: 36,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(15,23,42,0.08), 0 1px 4px rgba(15,23,42,0.05)',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Top accent line matching state */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent 0%, ${colors.primary} 40%, ${colors.primary} 60%, transparent 100%)`,
        opacity: 0.6,
      }} />

      {/* Subtle ambient blob */}
      <div style={{
        position: 'absolute', top: '-30%', left: '10%',
        width: 360, height: 360,
        background: `radial-gradient(circle, ${colors.glow} 0%, transparent 65%)`,
        pointerEvents: 'none', filter: 'blur(50px)', zIndex: 0,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 48, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>

        {/* ── Gauge SVG ── */}
        <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} overflow="visible">
            <defs>
              <linearGradient id="arcGrad" gradientUnits="userSpaceOnUse" x1={CX - R} y1={CY} x2={CX + R} y2={CY}>
                <stop offset="0%"   stopColor="#16a34a" />
                <stop offset="50%"  stopColor="#d97706" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>

              <filter id="glowFilter" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="tipGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Outer decorative ring */}
            <circle cx={CX} cy={CY} r={R + SW / 2 + 6} fill="none" stroke="rgba(15,23,42,0.04)" strokeWidth={1} />

            {/* Inner subtle fill */}
            <circle cx={CX} cy={CY} r={R - SW / 2 - 4} fill="rgba(240,242,247,0.5)" stroke="none" />

            {/* Track ring */}
            <circle
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke="rgba(15,23,42,0.07)"
              strokeWidth={SW}
              strokeDasharray={trackDash}
              strokeLinecap="round"
              transform={rotateTransform}
            />

            {/* Fill arc */}
            {score > 0 && (
              <circle
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke="url(#arcGrad)"
                strokeWidth={SW}
                strokeDasharray={fillDash}
                strokeLinecap="round"
                transform={rotateTransform}
                filter="url(#glowFilter)"
                style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)' }}
              />
            )}

            {/* Tip dot */}
            {score > 1 && (
              <>
                <circle cx={tip.x} cy={tip.y} r={10} fill={colors.primary} opacity={0.15} />
                <circle cx={tip.x} cy={tip.y} r={5}  fill={colors.primary} filter="url(#tipGlow)" />
                <circle cx={tip.x} cy={tip.y} r={3}  fill="#ffffff" />
              </>
            )}

            {/* Zone boundary ticks */}
            {[0, 33, 67, 100].map((pct) => {
              const ang    = START_DEG + SPAN_DEG * (pct / 100);
              const angRad = ((ang - 90) * Math.PI) / 180;
              const ri = R - SW / 2 - 3;
              const ro = R + SW / 2 + 3;
              return (
                <line
                  key={pct}
                  x1={CX + ri * Math.cos(angRad)} y1={CY + ri * Math.sin(angRad)}
                  x2={CX + ro * Math.cos(angRad)} y2={CY + ro * Math.sin(angRad)}
                  stroke="rgba(15,23,42,0.18)" strokeWidth={1.5}
                />
              );
            })}

            {/* Zone labels */}
            {(() => {
              const safe    = ringPoint(START_DEG + SPAN_DEG * 0.165);
              const caution = ringPoint(START_DEG + SPAN_DEG * 0.5);
              const risk    = ringPoint(START_DEG + SPAN_DEG * 0.835);
              return (
                <>
                  <text x={safe.x - 2}    y={safe.y + 18}    fill="#16a34a" fontSize={8} fontWeight={700} opacity={0.7} textAnchor="middle">SAFE</text>
                  <text x={caution.x}     y={caution.y - 12} fill="#d97706" fontSize={8} fontWeight={700} opacity={0.7} textAnchor="middle">CAUTION</text>
                  <text x={risk.x + 2}    y={risk.y + 18}    fill="#dc2626" fontSize={8} fontWeight={700} opacity={0.7} textAnchor="middle">RISK</text>
                </>
              );
            })()}
          </svg>

          {/* Central score */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: 'rgba(15,23,42,0.35)',
              textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: 2,
            }}>Index</span>
            <span style={{
              fontSize: 54, fontWeight: 800,
              color: '#0f172a',
              fontFamily: "'Outfit', sans-serif",
              lineHeight: 1,
            }}>{score}</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: colors.primary,
              textTransform: 'uppercase', letterSpacing: '2px', marginTop: 6,
            }}>{colors.label}</span>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ flex: 1, minWidth: 260 }}>
          {/* Band badge */}
          <div style={{
            display: 'inline-block',
            padding: '3px 11px',
            background: colors.bg,
            border: `1px solid ${colors.primary}33`,
            borderRadius: 7,
            fontSize: 10, fontWeight: 800,
            color: colors.primary,
            textTransform: 'uppercase', letterSpacing: '1.5px',
            marginBottom: 12,
          }}>{band}</div>

          {/* Verdict */}
          <p style={{
            fontSize: 17, fontWeight: 600,
            color: '#0f172a',
            lineHeight: 1.55, marginBottom: 22,
            fontFamily: "'Outfit', sans-serif",
          }}>{verdict}</p>

          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
            background: '#f8fafc',
            border: '1px solid rgba(15,23,42,0.07)',
            borderRadius: 14, padding: '14px 18px', marginBottom: 20,
          }}>
            {[
              { label: 'Contributing', value: `${contributingCount}/${totalCount}`, color: '#0f172a' },
              { label: 'Stale',        value: String(staleCount),                   color: staleCount > 0 ? '#d97706' : '#94a3b8' },
              { label: 'Score',        value: `${score}`,                           color: colors.primary },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color, lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Info banner */}
          <div style={{
            padding: '10px 14px',
            background: 'rgba(181,136,42,0.05)',
            border: '1px solid rgba(181,136,42,0.18)',
            borderRadius: 10, fontSize: 12, color: '#b5882a',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>🛡</span>
            <span>Signals update in real-time. Expand cards below for full histories.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
