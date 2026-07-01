import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface PendingEntry {
  id: number;
  parties: string;
  deal_type: string;
  estimated_amount_bn: number | null;
  deal_date: string | null;
  draft_note: string | null;
  source_url: string | null;
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
}

interface Props {
  onClose: () => void;
}

const CONFIDENCE_STYLE: Record<string, { color: string; bg: string }> = {
  high:   { color: '#16a34a', bg: 'rgba(22,163,74,0.08)'  },
  medium: { color: '#d97706', bg: 'rgba(217,119,6,0.08)'  },
  low:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)'},
};

export function C3ReviewQueue({ onClose }: Props) {
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const adminToken = localStorage.getItem('adminToken') || 'GR8CXZLL9NXZO4IO';

  const load = () => {
    setLoading(true);
    axios.get('/api/c3/pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then(res => setEntries(res.data as PendingEntry[]))
      .catch(err => setError(err.response?.data?.error ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (id: number, action: 'approve' | 'reject') => {
    setProcessing(id);
    try {
      await axios.post(`/api/c3/${action}/${id}`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setError(e.response?.data?.error ?? e.message ?? 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.45)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000, padding: '40px 24px', overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid rgba(15,23,42,0.1)',
          borderRadius: 20,
          padding: 32,
          width: '100%', maxWidth: 640,
          boxShadow: '0 24px 80px rgba(15,23,42,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 4 }}>
              C3 · Circular Financing Watch
            </div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Review Queue
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
              Auto-drafted by Claude news classifier · Approve or reject each deal
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >✕</button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 16,
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 8, fontSize: 13, color: '#dc2626',
          }}>{error}</div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="loading-spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>Queue is empty</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              No pending C3 deals found. The classifier will surface new items daily.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {entries.map(entry => {
              const conf = CONFIDENCE_STYLE[entry.confidence] ?? CONFIDENCE_STYLE.low;
              const isProcessing = processing === entry.id;
              return (
                <div key={entry.id} style={{
                  background: '#f8fafc',
                  border: '1px solid rgba(15,23,42,0.08)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  position: 'relative',
                }}>
                  {/* Confidence badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999,
                      background: conf.bg, color: conf.color,
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      border: `1px solid ${conf.color}33`,
                    }}>{entry.confidence} confidence</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {entry.deal_type?.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 11, color: '#cbd5e1', marginLeft: 'auto' }}>
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Parties */}
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    {entry.parties}
                  </div>

                  {/* Amount + Date */}
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                    {entry.estimated_amount_bn != null && (
                      <span style={{ marginRight: 12 }}>
                        💰 ${entry.estimated_amount_bn}B
                      </span>
                    )}
                    {entry.deal_date && <span>📅 {entry.deal_date}</span>}
                  </div>

                  {/* Draft note */}
                  {entry.draft_note && (
                    <div style={{
                      fontSize: 12, color: '#64748b',
                      background: '#fff', border: '1px solid rgba(15,23,42,0.07)',
                      borderRadius: 8, padding: '8px 12px', marginBottom: 10,
                      lineHeight: 1.55,
                    }}>
                      {entry.draft_note}
                    </div>
                  )}

                  {/* Source */}
                  {entry.source_url && (
                    <div style={{ marginBottom: 12 }}>
                      <a href={entry.source_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}>
                        View source article ↗
                      </a>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={isProcessing}
                      onClick={() => act(entry.id, 'approve')}
                      style={{
                        flex: 1, padding: '8px',
                        background: isProcessing ? '#d1fae5' : '#16a34a',
                        border: 'none', borderRadius: 8,
                        color: '#fff', fontWeight: 700, fontSize: 13,
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontFamily: "'Outfit', sans-serif",
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isProcessing ? '…' : '✓ Approve — add to ledger'}
                    </button>
                    <button
                      disabled={isProcessing}
                      onClick={() => act(entry.id, 'reject')}
                      style={{
                        padding: '8px 16px',
                        background: '#f8fafc',
                        border: '1px solid rgba(220,38,38,0.2)',
                        borderRadius: 8, color: '#dc2626',
                        fontWeight: 600, fontSize: 13,
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
