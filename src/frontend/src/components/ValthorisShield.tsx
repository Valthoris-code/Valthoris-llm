import React from 'react';

/**
 * The official Valthoris shield.
 *
 * `public/valthoris-shield-128.png` is a downscaled copy of the real brand
 * asset `public/valthoris-shield.png` (documentos/Valthoris-Shield-New.png),
 * used because this component never renders larger than a few dozen pixels
 * and the original is a 1.6 MB image. It is rendered as a square image so the
 * original proportions and its transparency are preserved at every size, and
 * it is the single place the brand mark is loaded from — no component draws
 * its own placeholder shield.
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
      src="/valthoris-shield-128.png"
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
