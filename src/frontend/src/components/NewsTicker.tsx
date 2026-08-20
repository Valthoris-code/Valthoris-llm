import React, { useEffect, useRef, useState } from 'react';
import { fetchNews, NewsItem } from '../services/newsTickerService';
import { useT } from '../i18n/useI18n';

/**
 * Full-width news ticker.
 *
 * Headlines come from the `news-ticker` Edge Function (NewsData.io behind a
 * 24 hour Postgres cache), never from the provider directly.
 *
 * The strip is rendered twice inside the moving track so the horizontal loop is
 * seamless: the animation translates by exactly -50%, at which point the second
 * copy sits where the first one started.
 *
 * Accessibility/UX: the motion stops under `prefers-reduced-motion` (handled in
 * Layout.css, where the strip becomes scrollable instead) and pauses on hover,
 * on keyboard focus and while a finger is on it. Nothing renders while loading
 * or after a failure, so the layout never shifts or breaks.
 */

/** Seconds each headline stays on screen; the duration scales with the list. */
const SECONDS_PER_ITEM = 6;

function formatItem(item: NewsItem): string {
  return item.source ? `${item.source} — ${item.title}` : item.title;
}

export default function NewsTicker({ className }: { className?: string }) {
  const t = useT();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [paused, setPaused] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    void (async () => {
      try {
        const result = await fetchNews();
        if (!cancelled.current) setItems(result.items);
      } catch (err) {
        // The ticker is decorative: a failure must never disturb the assistant.
        console.error('[news-ticker]', err);
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, []);

  if (items.length === 0) return null;

  const duration = `${items.length * SECONDS_PER_ITEM}s`;

  const strip = (ariaHidden: boolean) => (
    <ul className="news-ticker-strip" aria-hidden={ariaHidden || undefined}>
      {items.map((item, index) => (
        <li className="news-ticker-item" key={`${item.link}-${index}`}>
          <span className="news-ticker-bullet" aria-hidden="true">▸</span>
          <a
            className="news-ticker-link"
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={ariaHidden ? -1 : undefined}
          >
            {formatItem(item)}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className={`news-ticker${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={t('news.ticker.label')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onTouchCancel={() => setPaused(false)}
    >
      <span className="news-ticker-badge">{t('news.ticker.badge')}</span>
      <div className="news-ticker-viewport">
        <div
          className="news-ticker-track"
          style={{
            animationDuration: duration,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {strip(false)}
          {/* Second copy: only there to make the loop seamless. */}
          {strip(true)}
        </div>
      </div>
    </div>
  );
}
