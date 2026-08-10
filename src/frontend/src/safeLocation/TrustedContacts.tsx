import React, { useState } from 'react';
import EmptyState from '../components/ui/EmptyState';
import { CONTACT_PERMISSIONS, createId } from './model';
import type { ContactPermission, TrustedContact } from './model';

interface Props {
  contacts: TrustedContact[];
  onChange: (contacts: TrustedContact[]) => void;
  /** True while the canister-backed configuration is still being fetched. */
  loading?: boolean;
}

const EMPTY_FORM = { name: '', handle: '', relation: '' };

/** Trusted contacts list with per-contact permission management. */
export default function TrustedContacts({ contacts, onChange, loading = false }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [expanded, setExpanded] = useState<string | null>(null);

  const addContact = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.handle.trim()) return;
    const contact: TrustedContact = {
      id: createId('contact'),
      name: form.name.trim(),
      handle: form.handle.trim(),
      relation: form.relation.trim() || 'Contact',
      permissions: ['view-live', 'receive-sos'],
    };
    onChange([...contacts, contact]);
    setForm(EMPTY_FORM);
  };

  const togglePermission = (id: string, permission: ContactPermission) => {
    onChange(
      contacts.map(contact =>
        contact.id === id
          ? {
              ...contact,
              permissions: contact.permissions.includes(permission)
                ? contact.permissions.filter(p => p !== permission)
                : [...contact.permissions, permission],
            }
          : contact
      )
    );
  };

  return (
    <section className="card safe-panel">
      <h2 className="section-title">👥 Trusted contacts</h2>

      <form className="safe-inline-form" onSubmit={addContact}>
        <label className="field">
          <span className="field-label">Name</span>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </label>
        <label className="field">
          <span className="field-label">Principal or handle</span>
          <input
            value={form.handle}
            onChange={e => setForm(f => ({ ...f, handle: e.target.value }))}
            placeholder="xxxxx-xxxxx-…-cai"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Relation</span>
          <input
            value={form.relation}
            onChange={e => setForm(f => ({ ...f, relation: e.target.value }))}
            placeholder="Family, friend…"
          />
        </label>
        <button type="submit" className="btn-primary safe-inline-submit">
          ➕ Add contact
        </button>
      </form>

      {loading ? (
        <div className="spinner" role="status" aria-label="Loading trusted contacts" />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No trusted contacts yet"
          body="Add the people who should be able to see your location or receive an SOS alert."
        />
      ) : (
        <ul className="safe-list">
          {contacts.map(contact => {
            const open = expanded === contact.id;
            return (
              <li key={contact.id} className="safe-list-item">
                <div className="safe-list-head">
                  <span aria-hidden="true" className="safe-avatar">
                    {contact.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="safe-list-text">
                    <strong>{contact.name}</strong>
                    <span className="text-muted safe-list-sub">
                      {contact.relation} · <code>{contact.handle}</code>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary safe-mini-btn"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : contact.id)}
                  >
                    🔐 Permissions
                  </button>
                  <button
                    type="button"
                    className="btn-danger safe-mini-btn"
                    onClick={() => onChange(contacts.filter(c => c.id !== contact.id))}
                    aria-label={`Remove ${contact.name}`}
                  >
                    🗑
                  </button>
                </div>

                {open && (
                  <div className="safe-permissions">
                    {CONTACT_PERMISSIONS.map(permission => (
                      <label key={permission.id} className="safe-permission">
                        <input
                          type="checkbox"
                          checked={contact.permissions.includes(permission.id)}
                          onChange={() => togglePermission(contact.id, permission.id)}
                        />
                        <span>
                          <strong>{permission.label}</strong>
                          <span className="text-muted safe-list-sub">{permission.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
