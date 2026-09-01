/**
 * Saved conversations of the VALTHORIS assistant.
 *
 * Until this module existed, every visit started from nothing: the sidebar
 * always read "Ainda não existem conversas" and a conversation could not be
 * reopened, so the continuity of the reasoning was lost the moment the tab was
 * closed. The history is kept per account, so two people on the same device
 * never see each other's conversations, and an anonymous visitor keeps a
 * separate one of their own.
 *
 * The store is the browser's own `localStorage`: it holds what the user wrote
 * and what the assistant answered, which is exactly what is needed to reopen a
 * conversation and carry on. The per-turn evidence (source reports, maps) is
 * deliberately *not* persisted — it is a snapshot of one lookup at one moment,
 * it is by far the largest part of a turn, and re-reading it later as if it
 * were current would be misleading.
 */

/** Conversations kept per account. */
export const MAX_CONVERSATIONS = 20;

/**
 * Conversations a free plan will keep once the plans are live.
 *
 * Not enforced yet: the limit today is `MAX_CONVERSATIONS` for everyone. It is
 * declared here so the place to enforce it is already obvious.
 */
export const FREE_PLAN_MAX_CONVERSATIONS = 2;

/**
 * Messages kept per conversation.
 *
 * A conversation that grows without bound eventually exceeds both the storage
 * quota and the model's context window; the oldest turns are dropped first, so
 * what is kept is always the part the next answer depends on.
 */
export const MAX_MESSAGES_PER_CONVERSATION = 40;

const STORAGE_PREFIX = 'valthoris.chat.v1';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** ISO timestamp; parsed back into a `Date` by the caller. */
  timestamp: string;
  grounded?: boolean;
}

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: string;
  messages: StoredMessage[];
}

/** The storage key of one account. */
function storageKey(owner: string | null | undefined): string {
  const account = owner && owner.length > 0 ? owner : 'anonymous';
  return `${STORAGE_PREFIX}:${account}`;
}

/** `localStorage`, or nothing at all when the browser denies it. */
function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Private mode, or storage blocked by policy: the chat still works, it
    // simply does not remember.
    return null;
  }
}

/** One stored message, or `null` when the entry is not one. */
function readMessage(value: unknown): StoredMessage | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const role = raw.role;
  if (role !== 'user' && role !== 'assistant') return null;
  if (typeof raw.content !== 'string' || raw.content.length === 0) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content: raw.content,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
    ...(typeof raw.grounded === 'boolean' ? { grounded: raw.grounded } : {}),
  };
}

/**
 * The conversations of an account, newest first.
 *
 * Anything unreadable (a truncated write, a value from an older format) is
 * discarded rather than allowed to break the page.
 */
export function loadConversations(owner: string | null | undefined): StoredConversation[] {
  const store = storage();
  if (!store) return [];
  let parsed: unknown;
  try {
    const raw = store.getItem(storageKey(owner));
    if (!raw) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const conversations: StoredConversation[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== 'string') continue;
    const messages = Array.isArray(raw.messages)
      ? raw.messages.map(readMessage).filter((m): m is StoredMessage => m !== null)
      : [];
    conversations.push({
      id: raw.id,
      title: typeof raw.title === 'string' && raw.title.length > 0 ? raw.title : 'Conversa',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    });
    if (conversations.length >= MAX_CONVERSATIONS) break;
  }
  return conversations;
}

/**
 * Stores the conversations of an account, within the limits above.
 *
 * A conversation with no message is not stored: an empty "Nova conversa" is a
 * button that was pressed, not something the user wants to come back to.
 */
export function saveConversations(
  owner: string | null | undefined,
  conversations: StoredConversation[],
): void {
  const store = storage();
  if (!store) return;
  const trimmed = conversations
    .filter((conversation) => conversation.messages.length > 0)
    .slice(0, MAX_CONVERSATIONS)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    }));
  try {
    store.setItem(storageKey(owner), JSON.stringify(trimmed));
  } catch {
    // A full quota must never cost the user the answer on screen: the turn
    // simply is not remembered.
  }
}
