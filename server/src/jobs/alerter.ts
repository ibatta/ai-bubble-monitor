import nodemailer from 'nodemailer';
import { getAllLatestReadings, logAlert } from '../db/repository';
import { INDICATOR_CONFIGS } from '../config/indicators';
import { determineFreshness } from '../engine/freshness';

// In-memory state map to detect transitions
const previousStates: Map<string, string> = new Map();

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildEmailHtml(
  indicatorName: string,
  indicatorId: string,
  fromState: string | null,
  toState: string,
  rawValue: number | null,
  source: string
): string {
  const stateColors: Record<string, string> = {
    red: '#ef4444',
    amber: '#f59e0b',
    green: '#22c55e',
  };
  const stateColor = stateColors[toState] ?? '#888';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0d0e14; color: #e2e8f0; border-radius: 12px;">
      <h1 style="color: #c9a84c; font-size: 18px; margin: 0 0 8px;">⚠ AI Bubble Monitor Alert</h1>
      <h2 style="color: #fff; font-size: 22px; margin: 0 0 16px;">${indicatorName} (${indicatorId})</h2>
      <div style="background: ${stateColor}22; border: 1px solid ${stateColor}; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-size: 16px; color: ${stateColor}; font-weight: 700;">
          State changed to: <span style="text-transform: uppercase;">${toState}</span>
        </p>
        ${fromState ? `<p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">From: ${fromState}</p>` : ''}
        ${rawValue !== null ? `<p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">Raw value: ${rawValue}</p>` : ''}
        <p style="margin: 8px 0 0; color: #94a3b8; font-size: 13px;">Source: ${source}</p>
      </div>
      <p style="color: #64748b; font-size: 12px; margin: 16px 0 0; border-top: 1px solid #1e2130; padding-top: 16px;">
        This is an automated alert from your AI Bubble Pressure Monitor. This is for educational purposes only — not investment advice.
      </p>
    </div>
  `;
}

/**
 * Checks all indicators for state transitions and sends email alerts for new 'red' states.
 */
export async function checkAndAlert(): Promise<void> {
  const emailTo = process.env.ALERT_TO;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!emailTo || !smtpUser || !smtpPass) {
    // Email not configured — skip silently
    return;
  }

  try {
    const readings = await getAllLatestReadings();
    const transporter = createTransporter();

    for (const reading of readings) {
      const config = INDICATOR_CONFIGS.find(c => c.id === reading.indicator_id);
      if (!config) continue;

      const prevState = previousStates.get(reading.indicator_id);
      const currentState = reading.state;

      // Alert when leaving GREEN (changing from green to something else)
      if (prevState !== undefined && prevState === 'green' && currentState !== 'green') {
        try {
          const html = buildEmailHtml(
            config.name,
            config.id,
            prevState,
            currentState,
            reading.raw_value,
            reading.source
          );

          await transporter.sendMail({
            from: `"AI Bubble Monitor" <${smtpUser}>`,
            to: emailTo,
            subject: `⚠️ Alert: ${config.name} (${config.id}) left GREEN (now ${currentState.toUpperCase()})`,
            html,
          });

          await logAlert(reading.indicator_id, prevState, currentState, emailTo);
          console.log(`[Alerter] Sent left-green alert for ${reading.indicator_id}`);
        } catch (mailErr) {
          console.error(`[Alerter] Failed to send email for ${reading.indicator_id}:`, mailErr);
        }
      }

      // Alert when entering GREEN (changing to green from something else)
      if (prevState !== undefined && prevState !== 'green' && currentState === 'green') {
        try {
          await transporter.sendMail({
            from: `"AI Bubble Monitor" <${smtpUser}>`,
            to: emailTo,
            subject: `✅ All-Clear: ${config.name} (${config.id}) returned to GREEN`,
            html: buildEmailHtml(config.name, config.id, prevState, currentState, reading.raw_value, reading.source),
          });
          await logAlert(reading.indicator_id, prevState, currentState, emailTo);
          console.log(`[Alerter] Sent returned-to-green alert for ${reading.indicator_id}`);
        } catch (mailErr) {
          console.error(`[Alerter] Failed to send green-return email:`, mailErr);
        }
      }

      previousStates.set(reading.indicator_id, currentState);
    }
  } catch (err) {
    console.error('[Alerter] checkAndAlert failed:', err);
  }
}
