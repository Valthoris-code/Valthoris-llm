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

export default function Contact() {
  const t = useT();
  const { toast } = useToast();
  const [category, setCategory] = useState<CategoryId>('support');
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    // TODO(backend): submit to the VALTHORIS support intake service.
    await new Promise(resolve => setTimeout(resolve, 700));
    setSending(false);
    setForm({ name: '', email: '', subject: '', message: '' });
    toast('Message queued — backend delivery is not connected yet.', 'info');
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

        <button type="submit" className="btn-primary" disabled={sending}>
          {sending ? t('common.loading') : t('contact.send')}
        </button>

        <p className="text-muted contact-note">
          You can also email us directly at{' '}
          <a href="mailto:contact@valthoris.com">contact@valthoris.com</a>. Security incidents
          follow the Responsible Disclosure policy.
        </p>
      </form>
    </div>
  );
}
