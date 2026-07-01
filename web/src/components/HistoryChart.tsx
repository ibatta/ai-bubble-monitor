import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { Indicator } from '../types';
import { fetchIndicatorDetail } from '../api';

interface Props {
  indicatorId: string;
  onClose: () => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const subScore = payload.find(p => p.name === 'subScore')?.value;
  const rawValue = payload.find(p => p.name === 'rawValue')?.value;

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid rgba(15,23,42,0.12)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      color: '#0f172a',
      boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
    }}>
      <div style={{ color: '#64748b', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {subScore !== undefined && (
        <div style={{ color: '#b5882a', fontWeight: 700 }}>Score: {subScore}</div>
      )}
      {rawValue !== undefined && rawValue !== null && (
        <div style={{ color: '#475569' }}>Raw Value: {rawValue}</div>
      )}
    </div>
  );
};

export function HistoryChart({ indicatorId, onClose }: Props) {
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIndicatorDetail(indicatorId)
      .then(setIndicator)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [indicatorId]);

  const chartData = indicator?.history?.map((h: any) => ({
    date: formatDate(h.asOf ?? h.as_of),
    subScore: h.subScore ?? h.sub_score,
    rawValue: h.rawValue ?? h.raw_value,
    state: h.state,
  })) ?? [];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: 24,
    }} onClick={onClose}>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 20,
          padding: 32,
          width: '100%',
          maxWidth: 860,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4, fontWeight: 600 }}>
              {indicatorId} — Signal History
            </div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
              {indicator?.name ?? indicatorId}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: '1px solid rgba(15,23,42,0.08)',
              borderRadius: 8,
              color: '#475569',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Inter',
            }}
          >✕ Close</button>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="loading-spinner" />
          </div>
        )}

        {error && (
          <div className="error-card">{error}</div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div style={{ textAlign: 'center', padding: 36, background: '#f8fafc', borderRadius: 12, border: '1px solid rgba(15,23,42,0.06)', color: '#64748b', marginBottom: 20 }}>
            Awaiting historical trend points. Data accumulates automatically on each scheduled refresh cycle.
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#b5882a" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" vertical={false} />

                {/* Threshold band shading */}
                <ReferenceArea y1={0} y2={33} fill="rgba(22,163,74,0.04)" />
                <ReferenceArea y1={34} y2={66} fill="rgba(217,119,6,0.04)" />
                <ReferenceArea y1={67} y2={100} fill="rgba(220,38,38,0.04)" />

                {/* Threshold lines */}
                <ReferenceLine y={33} stroke="rgba(22,163,74,0.35)" strokeDasharray="4 4" label={{ value: 'Safe / Watch', fill: '#16a34a', fontSize: 10 }} />
                <ReferenceLine y={66} stroke="rgba(217,119,6,0.35)" strokeDasharray="4 4" label={{ value: 'Watch / Risk', fill: '#d97706', fontSize: 10 }} />

                <XAxis
                  dataKey="date"
                  stroke="#cbd5e1"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(15,23,42,0.1)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="#cbd5e1"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickCount={6}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="subScore"
                  name="subScore"
                  stroke="url(#lineGradient)"
                  strokeWidth={2.5}
                  dot={chartData.length <= 1 ? { r: 6, fill: '#b5882a' } : false}
                  activeDot={{ r: 6, fill: '#b5882a', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Description & Caveat — Always Shown */}
        {!loading && indicator?.description && (
          <div style={{
            padding: '16px 18px',
            background: 'rgba(181,136,42,0.05)',
            border: '1px solid rgba(181,136,42,0.18)',
            borderRadius: 12,
            fontSize: 13.5,
            color: '#475569',
            lineHeight: 1.65,
          }}>
            <div style={{ color: '#b5882a', fontWeight: 700, marginBottom: 4 }}>How it's measured</div>
            <div>{indicator.description}</div>
            {indicator.caveat && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(181,136,42,0.12)', color: '#64748b', fontSize: 12.5 }}>
                <strong style={{ color: '#d97706' }}>⚠ Caveat: </strong>
                {indicator.caveat}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
