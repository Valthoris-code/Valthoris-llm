import { useEffect } from 'react';

/**
 * Keeps the application shell aligned with the *visual* viewport.
 *
 * Two problems are solved here, both of which made the app look cut off on
 * Android:
 *
 *  1. `100vh` on mobile browsers is the viewport WITHOUT the dynamic browser
 *     UI, so a `height: 100vh` shell is taller than what the user can see: the
 *     header is pushed under the URL bar and the footer falls outside the
 *     screen. `--app-height` is published from `visualViewport.height` (falling
 *     back to `innerHeight`) and the shell uses it.
 *
 *  2. When the Android soft keyboard opens, the visual viewport shrinks while
 *     the layout viewport does not. Without this, the chat composer ends up
 *     underneath the keyboard. `--keyboard-inset` carries the height that the
 *     keyboard is covering, and `data-keyboard="open"` lets the CSS collapse
 *     the fixed bottom navigation while the user is typing.
 *
 * The listener is passive and only writes CSS custom properties, so it costs
 * nothing on desktop, where the values simply never change.
 */
export function useViewportMetrics(): void {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const apply = () => {
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty('--app-height', `${Math.round(height)}px`);

      // Positive only while the keyboard (or another overlay) covers part of
      // the layout viewport.
      const covered = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      const keyboardOpen = covered > 120;
      root.style.setProperty('--keyboard-inset', `${keyboardOpen ? Math.round(covered) : 0}px`);
      if (keyboardOpen) {
        root.setAttribute('data-keyboard', 'open');
      } else {
        root.removeAttribute('data-keyboard');
      }
    };

    apply();
    viewport?.addEventListener('resize', apply);
    viewport?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      viewport?.removeEventListener('resize', apply);
      viewport?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}
