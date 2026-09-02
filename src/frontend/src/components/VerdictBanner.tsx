import React from 'react';
import type { AiVerdict } from '../services/aiChatService';

/**
 * The traffic light, rendered the same way everywhere it appears.
 *
 * The verdict itself is never computed here: it is produced by the `ai-chat`
 * Edge Function from the provider payloads and the canister evidence, so the
 * assistant and every sidebar tool state the same conclusion about the same
 * target. This component only paints it — and shows, underneath, the reasons
 * the backend attributed to their sources.
 */

const STYLES: Record<
  AiVerdict['level'],
  { border: string; background: string; colour: string }
> = {
  danger: {
    border: 'rgba(255, 77, 79, 0.55)',
    background: 'rgba(255, 77, 79, 0.12)',
    colour: 'var(--accent-red, #ff4d4f)',
  },
  caution: {
    border: 'rgba(255, 169, 64, 0.55)',
    background: 'rgba(255, 169, 64, 0.12)',
    colour: 'var(--accent-amber, #ffa940)',
  },
  safe: {
    border: 'rgba(82, 196, 26, 0.55)',
    background: 'rgba(82, 196, 26, 0.12)',
    colour: 'var(--accent-green, #52c41a)',
  },
  insufficient: {
    border: 'var(--border)',
    background: 'rgba(255, 255, 255, 0.04)',
    colour: 'var(--text-muted)',
  },
};

interface Props {
  verdict: AiVerdict;
  /** Detail rendered inside the expander, under the reasons. */
  children?: React.ReactNode;
  /** Label of the expander. */
  detailLabel?: string;
}

export default function VerdictBanner({ verdict, children, detailLabel }: Props) {
  const style = STYLES[verdict.level] ?? STYLES.insufficient;
  const [headline, ...reasons] = verdict.headline.split('\n');

  return (
    <div
      role="status"
      style={{
        border: `1px solid ${style.border}`,
        background: style.background,
        borderRadius: 8,
        padding: '0.8rem 0.9rem',
        marginBottom: '1rem',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: style.colour }}>{headline}</p>
      {reasons.length > 0 && (
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
          {reasons.map(reason => (
            <li key={reason}>{reason.replace(/^•\s*/, '')}</li>
          ))}
        </ul>
      )}
      {children && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
            {detailLabel ?? 'Ver análise completa'}
          </summary>
          <div style={{ marginTop: '0.6rem' }}>{children}</div>
        </details>
      )}
    </div>
  );
}
