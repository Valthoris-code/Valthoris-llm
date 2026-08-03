import React from 'react';
import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Home.css';

const FEATURES = [
  { icon: '🔍', title: 'Scanner de Ameaças', desc: 'Verifique URLs, e-mails, telefones e domínios em tempo real contra a base de dados de ameaças conhecidas.' },
  { icon: '🚨', title: 'Denúncias Comunitárias', desc: 'Sistema colectivo de denúncias com votação descentralizada e pontuação de risco baseada em consenso.' },
  { icon: '📞', title: 'Lookup de Contactos', desc: 'Identifique números de telefone, e-mails e contas bancárias associados a fraudes e burlas.' },
  { icon: '📍', title: 'Partilha de Localização Segura', desc: 'Partilhe a sua localização de forma temporária e segura com pessoas de confiança, com geofencing inteligente.' },
  { icon: '🤖', title: 'IA Avançada', desc: 'Modelos de machine learning treinados para detectar padrões de fraude em linguagem natural e metadados.' },
  { icon: '🔗', title: 'Descentralizado na ICP', desc: 'Toda a lógica corre em canisters na Internet Computer — sem servidores centrais, sem censura.' },
];

const CANISTERS = [
  { name: 'Backend Core',         id: 'c6sjf-tqaaa-aaaap-qsiea-cai', status: 'active' },
  { name: 'Community / Reports',  id: '7w5qg-6aaaa-aaaab-ael4a-cai', status: 'active' },
  { name: 'Identity / Lookup',    id: 'ezroe-caaaa-aaaac-bcdeq-cai', status: 'active' },
  { name: 'Threat Intelligence',  id: 'e2m3q-yqaaa-aaaas-qekva-cai', status: 'active' },
  { name: 'Safe Location',        id: 'sodv3-uiaaa-aaaak-qxubq-cai', status: 'active' },
];

export default function Home() {
  const { isAuthenticated, loading, login } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const launchHandled = useRef(false);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'login' || loading || launchHandled.current) return;

    launchHandled.current = true;

    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
      return;
    }

    (async () => {
      await login();
      navigate('/dashboard', { replace: true });
    })();
  }, [searchParams, loading, isAuthenticated, login, navigate]);

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">🌐 Powered by Internet Computer</div>
          <h1 className="hero-title">
            <span className="gradient-text">VALTHORIS</span>
          </h1>
          <p className="hero-subtitle">
            Plataforma de Cibersegurança descentralizada com Inteligência Artificial.
            Proteja-se de fraudes, burlas e ameaças digitais — sem servidores centrais.
          </p>
          <div className="hero-cta">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary btn-large">
                📊 Abrir Dashboard
              </Link>
            ) : (
              <button className="btn-primary btn-large" onClick={login}>
                🔐 Entrar com Internet Identity
              </button>
            )}
            <Link to="/scanner" className="btn-secondary btn-large">
              🔍 Verificar Agora
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="globe-placeholder">🛡</div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <h2 className="section-title">Funcionalidades</h2>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="card feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p className="text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Canister status */}
      <section className="section">
        <h2 className="section-title">Canisters Activos na ICP Mainnet</h2>
        <div className="card canister-table-wrap">
          <table className="canister-table">
            <thead>
              <tr><th>Canister</th><th>ID</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {CANISTERS.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><code className="canister-id">{c.id}</code></td>
                  <td><span className="badge badge-green">✓ activo</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
