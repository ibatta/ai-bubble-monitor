import React, { useState } from 'react';

const EXPLANATIONS = [
  {
    id: 'about',
    emoji: '💡',
    title: 'About This Tool',
    color: '#b5882a',
    content: `Every so often, an exciting new invention comes along and everyone rushes to invest in it. It happened with trains in the 1800s, radio in the 1920s, and the internet in the late 1990s. Each time, the invention was real and changed the world — but people got so excited that prices climbed way too high, and those who paid the most lost a lot when things calmed down. Now the same thing may be happening with AI. So there's one big question: is this a bubble, and if it is, how close are we to the moment it pops? This tool was built to help answer that using real facts, not just gut feeling. It watches a set of simple "warning lights" (signs the boom might be getting too hot) and "all-clear lights" (signs it's healthy and real), checks each one using trusted data, and adds them up into a single score you can follow over time. It's here to help you think clearly — it's not a crystal ball, and it's not financial advice. The goal is simple: to let anyone, expert or not, see where things stand today, understand why, and decide for themselves.`,
  },
  {
    id: 'index',
    emoji: '🌡',
    title: 'The Bubble Pressure Index',
    color: '#c9a84c',
    content: `The index is a single number from 0 to 100 — a weighted average of all nine signal lights. Think of it like a thermometer for AI investment heat: 0–33 is "mostly healthy", 34–66 is "watch carefully", and 67–100 is "something might be wrong."

No single number can predict a crash, and this one is no exception. It's a structured way to track multiple signals at once so you don't miss the forest for the trees.`,
  },
  {
    id: 'w1',
    emoji: '💰',
    title: 'W1 — Hyperscaler Capex (Big Company Spending)',
    color: '#ef4444',
    content: `Microsoft, Google, Amazon, Meta, and Oracle are spending hundreds of billions building AI infrastructure. W1 tracks whether that spending is still growing year-over-year.

🟢 Green: spending growing 20%+ year-on-year — full steam ahead.
🟡 Amber: growth slowing (0–20%).
🔴 Red: actual cuts — the classic "party's over" signal.

The data comes from SEC EDGAR filings (public, free, reliable). Caveat: capex covers more than just AI.`,
  },
  {
    id: 'w2',
    emoji: '📊',
    title: 'W2 — Capex-to-Payoff Gap (Are They Making Money?)',
    color: '#ef4444',
    content: `Spending is only sustainable if it turns into revenue. W2 measures how fast cloud revenue (Azure, Google Cloud, AWS) and Nvidia data-center sales are growing compared to how fast capex is rising.

🟢 Green: revenue keeping pace with spending.
🟡 Amber: spending rising faster, but revenue still growing.
🔴 Red: spending at record highs while revenue growth stalls — the classic "we'll figure out monetization later" danger zone.`,
  },
  {
    id: 'w3',
    emoji: '⚡',
    title: 'W3 — Competitive Shock (Another DeepSeek Moment)',
    color: '#ef4444',
    content: `In January 2025, DeepSeek released a model that was dramatically cheaper to run, and Nvidia lost ~$600B in market cap in one day. W3 watches for a repeat.

The automatic trigger: if Nvidia (NVDA) or semiconductor stocks drop more than 4–7% in a single day, the light flips amber/red. The score then decays back to green over two weeks if there's no follow-through — because a one-day shock that bounces isn't the same as a structural shift.`,
  },
  {
    id: 'w4',
    emoji: '📈',
    title: 'W4 — Macro Pressure (Rates & Oil)',
    color: '#ef4444',
    content: `Tech bubbles historically pop when money gets expensive. W4 combines three signals from the Federal Reserve's free data (FRED):

• 10-year Treasury yield — has it risen sharply in the past 60 days?
• Brent crude oil — has energy gotten significantly more expensive?
• 5-year/5-year inflation expectation — are markets pricing in lasting inflation?

When all three rise together, it's the macro regime that historically pricks asset bubbles.`,
  },
  {
    id: 'w5',
    emoji: '🌊',
    title: 'W5 — Market Breadth (Is It Just a Few Stocks?)',
    color: '#ef4444',
    content: `Before the dot-com crash in 2000, the S&P 500 kept hitting new highs — but most stocks were falling. A handful of giant tech companies were doing all the work.

W5 tracks the RSP/SPY ratio: equal-weight vs cap-weight S&P 500. When the ratio falls, big caps are dragging the index up while most stocks lag.

🟢 Green: the rally is broad, lots of stocks participating.
🔴 Red: narrow leadership — a classic late-cycle warning.`,
  },
  {
    id: 'g1',
    emoji: '🏥',
    title: 'G1 — Enterprise Adoption (Real-World Use)',
    color: '#22c55e',
    content: `The bull case for AI is that it makes hospitals, factories, and everyday businesses dramatically more productive. G1 measures whether that's actually happening.

Data comes from the US Census Bureau's Business Trends and Outlook Survey (BTOS) — which asks businesses directly about AI use, biweekly, for free.

🟢 Green: adoption rising, companies deploying (not just piloting) AI.
🔴 Red: stuck below ~15% production deployment — "pilot purgatory" where everyone is testing but nobody is saving real money.`,
  },
  {
    id: 'g2',
    emoji: '💵',
    title: 'G2 — Profit Conversion (Spending → Cash)',
    color: '#22c55e',
    content: `A healthy boom converts spending into free cash flow. G2 compares hyperscaler capex to their operating cash flow.

A ratio below 1 = they generate more cash than they spend on infrastructure (healthy).
A ratio above 1 = they're burning more than they generate (concerning if sustained).

Source: SEC EDGAR financial filings.`,
  },
  {
    id: 'g3',
    emoji: '🎯',
    title: 'G3 — Customer Concentration (How Broad Is Demand?)',
    color: '#22c55e',
    content: `If Nvidia's chips are being bought by only 3–4 giant customers (Microsoft, Google, Amazon, Meta), that's a fragile demand base. G3 tracks the estimated top-4 customer share of Nvidia revenue.

🟢 Green: demand spreading to new customer segments.
🔴 Red: top-4 share approaching 70%+ — the loop is tightening, not broadening.

Note: the exact % is analyst-estimated (not disclosed). This is entered manually.`,
  },
  {
    id: 'g4',
    emoji: '💡',
    title: 'G4 — AI Price/Performance (Getting Cheaper the Right Way)',
    color: '#22c55e',
    content: `Good news: AI is getting cheaper. The cost of running a frontier model has fallen dramatically year-over-year. But there's a dangerous version: a price war that's so brutal it destroys Nvidia's margins and destabilizes the whole ecosystem.

G4 distinguishes:
🟢 Costs falling AND leader margins holding → healthy diffusion.
🔴 Costs falling AND margins collapsing → destabilizing price war.
🔴 No cost decline at all → AI not diffusing (also a problem).`,
  },
  {
    id: 'context',
    emoji: '🔍',
    title: 'Context Indicators (C1, C2, C3)',
    color: '#94a3b8',
    content: `These three don't count in the composite score — they're background context:

C1 — Shiller CAPE: stocks are historically expensive when CAPE is above 35. High doesn't mean crash is imminent, but it means there's less margin for error.

C2 — Gold: when gold hits new all-time highs, it's often a sign that large investors are nervous about something. Context, not prediction.

C3 — Circular Financing: a manually-maintained ledger of vendor-financing deals (chipmakers lending to model labs who buy more chips). This kind of circular money flow historically precedes credit events.`,
  },
  {
    id: 'honesty',
    emoji: '⚠',
    title: 'What This Tool Cannot Do',
    color: '#f59e0b',
    content: `This dashboard is a heuristic monitor for education and discussion. It cannot:

• Predict when or whether a bubble will pop.
• Identify a "bubble" with certainty — reasonable people disagree.
• Replace professional financial analysis.

Thresholds are starting points based on historical patterns, not truths. Several metrics are approximations: capex isn't pure-AI, "AI revenue" has no clean line item, and customer share relies on analyst estimates.

Not investment advice. Check with a qualified financial professional before making any decisions.`,
  },
];

export function HowToRead() {
  const [openId, setOpenId] = useState<string | null>('about');

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
        paddingBottom: 12,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontSize: 14, color: '#475569' }}>?</span>
        <h2 style={{
          fontFamily: 'Outfit',
          fontSize: 14,
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
        }}>How To Read This Dashboard</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {EXPLANATIONS.map(exp => (
          <div key={exp.id}>
            <button
              onClick={() => setOpenId(openId === exp.id ? null : exp.id)}
              style={{
                width: '100%',
                background: openId === exp.id ? '#151c2e' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${openId === exp.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                borderRadius: openId === exp.id ? '10px 10px 0 0' : 10,
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.2s ease',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 16 }}>{exp.emoji}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: openId === exp.id ? exp.color : '#d1d5db', fontFamily: 'Outfit' }}>
                {exp.title}
              </span>
              <span style={{ color: '#475569', fontSize: 12, transform: openId === exp.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                ▾
              </span>
            </button>

            {openId === exp.id && (
              <div style={{
                background: '#0f1625',
                border: '1px solid rgba(255,255,255,0.06)',
                borderTop: 'none',
                borderRadius: '0 0 10px 10px',
                padding: '16px 20px',
                fontSize: 14,
                color: '#94a3b8',
                lineHeight: 1.7,
                whiteSpace: 'pre-line',
              }}>
                {exp.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
