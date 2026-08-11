import React, { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import { useToast } from '../components/ui/Toast';
import { useT } from '../i18n/useI18n';

const CATEGORIES = [
  { id: 'support', icon: '🛟', labelKey: 'contact.support', desc: 'Account, access and general product questions.' },
  { id: 'bug', icon: '🐞', labelKey: 'contact.bug', desc: 'Something is broken or behaves unexpectedly.' },
  { id: 'feature', icon: '💡', labelKey: 'contact.feature', desc: 'Suggest an improvement or a new module.' },
  { id: 'business', icon: '🤝', labelKey: 'contact.business', desc: 'Partnerships, enterprise and licensing.' },
  { id: 'media', icon: '📰', labelKey: 'contact.media', desc: 'Press enquiries and interviews.' },
  { id: 'incident', icon: '🚨', labelKey: 'contact.incident', desc: 'Report a vulnerability or a security incident.' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

/** Published support address — the only real delivery channel today. */
const CONTACT_ADDRESS = 'contact@valthoris.com';

export default function Contact() {
  const t = useT();
  const { toast } = useToast();
  const [category, setCategory] = useState<CategoryId>('support');
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  /**
   * Valthoris has no support-intake backend, so the form does not pretend to
   * deliver anything: it hands the message to the operator's own mail client,
   * addressed to the published contact address. Nothing is reported as sent
   * that was not actually handed over.
   */
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const label = CATEGORIES.find(c => c.id === category)!.labelKey;
    const subject = `[${t(label)}] ${form.subject}`;
    const body = `${form.message}\n\n—\n${form.name} <${form.email}>`;
    window.location.href =
      `mailto:${CONTACT_ADDRESS}?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    toast(`Opening your mail client to send this message to ${CONTACT_ADDRESS}.`, 'info');
  };

  return (
    <div className="page">
      <PageHeader
        icon="✉️"
        title={t('contact.title')}
        subtitle="Choose a channel and we will route your message to the right team."
        badge={<span className="badge-beta">{t('common.beta')}</span>}
      />

      <div className="contact-grid">
        {CATEGORIES.map(item => {
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(item.id)}
              className={`card contact-card${active ? ' contact-card-active' : ''}`}
            >
              <span aria-hidden="true" className="contact-icon">{item.icon}</span>
              <span className="contact-label">{t(item.labelKey)}</span>
              <span className="contact-desc">{item.desc}</span>
            </button>
          );
        })}
      </div>

      <form className="card mt-3 contact-form" onSubmit={handleSubmit}>
        <h2 className="section-title">{t(CATEGORIES.find(c => c.id === category)!.labelKey)}</h2>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Subject</span>
          <input
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Message</span>
          <textarea
            rows={6}
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            required
          />
        </label>

        <button type="submit" className="btn-primary">
          {t('contact.send')}
        </button>

        <p className="text-muted contact-note">
          There is no automated intake service yet, so this form opens your mail client with the
          message addressed to <a href={`mailto:${CONTACT_ADDRESS}`}>{CONTACT_ADDRESS}</a>. Security
          incidents follow the Responsible Disclosure policy.
        </p>
      </form>
    </div>
  );
}
