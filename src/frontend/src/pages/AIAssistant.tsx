import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  AI_BACKEND_CONFIG_ERROR,
  isAiBackendConfigured,
  sendChat,
} from '../services/aiChatService';
import type { AiChatAnalysis, AiChatMessage } from '../services/aiChatService';
import { useAuth } from '../hooks/useAuth';

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
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

const SUGGESTIONS = [
  '🔍 Analyze this URL for threats',
  '📧 Check if this email is a phishing attempt',
  '🛡 What are the latest cybersecurity threats?',
  '₿ Is this crypto wallet address safe?',
  '📞 Lookup this phone number for scam reports',
  '🌐 Scan this domain for malware',
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
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
        {isUser ? '👤' : '🛡'}
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
        lineHeight: 1.6,
        fontSize: '0.92rem',
      }}>
        {msg.isStreaming ? (
          <TypingIndicator />
        ) : (
          <span
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            role={msg.isError ? 'alert' : undefined}
          >
            {msg.isError ? `⚠ ${msg.content}` : msg.content}
          </span>
        )}
        {msg.analysis && !msg.isStreaming && <AnalysisBadge analysis={msg.analysis} />}
        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.3rem', textAlign: 'right' }}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const { principal } = useAuth();
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
    const conv: Conversation = { id, title: 'New conversation', messages: [], createdAt: new Date() };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    return id;
  }, []);

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
    let history: AiChatMessage[] = [];
    setConversations(prev => prev.map(c => {
      if (c.id !== targetId) return c;
      history = c.messages
        .filter(m => !m.isStreaming && !m.isError && m.content.length > 0)
        .map(m => ({ role: m.role, content: m.content }));
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
      replaceThinking({ content: reply.content, analysis: reply.analysis });
    } catch (err) {
      replaceThinking({
        content: err instanceof Error ? err.message : String(err),
        isError: true,
      });
    } finally {
      setSending(false);
    }
  }, [activeId, createConversation, sending, principal]);

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
            + New Chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {conversations.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0.5rem' }}>
              No conversations yet
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div className="ai-chat-header" style={{
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.2rem' }}>🛡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>VALTHORIS AI Assistant</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Cybersecurity Intelligence •{' '}
              {isAiBackendConfigured ? (
                <span style={{ color: 'var(--accent-green)' }}>Backend connected</span>
              ) : (
                <span style={{ color: 'var(--accent-red, #ff4757)' }}>Backend not configured</span>
              )}
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className="badge-beta">BETA</span>
          </div>
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
              <div style={{ fontSize: '3rem' }}>🛡</div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                VALTHORIS AI Assistant
              </h2>
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400, margin: 0, fontSize: '0.9rem' }}>
                Your AI-powered cybersecurity companion. Ask about threats, scan URLs, analyze suspicious content, and stay protected.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem', width: '100%', maxWidth: 520 }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setInput(s.substring(2)); textareaRef.current?.focus(); }}
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
                    {s}
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
              placeholder="Ask VALTHORIS AI… (Shift+Enter for new line)"
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
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', margin: '0.4rem 0 0' }}>
            VALTHORIS AI may produce errors. Verify critical information.
          </p>
        </div>
      </div>
    </div>
  );
}
