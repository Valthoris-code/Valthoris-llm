import React from 'react';
import type { AiChatSource } from '../services/aiChatService';
import { useT } from '../i18n/useI18n';

/**
 * The sources actually consulted for one answer or one analysis.
 *
 * This used to live inside the AI Assistant page, which is why the sidebar
 * tools showed a single summary line for a lookup the assistant reported in
 * full. There is one panel now, fed by the same `sources` array the backend
 * returns for both the chat turn and the `analyse` action, so a number looked
 * up in the Scanner shows exactly what the assistant shows for it.
 *
 * Every provider is rendered with the outcome of its own lookup, so a partial
 * outage is visible instead of silently narrowing the analysis. Providers that
 * are not available on this deployment are listed as such and are never
 * presented as if they had answered.
 */

const SOURCE_STATUS_STYLE: Record<AiChatSource['status'], { icon: string; color: string }> = {
  success:        { icon: '✓', color: 'var(--accent-green, #2ed573)' },
  failed:         { icon: '✕', color: 'var(--accent-amber, #ffa502)' },
  not_configured: { icon: '–', color: 'var(--text-muted)' },
  disabled:       { icon: '⊘', color: 'var(--text-muted)' },
};

/**
 * One page a search engine actually returned, as reported by the backend.
 * The UI only ever renders what is here; it never resolves a link itself.
 */
export interface SourcePage {
  title?: string;
  url?: string;
  uri?: string;
  snippet?: string;
}

/** The pages of a source report, when that source was a web search. */
export function sourcePages(data: Record<string, unknown> | undefined): SourcePage[] {
  const pages = data?.pages;
  if (!Array.isArray(pages)) return [];
  return pages.filter((page): page is SourcePage => Boolean(page) && typeof page === 'object');
}

/** An absolute http(s) address, or nothing: a link is never rendered blindly. */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/**
 * The pages a web search read, rendered as the links they are.
 *
 * A search result is only useful if the user can open it and check it, so the
 * page list is shown as anchors with the engine's own extract underneath —
 * never as a JSON blob.
 */
export function SearchResults({ pages }: { pages: SourcePage[] }) {
  const links = pages
    .map(page => ({ page, href: safeHref(page.url ?? page.uri) }))
    .filter((entry): entry is { page: SourcePage; href: string } => Boolean(entry.href));
  if (links.length === 0) return null;
  return (
    <ul className="ai-sources-pages">
      {links.map(({ page, href }) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: 'var(--accent-blue, #00d4ff)' }}
          >
            {page.title && page.title.length > 0 ? page.title : href}
          </a>
          {page.snippet && <div className="ai-sources-meta">{page.snippet}</div>}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  sources: AiChatSource[];
  /** Open by default where the source list is the point of the page. */
  defaultOpen?: boolean;
}

export default function SourcePanel({ sources, defaultOpen = false }: Props) {
  const t = useT();
  const consulted = sources.filter(s => s.status !== 'not_configured');
  if (consulted.length === 0) return null;

  return (
    <details className="ai-sources" open={defaultOpen}>
      <summary>
        🔗 {t('assistant.sources')} ({consulted.filter(s => s.status === 'success').length}/{consulted.length})
      </summary>
      <ul className="ai-sources-list">
        {consulted.map(source => {
          const style = SOURCE_STATUS_STYLE[source.status];
          const pages = source.status === 'success' ? sourcePages(source.data) : [];
          const scalars = Object.entries(source.data ?? {}).filter(([key]) => key !== 'pages');
          return (
            <li key={`${source.provider}-${source.endpoint}-${source.entity}`}>
              <span style={{ color: style.color }}>{style.icon}</span>{' '}
              <strong>{source.provider}</strong>
              <span className="text-muted"> · {source.endpoint}</span>
              <div className="ai-sources-meta">
                {new Date(source.timestamp).toLocaleString()}
                {source.status === 'failed' && ` · ${t('assistant.sourceUnavailable')}: ${source.error ?? t('assistant.sourceNoAnswer')}`}
              </div>
              {source.status === 'success' && scalars.length > 0 && (
                <div className="ai-sources-data">
                  {scalars.map(([key, value]) => (
                    <span key={key}>
                      {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  ))}
                </div>
              )}
              <SearchResults pages={pages} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}
