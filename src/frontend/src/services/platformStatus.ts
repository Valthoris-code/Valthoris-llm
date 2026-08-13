/**
 * Platform status service — Administration area.
 *
 * Every value returned by this module comes from a real call:
 *   • canister reachability / version / statistics → the canisters themselves
 *   • cycles, memory, controllers, module hash     → the IC management canister
 *     (`canister_status`), which only answers a controller. When the signed-in
 *     administrator is not a controller of a canister, or the call fails for
 *     any other reason, the status is reported as UNAVAILABLE with the real
 *     error — never as "Operational".
 *   • Supabase                                     → the project health endpoint
 *   • AI backend                                   → an explicit, operator
 *     triggered call to the `ai-chat` Edge Function
 *
 * Nothing here is fabricated: a probe either produced an answer or it did not.
 */

import { Actor, HttpAgent } from '@dfinity/agent';
import type { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { CANISTER_IDS, IC_HOST } from './canisterIds';
import type { Actors } from './actors';
import { getSupabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR, SUPABASE_URL } from './supabaseClient';
import { AI_BACKEND_CONFIG_ERROR, isAiBackendConfigured, sendChat } from './aiChatService';
import {
  isSafeRoomBackendConfigured,
  probeSafeRoomBackend as safeRoomHealth,
  SAFE_ROOM_CONFIG_ERROR,
} from './safeRoomService';

export type ProbeState = 'operational' | 'unavailable';

export interface ServiceStatus {
  /** Human label shown in the Administration table. */
  name: string;
  /** Canister id, when the service is an ICP canister. */
  canisterId?: string;
  state: ProbeState;
  /** Short factual summary of what the probe returned. */
  detail: string;
  /** Real error text when the probe failed. */
  error?: string;
  /** Extra key/value facts returned by the probe. */
  facts?: Array<[string, string]>;
}

export interface CanisterRuntimeStatus {
  canisterId: string;
  name: string;
  /** Present only when the management canister answered. */
  runState?: string;
  cycles?: bigint;
  memorySize?: bigint;
  idleCyclesBurnedPerDay?: bigint;
  moduleHash?: string;
  controllers?: string[];
  /** Real error when `canister_status` could not be read. */
  error?: string;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Canister service probes ────────────────────────────────────────────────

async function probeBackend(actors: Actors): Promise<ServiceStatus> {
  const base = { name: 'Backend (profiles, roles)', canisterId: CANISTER_IDS.backend };
  try {
    const [healthy, version, stats] = await Promise.all([
      actors.backend.healthCheck(),
      actors.backend.getVersion(),
      actors.backend.getSystemStats(),
    ]);
    if (!healthy) {
      return { ...base, state: 'unavailable', detail: 'healthCheck() returned false' };
    }
    return {
      ...base,
      state: 'operational',
      detail: `version ${version}`,
      facts: [
        ['Registered profiles', String(stats.totalUsers)],
        ['Canister version', stats.version],
      ],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

async function probeCommunity(actors: Actors): Promise<ServiceStatus> {
  const base = { name: 'Community reports', canisterId: CANISTER_IDS.community };
  try {
    const stats = await actors.community.getStats();
    return {
      ...base,
      state: 'operational',
      detail: `${stats.totalReports} reports stored`,
      facts: [
        ['Total reports', String(stats.totalReports)],
        ['Confirmed threats', String(stats.confirmedThreats)],
        ['Pending reports', String(stats.pendingReports)],
        ['Total votes', String(stats.totalVotes)],
      ],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

async function probeIdentity(actors: Actors): Promise<ServiceStatus> {
  const base = { name: 'Identity / Lookup', canisterId: CANISTER_IDS.identity };
  try {
    const size = await actors.identity.getDatabaseSize();
    return {
      ...base,
      state: 'operational',
      detail: `${size} reputation records`,
      facts: [['Reputation records', String(size)]],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

async function probeThreatIntelligence(actors: Actors): Promise<ServiceStatus> {
  const base = { name: 'Threat Intelligence', canisterId: CANISTER_IDS.threat_intelligence };
  try {
    const stats = await actors.threatIntelligence.getStats();
    return {
      ...base,
      state: 'operational',
      detail: `${stats.activeThreats} active indicators`,
      facts: [
        ['Total entries', String(stats.totalEntries)],
        ['Active threats', String(stats.activeThreats)],
        ['Critical', String(stats.criticalThreats)],
        ['High', String(stats.highThreats)],
      ],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

async function probeSafeLocation(actors: Actors): Promise<ServiceStatus> {
  const base = { name: 'Safe Location', canisterId: CANISTER_IDS.safe_location };
  try {
    // Authenticated query scoped to the caller: proves the canister answers and
    // that the delegation is accepted, without reading anyone else's data.
    const shares = await actors.safeLocation.listMyShares();
    return {
      ...base,
      state: 'operational',
      detail: 'Canister answered an authenticated query',
      facts: [['Your active shares', String(shares.length)]],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

// ─── Supabase probe ─────────────────────────────────────────────────────────

async function probeSupabase(): Promise<ServiceStatus> {
  const base = { name: 'Supabase' };
  if (!isSupabaseConfigured || !SUPABASE_URL) {
    return { ...base, state: 'unavailable', detail: 'Not configured', error: SUPABASE_CONFIG_ERROR };
  }
  try {
    // The auth health endpoint is public and returns the running version.
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`);
    if (!res.ok) {
      return {
        ...base,
        state: 'unavailable',
        detail: 'Status unavailable',
        error: `Supabase health endpoint returned HTTP ${res.status}`,
      };
    }
    const body = (await res.json().catch(() => null)) as { version?: string } | null;
    return {
      ...base,
      state: 'operational',
      detail: body?.version ? `reachable (${body.version})` : 'reachable',
      facts: [['Project URL', SUPABASE_URL]],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

/**
 * Confirms that the browser can reach the Supabase REST API with the anon key.
 * Used to distinguish "project up" from "project up and API key valid".
 */
export async function probeSupabaseApi(): Promise<ServiceStatus> {
  const base = { name: 'Supabase REST API (anon key)' };
  if (!isSupabaseConfigured) {
    return { ...base, state: 'unavailable', detail: 'Not configured', error: SUPABASE_CONFIG_ERROR };
  }
  try {
    const { error } = await getSupabase()
      .from('waiting_list')
      .select('id', { count: 'exact', head: true });
    if (error) {
      return { ...base, state: 'unavailable', detail: 'Status unavailable', error: error.message };
    }
    return { ...base, state: 'operational', detail: 'Anon key accepted by PostgREST' };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

/**
 * Safe Rooms backend probe.
 *
 * The `health` action neither creates a room nor reads participant data, so
 * this probe is safe to run with every status refresh.
 */
async function probeSafeRoomBackend(): Promise<ServiceStatus> {
  const base = { name: 'Safe Rooms backend (safe-room)' };
  if (!isSafeRoomBackendConfigured) {
    return { ...base, state: 'unavailable', detail: 'Not configured', error: SAFE_ROOM_CONFIG_ERROR };
  }
  try {
    const health = await safeRoomHealth();
    if (health.status !== 'configured' || health.storage !== 'connected') {
      return {
        ...base,
        state: 'unavailable',
        detail: 'Not configured',
        error:
          'The safe-room Edge Function is deployed but SUPABASE_URL / ' +
          'SUPABASE_SERVICE_ROLE_KEY are missing in its environment.',
      };
    }
    return {
      ...base,
      state: 'operational',
      detail: 'Edge Function reachable, storage connected',
      facts: [
        ['Secrets', 'CONFIGURED'],
        ['Storage', 'CONNECTED'],
        ['Max participants', String(health.limits.maxParticipants)],
        ['Max duration', `${health.limits.maxDurationMinutes} min`],
        ['Max radius', `${health.limits.maxRadiusMeters} m`],
      ],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

// ─── AI backend probe (operator triggered — it costs a real API call) ───────

export async function probeAiBackend(): Promise<ServiceStatus> {
  const base = { name: 'AI Assistant backend (ai-chat)' };
  if (!isAiBackendConfigured) {
    return { ...base, state: 'unavailable', detail: 'Not configured', error: AI_BACKEND_CONFIG_ERROR };
  }
  try {
    const reply = await sendChat([
      { role: 'user', content: 'Reply with the single word: ok' },
    ]);
    return {
      ...base,
      state: 'operational',
      detail: `${reply.provider} / ${reply.model}`,
      facts: [
        ['Provider', reply.provider],
        ['Model', reply.model],
      ],
    };
  } catch (err) {
    return { ...base, state: 'unavailable', detail: 'Status unavailable', error: message(err) };
  }
}

// ─── IC management canister (cycles, memory, controllers) ───────────────────

const MANAGEMENT_CANISTER_ID = 'aaaaa-aa';

/** Minimal IDL covering only `canister_status`. */
const managementIdl = ({ IDL }: { IDL: any }) => {
  const canisterId = IDL.Principal;
  const definiteCanisterSettings = IDL.Record({
    controllers: IDL.Vec(IDL.Principal),
    compute_allocation: IDL.Nat,
    memory_allocation: IDL.Nat,
    freezing_threshold: IDL.Nat,
  });
  const canisterStatusResult = IDL.Record({
    status: IDL.Variant({ stopped: IDL.Null, stopping: IDL.Null, running: IDL.Null }),
    settings: definiteCanisterSettings,
    module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    memory_size: IDL.Nat,
    cycles: IDL.Nat,
    idle_cycles_burned_per_day: IDL.Nat,
  });
  return IDL.Service({
    canister_status: IDL.Func(
      [IDL.Record({ canister_id: canisterId })],
      [canisterStatusResult],
      [],
    ),
  });
};

interface ManagementService {
  canister_status: (arg: { canister_id: Principal }) => Promise<{
    status: { running?: null; stopping?: null; stopped?: null };
    settings: { controllers: Principal[] };
    module_hash: [] | [Uint8Array | number[]];
    memory_size: bigint;
    cycles: bigint;
    idle_cycles_burned_per_day: bigint;
  }>;
}

function toHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Reads live canister status from the IC management canister.
 *
 * Only a controller may call `canister_status`; for anybody else the IC
 * rejects the call and the real rejection message is returned so the
 * Administration page can say "Status unavailable" honestly.
 */
export async function fetchCanisterRuntimeStatus(
  identity: Identity | null,
  entries: Array<{ name: string; canisterId: string }>,
): Promise<CanisterRuntimeStatus[]> {
  if (!identity) {
    return entries.map(e => ({
      ...e,
      error: 'Not authenticated — canister_status requires a controller identity.',
    }));
  }

  const agent = HttpAgent.createSync({ host: IC_HOST, identity });
  if (IC_HOST.includes('127.0.0.1')) {
    try {
      await agent.fetchRootKey();
    } catch (err) {
      console.error('[VALTHORIS] fetchRootKey failed:', err);
    }
  }

  const management = Actor.createActor<ManagementService>(managementIdl, {
    agent,
    canisterId: MANAGEMENT_CANISTER_ID,
    // The management canister requires the target canister as the effective id.
    callTransform: (_method: string, args: unknown[]) => {
      const [first] = args as Array<{ canister_id?: Principal }>;
      return first?.canister_id ? { effectiveCanisterId: first.canister_id } : undefined;
    },
    queryTransform: (_method: string, args: unknown[]) => {
      const [first] = args as Array<{ canister_id?: Principal }>;
      return first?.canister_id ? { effectiveCanisterId: first.canister_id } : undefined;
    },
  });

  return Promise.all(
    entries.map(async (entry): Promise<CanisterRuntimeStatus> => {
      try {
        const res = await management.canister_status({
          canister_id: Principal.fromText(entry.canisterId),
        });
        const runState =
          'running' in res.status ? 'running'
          : 'stopping' in res.status ? 'stopping'
          : 'stopped';
        const [hash] = res.module_hash;
        return {
          ...entry,
          runState,
          cycles: res.cycles,
          memorySize: res.memory_size,
          idleCyclesBurnedPerDay: res.idle_cycles_burned_per_day,
          moduleHash: hash ? toHex(hash) : undefined,
          controllers: res.settings.controllers.map(c => c.toText()),
        };
      } catch (err) {
        return { ...entry, error: message(err) };
      }
    }),
  );
}

/** The canisters that make up the deployed Valthoris platform. */
export const PLATFORM_CANISTERS: Array<{ name: string; canisterId: string }> = [
  { name: 'backend', canisterId: CANISTER_IDS.backend },
  { name: 'community', canisterId: CANISTER_IDS.community },
  { name: 'identity', canisterId: CANISTER_IDS.identity },
  { name: 'threat_intelligence', canisterId: CANISTER_IDS.threat_intelligence },
  { name: 'safe_location', canisterId: CANISTER_IDS.safe_location },
];

/** Runs every non-billable service probe in parallel. */
export async function fetchServiceStatuses(actors: Actors): Promise<ServiceStatus[]> {
  return Promise.all([
    probeBackend(actors),
    probeCommunity(actors),
    probeIdentity(actors),
    probeThreatIntelligence(actors),
    probeSafeLocation(actors),
    probeSupabase(),
    probeSupabaseApi(),
    probeSafeRoomBackend(),
  ]);
}

/** Formats a cycles balance as a compact, readable string. */
export function formatCycles(cycles: bigint): string {
  const trillion = 1_000_000_000_000n;
  const billion = 1_000_000_000n;
  if (cycles >= trillion) {
    return `${(Number(cycles) / Number(trillion)).toFixed(3)} T`;
  }
  if (cycles >= billion) {
    return `${(Number(cycles) / Number(billion)).toFixed(3)} B`;
  }
  return cycles.toString();
}

/** Formats a byte count in MiB. */
export function formatBytes(bytes: bigint): string {
  return `${(Number(bytes) / (1024 * 1024)).toFixed(2)} MiB`;
}
