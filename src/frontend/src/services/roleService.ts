import { createActors } from './actors';
import { getIdentity } from './auth';
import type { UserRole } from '../models/User';
import type {
  ManagedUser as BackendManagedUser,
  UserRole as BackendUserRole,
} from '../../../declarations/backend/index.d.ts';

export interface ManagedUser {
  principal: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  registeredAt: number;
}

function backendRoleToUserRole(role: BackendUserRole): UserRole {
  if ('administrator' in role) return 'administrator';
  if ('moderator' in role) return 'moderator';
  return 'member';
}

function userRoleToBackendRole(role: UserRole): BackendUserRole {
  switch (role) {
    case 'administrator':
      return { administrator: null };
    case 'moderator':
      return { moderator: null };
    case 'member':
    default:
      return { member: null };
  }
}

function mapManagedUser(user: BackendManagedUser): ManagedUser {
  return {
    principal: user.principal,
    displayName: user.displayName,
    role: backendRoleToUserRole(user.role),
    isActive: user.isActive,
    registeredAt: Number(user.registeredAt / BigInt(1_000_000)),
  };
}

async function getBackend() {
  const identity = await getIdentity();
  return createActors(identity).backend;
}

function sortUsers(users: ManagedUser[]): ManagedUser[] {
  return [...users].sort((a, b) => a.registeredAt - b.registeredAt);
}

export async function getAllUsers(): Promise<ManagedUser[]> {
  const backend = await getBackend();
  const result = await backend.listManagedUsers();
  if ('err' in result) throw new Error(result.err);
  return sortUsers(result.ok.map(mapManagedUser));
}

export async function ensureUser(): Promise<ManagedUser> {
  const backend = await getBackend();
  const result = await backend.ensureManagedUser();
  if ('err' in result) throw new Error(result.err);
  return mapManagedUser(result.ok);
}

async function setUserRole(principal: string, role: UserRole): Promise<ManagedUser> {
  const backend = await getBackend();
  const result = await backend.setUserRole(principal, userRoleToBackendRole(role));
  if ('err' in result) throw new Error(result.err);
  return mapManagedUser(result.ok);
}

export async function promoteUser(principal: string, currentRole: UserRole): Promise<ManagedUser> {
  const next: Record<UserRole, UserRole> = {
    member: 'moderator',
    moderator: 'administrator',
    administrator: 'administrator',
  };
  return setUserRole(principal, next[currentRole]);
}

export async function demoteUser(principal: string, currentRole: UserRole): Promise<ManagedUser> {
  const prev: Record<UserRole, UserRole> = {
    administrator: 'moderator',
    moderator: 'member',
    member: 'member',
  };
  return setUserRole(principal, prev[currentRole]);
}

async function setUserActive(principal: string, isActive: boolean): Promise<ManagedUser> {
  const backend = await getBackend();
  const result = await backend.setUserActive(principal, isActive);
  if ('err' in result) throw new Error(result.err);
  return mapManagedUser(result.ok);
}

export function deactivateUser(principal: string): Promise<ManagedUser> {
  return setUserActive(principal, false);
}

export function reactivateUser(principal: string): Promise<ManagedUser> {
  return setUserActive(principal, true);
}
