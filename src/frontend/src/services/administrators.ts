/**
 * Valthoris platform administrators.
 *
 * SECURITY MODEL
 * ──────────────
 * The authoritative administrator check lives in the `backend` canister
 * (`PLATFORM_ADMINISTRATORS` in src/backend/main.mo). The canister decides
 * privileged access from `msg.caller`, which the Internet Computer
 * authenticates — a browser can neither forge it nor ask to be treated as
 * another principal.
 *
 * The list below is a *display-only* mirror. It is used to label the operator
 * account in the Administration area; it never grants access on its own. Role
 * gating in the UI uses the role resolved by the canister
 * (`ensureManagedUser`), and every privileged operation is re-checked by the
 * canister when it is called.
 *
 * The e-mail addresses are contact metadata for the operators. They are never
 * used as an authorization input: an e-mail string supplied by a browser is
 * not trusted anywhere in the platform.
 */

export interface PlatformAdministrator {
  /** Internet Identity principal — the canonical identity. */
  principal: string;
  /** Contact address shown in the Administration UI. Never an auth input. */
  email: string;
  label: string;
}

export const PLATFORM_ADMINISTRATORS: PlatformAdministrator[] = [
  {
    principal: '6wzpv-jfxnt-kzbeg-4isuv-vd2m2-yfzmk-znnho-tpvrg-lmarn-afsnw-tae',
    email: 'quantumflux2025@gmail.com',
    label: 'Administrator A (canister creator)',
  },
  {
    principal: '5zuwu-tg4w3-24k2i-oj4co-jtrvg-awxcp-cb3kq-a44yk-oug3q-zes7x-6ae',
    email: 'coragem77@gmail.com',
    label: 'Administrator B (controller)',
  },
];

/**
 * Display helper: returns the operator record for a principal, if any.
 * Callers must NOT use this to decide access — use the role returned by the
 * backend canister.
 */
export function findPlatformAdministrator(
  principal: string | null,
): PlatformAdministrator | undefined {
  if (!principal) return undefined;
  return PLATFORM_ADMINISTRATORS.find(a => a.principal === principal);
}
