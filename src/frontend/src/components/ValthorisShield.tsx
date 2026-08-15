import React from 'react';

/**
 * The official Valthoris shield.
 *
 * `public/valthoris-shield.png` is the real brand asset (documentos/
 * Valthoris-Shield-New.png). It is rendered as a square image so the original
 * proportions and its transparency are preserved at every size, and it is the
 * single place the brand mark is loaded from — no component draws its own
 * placeholder shield.
 */
export default function ValthorisShield({
  size = 24,
  className,
  title = 'Valthoris',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src="/valthoris-shield.png"
      alt={title}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      decoding="async"
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        flexShrink: 0,
        display: 'block',
      }}
    />
  );
}
