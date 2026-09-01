import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  AI_BACKEND_CONFIG_ERROR,
  isAiBackendConfigured,
  sendChat,
} from '../services/aiChatService';
import type { AiChatAnalysis, AiChatMessage, AiChatSource } from '../services/aiChatService';
import { useAuth } from '../hooks/useAuth';
import SocialShare from '../components/SocialShare';
import NewsTicker from '../components/NewsTicker';
import ValthorisShield from '../components/ValthorisShield';
import PlaceMap from '../components/PlaceMap';
import type { PlaceLocation } from '../components/PlaceMap';
import { useT } from '../i18n/useI18n';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  /** Set when the backend call failed — rendered as an error, never as an answer. */
  isError?: boolean;
  /**
   * Structured verdict produced by the backend security analysis, when the
   * turn contained an analysable artefact. Rendered exactly as received —
   * the UI never derives or invents a verdict of its own.
   */
  analysis?: AiChatAnalysis;
  /** External lookups the backend performed for this turn. */
  sources?: AiChatSource[];
  /** True when the answer was built on sources consulted in this turn. */
  grounded?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

const SUGGESTIONS = [
  { icon: '🚨', key: 'assistant.suggestion.fraudAlerts' },
  { icon: '🕵️', key: 'assistant.suggestion.investigate' },
];

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0.4rem 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--accent-cyan)',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  );
}

const VERDICT_STYLE: Record<string, { label: string; color: string }> = {
  fraud:      { label: 'FRAUD',      color: 'var(--accent-red, #ff4757)' },
  suspicious: { label: 'SUSPICIOUS', color: 'var(--accent-amber, #ffa502)' },
  legitimate: { label: 'LEGITIMATE', color: 'var(--accent-green, #2ed573)' },
  unknown:    { label: 'UNKNOWN',    color: 'var(--text-muted)' },
};

/** Renders the backend verdict, or the real reason it could not be produced. */
function AnalysisBadge({ analysis }: { analysis: AiChatAnalysis }) {
  if (!analysis.recorded || !analysis.verdict) {
    if (!analysis.error) return null;
    return (
      <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--accent-red, #ff4757)' }}>
        ⚠ Security analysis not recorded: {analysis.error}
      </div>
    );
  }
  const style = VERDICT_STYLE[analysis.verdict] ?? VERDICT_STYLE.unknown;
  return (
    <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: style.color }}>
      🛡 Verdict: <strong>{style.label}</strong>
      {typeof analysis.confidenceScore === 'number' && ` • confidence ${analysis.confidenceScore}/100`}
    </div>
  );
}

const SOURCE_STATUS_STYLE: Record<AiChatSource['status'], { icon: string; color: string }> = {
  success:        { icon: '✓', color: 'var(--accent-green, #2ed573)' },
  failed:         { icon: '✕', color: 'var(--accent-amber, #ffa502)' },
  not_configured: { icon: '–', color: 'var(--text-muted)' },
  disabled:       { icon: '⊘', color: 'var(--text-muted)' },
};

/** A coordinate as a provider returned it: a plain decimal number, or nothing. */
function coordinate(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The located place, when a source actually returned coordinates for this turn.
 *
 * Only a successful lookup can produce a map: the UI never derives a position
 * from the answer text, so what is pinned is exactly what the provider said.
 */
function locatedPlace(sources: AiChatSource[]): PlaceLocation | null {
  for (const source of sources) {
    if (source.status !== 'success' || !source.data) continue;
    const lat = coordinate(source.data.latitude);
    const lon = coordinate(source.data.longitude);
    if (lat === undefined || lon === undefined) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    return {
      name: typeof source.data.name === 'string' ? source.data.name : source.entity,
      address: typeof source.data.address === 'string' ? source.data.address : undefined,
      lat,
      lon,
    };
  }
  return null;
}

/**
 * Says whether the answer was verified against live sources in this turn.
 *
 * A model can be right by memory and wrong tomorrow; the user must be able to
 * tell the two apart at a glance.
 */
function GroundingBadge({ grounded }: { grounded: boolean }) {
  return (
    <div
      className="ai-grounding"
      style={{ color: grounded ? 'var(--accent-green, #2ed573)' : 'var(--accent-amber, #ffa502)' }}
    >
      {grounded
        ? '🔎 Resposta verificada em fontes consultadas nesta pergunta.'
        : '🧠 Sem consulta externa nesta pergunta: resposta apenas com o conhecimento do modelo, não verificada em tempo real.'}
    </div>
  );
}

/**
 * One page a search engine actually returned, as reported by the backend.
 * The UI only ever renders what is here; it never resolves a link itself.
 */
interface SourcePage {
  title?: string;
  url?: string;
  uri?: string;
  snippet?: string;
}

/** The pages of a source report, when that source was a web search. */
function sourcePages(data: Record<string, unknown> | undefined): SourcePage[] {
  const pages = data?.pages;
  if (!Array.isArray(pages)) return [];
  return pages.filter((page): page is SourcePage => Boolean(page) && typeof page === 'object');
}

/** An absolute http(s) address, or nothing: a link is never rendered blindly. */
function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/**
 * The pages a web search read, rendered as the links they are.
 *
 * A search result is only useful if the user can open it and check it, so the
 * page list is shown as anchors with the engine's own extract underneath —
 * never as a JSON blob.
 */
function SearchResults({ pages }: { pages: SourcePage[] }) {
  const links = pages
    .map(page => ({ page, href: safeHref(page.url ?? page.uri) }))
    .filter((entry): entry is { page: SourcePage; href: string } => Boolean(entry.href));
  if (links.length === 0) return null;
  return (
    <ul className="ai-sources-pages">
      {links.map(({ page, href }) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: 'var(--accent-blue, #00d4ff)' }}
          >
            {page.title && page.title.length > 0 ? page.title : href}
          </a>
          {page.snippet && <div className="ai-sources-meta">{page.snippet}</div>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sources actually consulted for the answer.
 *
 * Every provider is shown with the outcome of its own lookup, so a partial
 * outage is visible instead of silently narrowing the analysis. Providers that
 * are not available on this deployment are listed as such and are never
 * presented as if they had answered.
 */
function SourcePanel({ sources }: { sources: AiChatSource[] }) {
  const t = useT();
  const consulted = sources.filter(s => s.status !== 'not_configured');
  if (consulted.length === 0) return null;

  return (
    <details className="ai-sources">
      <summary>
        🔗 {t('assistant.sources')} ({consulted.filter(s => s.status === 'success').length}/{consulted.length})
      </summary>
      <ul className="ai-sources-list">
        {consulted.map(source => {
          const style = SOURCE_STATUS_STYLE[source.status];
          const pages = source.status === 'success' ? sourcePages(source.data) : [];
          const scalars = Object.entries(source.data ?? {}).filter(([key]) => key !== 'pages');
          return (
            <li key={`${source.provider}-${source.endpoint}-${source.entity}`}>
              <span style={{ color: style.color }}>{style.icon}</span>{' '}
              <strong>{source.provider}</strong>
              <span className="text-muted"> · {source.endpoint}</span>
              <div className="ai-sources-meta">
                {new Date(source.timestamp).toLocaleString()}
                {source.status === 'failed' && ` · ${t('assistant.sourceUnavailable')}: ${source.error ?? t('assistant.sourceNoAnswer')}`}
              </div>
              {source.status === 'success' && scalars.length > 0 && (
                <div className="ai-sources-data">
                  {scalars.map(([key, value]) => (
                    <span key={key}>
                      {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  ))}
                </div>
              )}
              <SearchResults pages={pages} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Absolute http(s) links inside an answer, so a map or site link is clickable. */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Renders the assistant text with its links as real anchors.
 *
 * The answer carries a map link and, often, the official site of a place; as
 * plain text they cannot be opened. Only absolute `http(s)` URLs are turned
 * into anchors and they are never rendered as HTML, so nothing in the model
 * output can inject markup. Trailing punctuation is left in the text.
 */
function AssistantText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  for (let match = URL_RE.exec(text); match; match = URL_RE.exec(text)) {
    const raw = match[0].replace(/[.,;:!?]+$/, '');
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <a
        key={`${match.index}-${raw}`}
        href={raw}
        target="_blank"
        rel="noopener noreferrer nofollow"
        style={{ color: 'var(--accent-blue, #00d4ff)', wordBreak: 'break-all' }}
      >
        {raw}
      </a>,
    );
    last = match.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const place = !isUser && msg.sources ? locatedPlace(msg.sources) : null;
  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: '0.75rem',
        alignItems: 'flex-start',
        maxWidth: '85%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: isUser ? 'var(--accent-blue)' : 'rgba(0,212,255,0.15)',
        border: isUser ? 'none' : '1px solid rgba(0,212,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.9rem',
        flexShrink: 0,
      }}>
        {isUser ? '👤' : <ValthorisShield size={20} />}
      </div>
      <div style={{
        background: isUser
          ? 'var(--accent-blue)'
          : msg.isError
            ? 'rgba(255,71,87,0.12)'
            : 'rgba(10,37,64,0.9)',
        border: isUser
          ? 'none'
          : msg.isError
            ? '1px solid var(--accent-red, #ff4757)'
            : '1px solid rgba(0,212,255,0.15)',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding: '0.65rem 1rem',
        maxWidth: '100%',
        /*
         * Without `minWidth: 0` a flex item cannot shrink below its
         * min-content width, and a bubble holding a long word would push the
         * row past the screen in the installed PWA.
         */
        minWidth: 0,
        lineHeight: 1.6,
        fontSize: '0.92rem',
      }}>
        {msg.isStreaming ? (
          <TypingIndicator />
        ) : (
          <span
            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
            role={msg.isError ? 'alert' : undefined}
          >
            {msg.isError ? `⚠ ${msg.content}` : <AssistantText text={msg.content} />}
          </span>
        )}
        {!isUser && !msg.isStreaming && !msg.isError && place && <PlaceMap place={place} />}
        {msg.analysis && !msg.isStreaming && <AnalysisBadge analysis={msg.analysis} />}
        {!isUser && !msg.isStreaming && !msg.isError && msg.grounded !== undefined && (
          <GroundingBadge grounded={msg.grounded} />
        )}
        {msg.sources && msg.sources.length > 0 && !msg.isStreaming && <SourcePanel sources={msg.sources} />}
        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.3rem', textAlign: 'right' }}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const { principal } = useAuth();
  const t = useT();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConv = conversations.find(c => c.id === activeId) ?? null;

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [input, autoGrow]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  /**
   * The Android keyboard shrinks the visual viewport instead of the layout
   * viewport, so the newest message can end up behind it. Re-anchoring the
   * conversation whenever the visual viewport resizes keeps the last message
   * and the composer in view while the user types.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    };
    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, []);

  const createConversation = useCallback(() => {
    const id = Date.now().toString();
    const conv: Conversation = { id, title: t('assistant.newConversation'), messages: [], createdAt: new Date() };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    return id;
  }, [t]);

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;

    let convId = activeId;
    if (!convId) {
      convId = createConversation();
    }
    const targetId = convId;

    const userMsg: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const thinkingId = `${Date.now()}-assistant`;
    const thinkingMsg: Message = {
      id: thinkingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    // Request payload = the conversation as it stands *before* this turn plus
    // the new user message. Failed turns are never replayed to the model as if
    // they had been real assistant answers.
    //
    // The history is read from the rendered state, never from inside the
    // updater below: a state updater does not run synchronously, so collecting
    // the history there left it empty for the request that is dispatched a few
    // lines further down. Every turn then reached the model alone, which is why
    // the assistant treated each message as the first one of the session and
    // could not resolve "a morada?" against the place named one turn earlier.
    const previous = conversations.find(c => c.id === targetId);
    const history: AiChatMessage[] = (previous?.messages ?? [])
      .filter(m => !m.isStreaming && !m.isError && m.content.length > 0)
      .map(m => ({ role: m.role, content: m.content }));

    setConversations(prev => prev.map(c => {
      if (c.id !== targetId) return c;
      return {
        ...c,
        title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
        messages: [...c.messages, userMsg, thinkingMsg],
      };
    }));
    setInput('');
    setSending(true);

    const replaceThinking = (patch: Partial<Message>) => {
      setConversations(prev => prev.map(c => c.id === targetId
        ? {
            ...c,
            messages: c.messages.map(m => m.id === thinkingId
              ? { ...m, isStreaming: false, ...patch }
              : m
            ),
          }
        : c
      ));
    };

    try {
      const reply = await sendChat([...history, { role: 'user', content }], principal);
      replaceThinking({
        content: reply.content,
        analysis: reply.analysis,
        sources: reply.sources,
        grounded: reply.grounded,
      });
    } catch (err) {
      replaceThinking({
        content: err instanceof Error ? err.message : String(err),
        isError: true,
      });
    } finally {
      setSending(false);
    }
  }, [activeId, conversations, createConversation, sending, principal]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setInput(prev => prev + (prev ? '\n' : '') + `[File: ${files.map(f => f.name).join(', ')}]`);
    }
  };

  return (
    <div className="ai-assistant-shell" style={{ display: 'flex', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Conversation list — hidden on mobile via CSS */}
      <div className="ai-conv-list" style={{
        width: 220,
        minWidth: 220,
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <button
            className="btn-primary"
            style={{ width: '100%', fontSize: '0.82rem', padding: '0.4rem' }}
            onClick={createConversation}
          >
            {t('assistant.newChat')}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {conversations.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0.5rem' }}>
              {t('assistant.noConversations')}
            </p>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                style={{
                  width: '100%',
                  background: conv.id === activeId ? 'rgba(0,212,255,0.1)' : 'none',
                  border: conv.id === activeId ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                  borderRadius: 6,
                  padding: '0.5rem 0.6rem',
                  color: conv.id === activeId ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  marginBottom: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                💬 {conv.title}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="ai-chat-column" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div className="ai-chat-header">
          <ValthorisShield size={28} className="ai-chat-header-shield" />
          <div className="ai-chat-header-text">
            <div className="ai-chat-header-title">VALTHORIS AI Assistant</div>
            <div className="ai-chat-header-subtitle">
              {t('assistant.subtitle')} •{' '}
              {isAiBackendConfigured ? (
                <span style={{ color: 'var(--accent-green)' }}>{t('assistant.backendConnected')}</span>
              ) : (
                <span style={{ color: 'var(--accent-red, #ff4757)' }}>{t('assistant.backendMissing')}</span>
              )}
            </div>
          </div>
          <span className="badge-beta ai-chat-header-badge">BETA</span>
        </div>

        {/* Messages */}
        <div
          className="ai-messages"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {dragging && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,212,255,0.08)',
              border: '2px dashed var(--accent-cyan)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              pointerEvents: 'none',
              fontSize: '1.1rem',
              color: 'var(--accent-cyan)',
            }}>
              Drop files to attach
            </div>
          )}

          {!isAiBackendConfigured && (
            <div className="alert-error" role="alert" style={{ fontSize: '0.82rem' }}>
              {AI_BACKEND_CONFIG_ERROR}
            </div>
          )}

          {!activeConv || activeConv.messages.length === 0 ? (
            /* Welcome screen */
            <div className="ai-welcome" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
              <ValthorisShield size={72} className="ai-welcome-shield" />
              <h2 className="ai-welcome-title" style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                {t('assistant.title')}
              </h2>
              <p className="ai-welcome-subtitle" style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400, margin: 0, fontSize: '0.9rem' }}>
                {t('assistant.welcome')}
              </p>
              <div className="ai-welcome-suggestions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem', width: '100%', maxWidth: 520 }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.key}
                    onClick={() => { setInput(t(s.key)); textareaRef.current?.focus(); }}
                    style={{
                      background: 'rgba(10,37,64,0.8)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '0.6rem 0.8rem',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.82rem',
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                      e.currentTarget.style.color = 'var(--accent-cyan)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    {s.icon} {t(s.key)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeConv.messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — stays visible when the Android keyboard is open */}
        <div className="ai-composer" style={{
          padding: '1rem 1.5rem',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-end',
            background: 'rgba(10,37,64,0.9)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.5rem 0.75rem',
          }}>
            {/* Attach */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.1rem',
                padding: '0.25rem',
                flexShrink: 0,
              }}
            >
              📎
            </button>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} multiple onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setInput(prev => prev + (prev ? '\n' : '') + `[File: ${files.map(f => f.name).join(', ')}]`);
              e.target.value = '';
            }} />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('assistant.placeholder')}
              rows={1}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                resize: 'none',
                outline: 'none',
                fontSize: '0.92rem',
                lineHeight: 1.5,
                overflowY: 'auto',
                padding: '0.25rem 0',
                width: '100%',
                minHeight: '1.5em',
                maxHeight: 200,
              }}
            />

            <button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || sending}
              aria-label="Send message"
              style={{
                background: input.trim() && !sending ? 'var(--accent-cyan)' : 'var(--border)',
                border: 'none',
                borderRadius: 8,
                color: input.trim() && !sending ? 'var(--bg-primary)' : 'var(--text-muted)',
                cursor: input.trim() && !sending ? 'pointer' : 'default',
                padding: '0.4rem 0.7rem',
                fontSize: '1rem',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              {sending ? '⏳' : '➤'}
            </button>
          </div>
          <p className="ai-composer-note" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', margin: '0.4rem 0 0' }}>
            {t('assistant.disclaimer')}
          </p>
          {/* Fills the gap between the disclaimer and the bottom navigation. */}
          <SocialShare className="ai-social-share" />
          {/* Full-width headlines, between the share row and the bottom nav. */}
          <NewsTicker className="ai-news-ticker" />
        </div>
      </div>
    </div>
  );
}
