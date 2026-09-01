/**
 * AdminAuthContext — authentication and authorization state of the Valthoris
 * administration.
 *
 * The state machine the whole admin area depends on:
 *
 *   anonymous ──sign in──▶ authenticated (AAL1)
 *                              │
 *                              ├─ no TOTP factor ─▶ mfa-enrollment-required
 *                              └─ factor present ─▶ mfa-challenge-required
 *                                                        │
 *                                                    verify code
 *                                                        ▼
 *                                              authenticated (AAL2)
 *                                                        │
 *                                          admin-api /session decides
 *                                            ┌───────────┴───────────┐
 *                                        administrator          not an admin
 *
 * "not an admin" is indistinguishable from a wrong password in everything this
 * module exposes: the administration must never confirm its own existence, nor
 * that a given address is (or is not) an administrator.
 *
 * Nothing here is a security boundary. The authoritative decision is taken by
 * the `admin-api` Edge Function and by the RLS policies on the `governance`
 * schema; this context only decides what to *render*.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { getAdminSupabase, isAdminBackendConfigured } from './adminClient';
import { AdminAccessDenied, fetchAdminSession } from './adminApi';
import type { AdminSession } from './adminApi';

export type AdminAuthStage =
  /** Resolving the stored session. */
  | 'loading'
  /** No Supabase session at all. */
  | 'anonymous'
  /** Signed in, but no TOTP factor is enrolled yet. */
  | 'mfa-enrollment-required'
  /** Signed in with a factor enrolled, waiting for the code. */
  | 'mfa-challenge-required'
  /** Signed in at AAL2 and recognised as an administrator. */
  | 'authorized';

export interface AdminEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export interface AdminAuthValue {
  stage: AdminAuthStage;
  admin: AdminSession | null;
  /** True while a sign-in / verification round-trip is in flight. */
  busy: boolean;
  /** Generic, user-safe message, or null. */
  error: string | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  startEnrollment: () => Promise<AdminEnrollment>;
  verifyCode: (code: string, factorId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Permission check used to render navigation. Never an access decision. */
  can: (permission: string) => boolean;
}

/** The only authentication failure message. It never says why. */
const GENERIC_SIGN_IN_ERROR = 'Credenciais inválidas.';
const GENERIC_CODE_ERROR = 'Código inválido.';

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<AdminAuthStage>(
    isAdminBackendConfigured ? 'loading' : 'anonymous',
  );
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Re-derives the stage from the live Supabase session.
   *
   * The order matters: MFA is resolved first, because the admin API refuses a
   * session below AAL2 and its refusal is indistinguishable from "you are not
   * an administrator" — asking it before the code has been entered would log
   * the operator out of their own administration.
   */
  const resolve = useCallback(async () => {
    if (!isAdminBackendConfigured) {
      setStage('anonymous');
      setAdmin(null);
      return;
    }

    const supabase = getAdminSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      if (!mounted.current) return;
      setAdmin(null);
      setStage('anonymous');
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.filter(f => f.status === 'verified') ?? [];
      if (!mounted.current) return;
      setAdmin(null);
      setStage(verified.length > 0 ? 'mfa-challenge-required' : 'mfa-enrollment-required');
      return;
    }

    try {
      const session = await fetchAdminSession();
      if (!mounted.current) return;
      setAdmin(session);
      setStage('authorized');
    } catch (err) {
      // Either not an administrator, or the backend refused. Both end the
      // administrative session silently; the normal application is untouched.
      if (!mounted.current) return;
      setAdmin(null);
      setStage('anonymous');
      if (err instanceof AdminAccessDenied) {
        await supabase.auth.signOut();
        setError(GENERIC_SIGN_IN_ERROR);
      } else {
        setError(err instanceof Error ? err.message : GENERIC_SIGN_IN_ERROR);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await resolve();
      if (!cancelled && mounted.current) {
        setStage(current => (current === 'loading' ? 'anonymous' : current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        const supabase = getAdminSupabase();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) {
          // Never surfaces whether the address exists.
          setError(GENERIC_SIGN_IN_ERROR);
          return;
        }
        await resolve();
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [resolve],
  );

  const signOut = useCallback(async () => {
    if (isAdminBackendConfigured) {
      await getAdminSupabase().auth.signOut();
    }
    if (!mounted.current) return;
    setAdmin(null);
    setError(null);
    setStage('anonymous');
  }, []);

  const startEnrollment = useCallback(async (): Promise<AdminEnrollment> => {
    const supabase = getAdminSupabase();
    // A previous, never-verified attempt would block a new enrolment.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Valthoris Admin ${new Date().toISOString().slice(0, 10)}`,
    });
    if (enrollError || !data) throw new Error('MFA enrolment is unavailable.');
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }, []);

  const verifyCode = useCallback(
    async (code: string, factorId?: string) => {
      setBusy(true);
      setError(null);
      try {
        const supabase = getAdminSupabase();
        let targetFactorId = factorId;
        if (!targetFactorId) {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          targetFactorId = factors?.totp?.find(f => f.status === 'verified')?.id;
        }
        if (!targetFactorId) {
          setError(GENERIC_CODE_ERROR);
          return;
        }
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
          factorId: targetFactorId,
          code: code.trim(),
        });
        if (verifyError) {
          setError(GENERIC_CODE_ERROR);
          return;
        }
        await resolve();
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [resolve],
  );

  const can = useCallback(
    (permission: string) => {
      if (!admin) return false;
      return admin.isRoot || admin.permissions.includes(permission);
    },
    [admin],
  );

  const value = useMemo<AdminAuthValue>(
    () => ({
      stage,
      admin,
      busy,
      error,
      configured: isAdminBackendConfigured,
      signIn,
      signOut,
      startEnrollment,
      verifyCode,
      refresh: resolve,
      can,
    }),
    [stage, admin, busy, error, signIn, signOut, startEnrollment, verifyCode, resolve, can],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  return ctx;
}
