import { Actor, HttpAgent } from '@dfinity/agent';
import type { Identity } from '@dfinity/agent';
import { IC_HOST, CANISTER_IDS } from './canisterIds';

// IDL factories
import { idlFactory as backendIdl }             from '../../../declarations/backend/index.js';
import { idlFactory as communityIdl }           from '../../../declarations/community/index.js';
import { idlFactory as identityIdl }            from '../../../declarations/identity/index.js';
import { idlFactory as threatIntelligenceIdl }  from '../../../declarations/threat_intelligence/index.js';
import { idlFactory as safeLocationIdl }        from '../../../declarations/safe_location/index.js';

// TypeScript service types
import type { _SERVICE as BackendService }            from '../../../declarations/backend/index.d.ts';
import type { _SERVICE as CommunityService }          from '../../../declarations/community/index.d.ts';
import type { _SERVICE as IdentityService }           from '../../../declarations/identity/index.d.ts';
import type { _SERVICE as ThreatIntelligenceService } from '../../../declarations/threat_intelligence/index.d.ts';
import type { _SERVICE as SafeLocationService }       from '../../../declarations/safe_location/index.d.ts';

export interface Actors {
  backend:            BackendService;
  community:          CommunityService;
  identity:           IdentityService;
  threatIntelligence: ThreatIntelligenceService;
  safeLocation:       SafeLocationService;
}

function createAgent(identity?: Identity): HttpAgent {
  const agent = HttpAgent.createSync({
    host: IC_HOST,
    identity,
  });
  // Only fetch root key on local replica — never on mainnet
  if (IC_HOST.includes('127.0.0.1')) {
    agent.fetchRootKey().catch(console.error);
  }
  return agent;
}

function makeActor<T>(idl: any, canisterId: string, agent: HttpAgent): T {
  return Actor.createActor<T>(idl, { agent, canisterId });
}

/** Returns fully typed actors using the provided Internet Identity principal. */
export function createActors(identity?: Identity): Actors {
  const agent = createAgent(identity);
  return {
    backend:            makeActor<BackendService>(backendIdl, CANISTER_IDS.backend, agent),
    community:          makeActor<CommunityService>(communityIdl, CANISTER_IDS.community, agent),
    identity:           makeActor<IdentityService>(identityIdl, CANISTER_IDS.identity, agent),
    threatIntelligence: makeActor<ThreatIntelligenceService>(threatIntelligenceIdl, CANISTER_IDS.threat_intelligence, agent),
    safeLocation:       makeActor<SafeLocationService>(safeLocationIdl, CANISTER_IDS.safe_location, agent),
  };
}

/** Anonymous (read-only) actors — safe for public query calls. */
let _anonActors: Actors | null = null;
export function getAnonActors(): Actors {
  if (!_anonActors) _anonActors = createActors();
  return _anonActors;
}
