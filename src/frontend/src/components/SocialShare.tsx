import React, { useState } from 'react';
import { useT } from '../i18n/useI18n';

/**
 * Compact social share row.
 *
 * It fills the space between the assistant disclaimer and the bottom
 * navigation on a phone, and sits under the composer on a desktop.
 *
 * Every icon does something real:
 *   • networks with a documented web share endpoint (WhatsApp, X, Telegram,
 *     Facebook, Threads, e-mail) open that endpoint pre-filled with the
 *     Valthoris link;
 *   • networks without one (TikTok, Instagram) use the Web Share API when the
 *     device provides it and fall back to copying the link, instead of opening
 *     a page that cannot share anything;
 *   • GitHub opens the Valthoris repository — there is no separate GitHub link
 *     taking up space elsewhere.
 */

export const VALTHORIS_REPOSITORY = 'https://github.com/Valthoris-code/Valthoris-llm';

const SHARE_URL = 'https://valthoris.com';
const SHARE_TEXT = 'VALTHORIS — AI cybersecurity platform';

const encodedUrl = encodeURIComponent(SHARE_URL);
const encodedText = encodeURIComponent(SHARE_TEXT);

type IconId =
  | 'whatsapp'
  | 'tiktok'
  | 'x'
  | 'telegram'
  | 'instagram'
  | 'facebook'
  | 'email'
  | 'threads'
  | 'github';

interface ShareTarget {
  id: IconId;
  label: string;
  /** Direct link, when the network has a web share endpoint. */
  href?: string;
  /** True when the target is handled by the Web Share API / clipboard. */
  native?: boolean;
}

const TARGETS: ShareTarget[] = [
  { id: 'whatsapp',  label: 'WhatsApp',  href: `https://wa.me/?text=${encodedText}%20${encodedUrl}` },
  { id: 'tiktok',    label: 'TikTok',    native: true },
  { id: 'x',         label: 'X',         href: `https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}` },
  { id: 'telegram',  label: 'Telegram',  href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
  { id: 'instagram', label: 'Instagram', native: true },
  { id: 'facebook',  label: 'Facebook',  href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
  { id: 'email',     label: 'Email',     href: `mailto:?subject=${encodedText}&body=${encodedUrl}` },
  { id: 'threads',   label: 'Threads',   href: `https://www.threads.net/intent/post?text=${encodedText}%20${encodedUrl}` },
  { id: 'github',    label: 'GitHub',    href: VALTHORIS_REPOSITORY },
];

/** Brand glyphs, drawn inline so the row adds no dependency and no network call. */
const PATHS: Record<IconId, string> = {
  whatsapp:
    'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.69 8.23-8.23 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.88 2.35 1 2.51c.12.16 1.72 2.63 4.17 3.69.58.25 1.04.4 1.39.51.59.19 1.12.16 1.54.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z',
  tiktok:
    'M16.6 5.82a4.28 4.28 0 0 1-1.06-2.82h-3.1v12.3a2.6 2.6 0 0 1-2.6 2.5 2.6 2.6 0 0 1 0-5.2c.27 0 .53.04.78.12v-3.2a5.86 5.86 0 0 0-.78-.05 5.75 5.75 0 1 0 5.75 5.75V9.44a7.3 7.3 0 0 0 4.28 1.37V7.7a4.3 4.3 0 0 1-3.27-1.88Z',
  x:
    'M17.53 3h3.1l-6.77 7.74L21.8 21h-6.2l-4.86-6.35L5.2 21H2.1l7.24-8.28L2.2 3h6.36l4.39 5.8L17.53 3Zm-1.09 16.1h1.72L7.63 4.8H5.79l10.65 14.3Z',
  telegram:
    'M21.8 4.3 18.5 19.7c-.25 1.1-.9 1.37-1.83.85l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.14 9.36-8.46c.4-.36-.09-.56-.63-.2L5.68 12.6.7 11.04c-1.08-.34-1.1-1.08.23-1.6L20.4 2.72c.9-.33 1.69.2 1.4 1.58Z',
  instagram:
    'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.8c-3.15 0-3.5.01-4.74.07-1.14.05-1.76.24-2.17.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.17-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.05 1.14.24 1.76.4 2.17.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.17.4 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1.14-.05 1.76-.24 2.17-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.17.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1.14-.24-1.76-.4-2.17a3.64 3.64 0 0 0-.88-1.35 3.64 3.64 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.17-.4-1.24-.06-1.59-.07-4.74-.07Zm0 3.06a4.98 4.98 0 1 1 0 9.96 4.98 4.98 0 0 1 0-9.96Zm0 8.21a3.23 3.23 0 1 0 0-6.46 3.23 3.23 0 0 0 0 6.46Zm6.34-8.41a1.16 1.16 0 1 1-2.33 0 1.16 1.16 0 0 1 2.33 0Z',
  facebook:
    'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.77-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z',
  email:
    'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 3.24-8 5-8-5V6l8 5 8-5v1.24Z',
  threads:
    'M16.2 11.4c-.1-.05-.2-.1-.3-.14-.18-3.3-1.98-5.19-5-5.21h-.04c-1.8 0-3.3.77-4.23 2.18l1.66 1.14c.69-1.05 1.78-1.27 2.57-1.27h.03c.98.01 1.72.3 2.2.85.35.4.58.96.7 1.66a12.6 12.6 0 0 0-2.82-.14c-2.84.16-4.67 1.82-4.55 4.13.06 1.17.64 2.18 1.64 2.84.85.56 1.94.83 3.07.77 1.5-.08 2.67-.65 3.49-1.69.62-.79.02-.11 1.06-2.35 1.06.64 1.84 1.48 2.27 2.5.73 1.73.77 4.57-1.55 6.89-2.03 2.03-4.47 2.9-8.16 2.93-4.09-.03-7.19-1.34-9.2-3.9C1.66 20.11.68 17.2.64 13.5c.04-3.7 1.02-6.6 2.9-8.63C5.55 2.31 8.65 1 12.74.97c4.12.03 7.27 1.34 9.36 3.91.94 1.15 1.65 2.6 2.12 4.29l-2.05.55c-.4-1.4-.97-2.6-1.72-3.51-1.66-2.04-4.24-3.08-7.7-3.1-3.44.02-6.03 1.06-7.7 3.1-1.57 1.9-2.38 4.66-2.41 8.2.03 3.54.84 6.3 2.4 8.2 1.68 2.04 4.27 3.08 7.71 3.1 3.1-.02 5.16-.76 6.87-2.47 1.95-1.95 1.92-4.34 1.29-5.8-.37-.85-1.04-1.56-1.94-2.1-.23 1.6-.72 2.9-1.48 3.86Zm-3.5 3.02c-1.25.07-2.55-.49-2.61-1.66-.05-.87.61-1.84 2.69-1.96l.5-.01c.76 0 1.47.07 2.12.21-.24 3.02-1.66 3.36-2.7 3.42Z',
  github:
    'M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.72c-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.8-4.58 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z',
};

function Glyph({ id }: { id: IconId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">
      <path d={PATHS[id]} fill="currentColor" />
    </svg>
  );
}

export default function SocialShare({ className = '' }: { className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const shareNatively = async (label: string) => {
    const data = { title: 'VALTHORIS', text: `${SHARE_TEXT} — ${label}`, url: SHARE_URL };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // The user dismissed the sheet, or the platform refused it: fall back
        // to the clipboard rather than doing nothing.
      }
    }
    try {
      await navigator.clipboard?.writeText(SHARE_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.open(SHARE_URL, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={`social-share ${className}`.trim()}>
      <span className="social-share-label">{t('social.share')}</span>
      <div className="social-share-icons">
        {TARGETS.map(target =>
          target.href ? (
            <a
              key={target.id}
              href={target.href}
              target={target.id === 'email' ? undefined : '_blank'}
              rel="noopener noreferrer"
              className={`social-share-icon social-share-${target.id}`}
              title={target.label}
              aria-label={target.label}
            >
              <Glyph id={target.id} />
            </a>
          ) : (
            <button
              key={target.id}
              type="button"
              onClick={() => void shareNatively(target.label)}
              className={`social-share-icon social-share-${target.id}`}
              title={target.label}
              aria-label={target.label}
            >
              <Glyph id={target.id} />
            </button>
          ),
        )}
      </div>
      <span className="social-share-copied" role="status">
        {copied ? t('social.copied') : ''}
      </span>
    </div>
  );
}
