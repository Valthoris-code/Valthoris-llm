import React from 'react';
import VerdictBanner from './VerdictBanner';
import SourcePanel from './SourcePanel';
import type { AiChatSource, AiVerdict } from '../services/aiChatService';

/**
 * The full result of one analysis, as the AI Assistant reports it.
 *
 * The sidebar tools and the Scanner used to show only the traffic light, or —
 * worse — a single line from the canister ("Sem registos para este número"),
 * while the very same lookup shown in the assistant carried the signals, the
 * providers consulted and the timestamp of each one. Both surfaces call the
 * same `analyse` action, so both must show the same thing: the verdict, the
 * signals that produced it, how much of the evidence answered, and every
 * source with its own outcome.
 */

const SEVERITY_STYLE: Record<string, { label: string; colour: string }> = {
  strong:   { label: 'forte',    colour: 'var(--accent-red, #ff4d4f)' },
  moderate: { label: 'moderado', colour: 'var(--accent-amber, #ffa940)' },
  weak:     { label: 'fraco',    colour: 'var(--text-muted)' },
};

interface Props {
  verdict?: AiVerdict;
  sources?: AiChatSource[];
  /** Rendered between the verdict and the signals (a dedicated panel). */
  children?: React.ReactNode;
}

/** The signals the verdict rests on, each with its source and its weight. */
export function VerdictSignals({ verdict }: { verdict: AiVerdict }) {
  if (verdict.signals.length === 0) return null;
  return (
    <section className="mb-2">
      <h4 style={{ margin: '0 0 0.4rem' }}>Sinais detetados</h4>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
        {verdict.signals.map(signal => {
          const style = SEVERITY_STYLE[signal.severity] ?? SEVERITY_STYLE.weak;
          return (
            <li key={`${signal.provider}-${signal.endpoint}-${signal.reason}`}>
              <strong>{signal.provider}</strong>
              <span className="text-muted"> · {signal.endpoint}</span>{' '}
              <span style={{ color: style.colour }}>({style.label}, +{signal.weight})</span>
              <div className="text-muted">{signal.reason}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How much of the evidence actually answered, stated instead of implied. */
export function VerdictCoverage({ verdict }: { verdict: AiVerdict }) {
  const { answered, failed, notConfigured } = verdict.coverage;
  return (
    <p className="text-muted" style={{ margin: '0 0 0.6rem', fontSize: '0.82rem' }}>
      Cobertura: {answered} fonte(s) responderam · {failed} falharam · {notConfigured} sem
      credencial nesta instalação · pontuação {verdict.score}
    </p>
  );
}

export default function AnalysisReport({ verdict, sources, children }: Props) {
  if (!verdict && (!sources || sources.length === 0)) return null;
  return (
    <div>
      {verdict && <VerdictBanner verdict={verdict} />}
      {children}
      {verdict && <VerdictCoverage verdict={verdict} />}
      {verdict && <VerdictSignals verdict={verdict} />}
      {sources && sources.length > 0 && <SourcePanel sources={sources} />}
    </div>
  );
}
