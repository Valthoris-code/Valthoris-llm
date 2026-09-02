import React from 'react';
import type { AiChatSource, AiVerdict, AiVerdictSignal } from '../services/aiChatService';

/**
 * The dedicated wallet analysis panel.
 *
 * A crypto address deserves more than a traffic light: what the chain says
 * (balance, activity, contract or wallet), what the market says when the
 * address is a listed token (price, 24h change, volume, capitalisation, the
 * exchanges it trades on and how the price moved over the week), what the
 * blacklists say, what the Valthoris community reported, and where to verify
 * every one of those claims.
 *
 * Nothing here is computed from a guess: every figure comes from a source
 * report the backend returned for this very lookup, and a source that did not
 * answer is shown as not having answered.
 */

/** One report the community canister holds against this address. */
export interface CommunityReportSummary {
  category: string;
  status: string;
  riskScore: number;
  /** Milliseconds since the epoch. */
  createdAt: number;
}

interface Props {
  address: string;
  chain: 'eth' | 'btc';
  verdict?: AiVerdict;
  sources: AiChatSource[];
  reports: CommunityReportSummary[];
}

/** The successful report of one provider endpoint, when it answered. */
function payload(
  sources: AiChatSource[],
  provider: string,
  endpoint: string,
): Record<string, unknown> | null {
  const source = sources.find(s => s.provider === provider && s.endpoint === endpoint);
  if (!source || source.status !== 'success') return null;
  return source.data ?? {};
}

/** The state of one provider, so an outage is never read as "nothing found". */
function statusOf(sources: AiChatSource[], provider: string): AiChatSource | undefined {
  return sources.find(s => s.provider === provider);
}

function numberAt(data: Record<string, unknown> | null, key: string): number | undefined {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringAt(data: Record<string, unknown> | null, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function boolAt(data: Record<string, unknown> | null, key: string): boolean | undefined {
  const value = data?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function listAt(data: Record<string, unknown> | null, key: string): string[] {
  const value = data?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** The seven-day price series, as CoinGecko returned it. */
interface PricePoint { t: number; p: number }

function priceHistory(data: Record<string, unknown> | null): PricePoint[] {
  const value = data?.priceHistory7d;
  if (!Array.isArray(value)) return [];
  return value
    .map(point => (point && typeof point === 'object' ? point as Record<string, unknown> : {}))
    .map(point => ({ t: Number(point.t), p: Number(point.p) }))
    .filter(point => Number.isFinite(point.t) && Number.isFinite(point.p));
}

const USD = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
const COMPACT = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 2 });

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString();
}

/**
 * Which part of the analysis a signal belongs to.
 *
 * The verdict is one number; the user is entitled to know which evidence
 * produced it. The mapping follows the providers wired for a crypto address.
 */
const SIGNAL_CATEGORIES: { key: string; label: string; providers: (signal: AiVerdictSignal) => boolean }[] = [
  { key: 'onchain',   label: 'On-chain',  providers: s => s.provider === 'Etherscan' },
  { key: 'market',    label: 'Mercado',   providers: s => s.provider === 'CoinGecko' },
  {
    key: 'blacklist',
    label: 'Blacklist',
    providers: s => ['GoPlus', 'VirusTotal', 'URLScan', 'CryptoScamDB'].includes(s.provider),
  },
  { key: 'community', label: 'Comunidade', providers: s => s.provider === 'Valthoris' },
];

interface CategoryScore { key: string; label: string; points: number; signals: AiVerdictSignal[] }

function categoryScores(verdict: AiVerdict | undefined): CategoryScore[] {
  const signals = verdict?.signals ?? [];
  const scored = SIGNAL_CATEGORIES.map(category => {
    const matched = signals.filter(category.providers);
    return {
      key: category.key,
      label: category.label,
      points: matched.reduce((total, signal) => total + signal.weight, 0),
      signals: matched,
    };
  });
  const other = signals.filter(signal => !SIGNAL_CATEGORIES.some(category => category.providers(signal)));
  if (other.length > 0) {
    scored.push({
      key: 'other',
      label: 'Outras fontes',
      points: other.reduce((total, signal) => total + signal.weight, 0),
      signals: other,
    });
  }
  return scored;
}

/**
 * The score split by category, drawn as bars.
 *
 * Plain SVG: the chart carries four numbers and adding a charting dependency
 * to the bundle for them would cost the user more than it gives.
 */
function ScoreChart({ categories }: { categories: CategoryScore[] }) {
  const max = Math.max(60, ...categories.map(category => category.points));
  return (
    <div>
      {categories.map(category => (
        <div key={category.key} style={{ marginBottom: '0.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
            <span>{category.label}</span>
            <span className="text-muted">{category.points} pts</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (category.points / max) * 100)}%`,
                height: '100%',
                background: category.points >= 60
                  ? 'var(--accent-red, #ff4d4f)'
                  : category.points > 0
                    ? 'var(--accent-amber, #ffa940)'
                    : 'var(--accent-green, #52c41a)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The seven-day price line, drawn from the points the provider returned. */
function PriceChart({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null;
  const width = 320;
  const height = 90;
  const prices = points.map(point => point.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.abs(max) || 1;
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * (width - 8) + 4;
    const y = height - 8 - ((point.p - min) / span) * (height - 16);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const rising = prices[prices.length - 1] >= prices[0];
  const colour = rising ? 'var(--accent-green, #52c41a)' : 'var(--accent-red, #ff4d4f)';
  return (
    <figure style={{ margin: '0.4rem 0 0', maxWidth: width }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Histórico de preço a 7 dias: de ${USD.format(prices[0])} a ${USD.format(prices[prices.length - 1])}`}
      >
        <polyline points={coords.join(' ')} fill="none" stroke={colour} strokeWidth="2" />
      </svg>
      <figcaption className="text-muted" style={{ fontSize: '0.78rem' }}>
        7 dias · mín {USD.format(min)} · máx {USD.format(max)}
      </figcaption>
    </figure>
  );
}

/** The address on the public explorers, so every figure can be checked. */
function explorerLinks(address: string, chain: 'eth' | 'btc', coinId?: string): { label: string; href: string }[] {
  const encoded = encodeURIComponent(address);
  const links = chain === 'eth'
    ? [
      { label: 'Etherscan', href: `https://etherscan.io/address/${encoded}` },
      { label: 'Blockchair', href: `https://blockchair.com/ethereum/address/${encoded}` },
    ]
    : [
      { label: 'Blockchair', href: `https://blockchair.com/bitcoin/address/${encoded}` },
      { label: 'Blockchain.com', href: `https://www.blockchain.com/explorer/addresses/btc/${encoded}` },
    ];
  if (coinId) {
    links.push({ label: 'CoinGecko', href: `https://www.coingecko.com/en/coins/${encodeURIComponent(coinId)}` });
  }
  return links;
}

/** The month of a report, used to compare the last 30 days with the previous 30. */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function CryptoAnalysisPanel({ address, chain, verdict, sources, reports }: Props) {
  const onchain = payload(sources, 'Etherscan', 'ethereum/address-activity');
  const market = payload(sources, 'CoinGecko', 'crypto/token-market');
  const blacklist = payload(sources, 'GoPlus', 'crypto/address-security');
  const etherscan = statusOf(sources, 'Etherscan');
  const coingecko = statusOf(sources, 'CoinGecko');
  const goplus = statusOf(sources, 'GoPlus');

  const listed = boolAt(market, 'listedToken') === true;
  const history = priceHistory(market);
  const flags = listAt(blacklist, 'maliciousFlags');
  const categories = categoryScores(verdict);

  const now = Date.now();
  const recent = reports.filter(report => now - report.createdAt <= THIRTY_DAYS_MS).length;
  const previous = reports.filter(
    report => now - report.createdAt > THIRTY_DAYS_MS && now - report.createdAt <= 2 * THIRTY_DAYS_MS,
  ).length;
  const byCategory = reports.reduce<Record<string, number>>((totals, report) => {
    totals[report.category] = (totals[report.category] ?? 0) + 1;
    return totals;
  }, {});
  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const confirmed = reports.filter(report => report.status === 'confirmed').length;

  return (
    <div className="card mt-2">
      <h3 style={{ marginTop: 0 }}>
        {chain === 'eth' ? 'Carteira Ethereum' : 'Carteira Bitcoin'}
        <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}> · {address}</span>
      </h3>

      <section className="mb-2">
        <h4 style={{ margin: '0 0 0.4rem' }}>Pontuação por categoria</h4>
        <ScoreChart categories={categories} />
        <p className="text-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.8rem' }}>
          Total {verdict?.score ?? 0} pontos · 🔴 a partir de 60 · 🟠 a partir de 10.
        </p>
      </section>

      <section className="mb-2">
        <h4 style={{ margin: '0 0 0.4rem' }}>Dados on-chain (Etherscan)</h4>
        {onchain ? (
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
            <li>Saldo: <strong>{numberAt(onchain, 'balanceEth') ?? 0} ETH</strong></li>
            <li>Transações recentes: <strong>{numberAt(onchain, 'recentTransactions') ?? 0}</strong></li>
            <li>
              Tipo:{' '}
              <strong>
                {boolAt(onchain, 'isContract') === true
                  ? 'contrato'
                  : boolAt(onchain, 'isContract') === false
                    ? 'carteira normal'
                    : 'não determinado'}
              </strong>
            </li>
            {formatDate(stringAt(onchain, 'firstSeen')) && (
              <li>Primeira transação vista: <strong>{formatDate(stringAt(onchain, 'firstSeen'))}</strong></li>
            )}
            {formatDate(stringAt(onchain, 'lastSeen')) && (
              <li>Última transação vista: <strong>{formatDate(stringAt(onchain, 'lastSeen'))}</strong></li>
            )}
          </ul>
        ) : (
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            {chain === 'btc'
              ? 'Sem cobertura on-chain para Bitcoin nesta instalação.'
              : etherscan
                ? `Etherscan não respondeu (${etherscan.status}${etherscan.error ? `: ${etherscan.error}` : ''}).`
                : 'Etherscan não foi consultado nesta análise.'}
          </p>
        )}
      </section>

      <section className="mb-2">
        <h4 style={{ margin: '0 0 0.4rem' }}>Mercado (CoinGecko)</h4>
        {listed ? (
          <>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
              <li>
                Token: <strong>{stringAt(market, 'name') ?? '—'}</strong>{' '}
                {stringAt(market, 'symbol') && `(${stringAt(market, 'symbol')!.toUpperCase()})`}
              </li>
              {numberAt(market, 'priceUsd') !== undefined && (
                <li>Preço atual: <strong>{USD.format(numberAt(market, 'priceUsd')!)}</strong></li>
              )}
              {numberAt(market, 'priceChange24hPct') !== undefined && (
                <li>
                  Variação 24h:{' '}
                  <strong
                    style={{
                      color: numberAt(market, 'priceChange24hPct')! >= 0
                        ? 'var(--accent-green, #52c41a)'
                        : 'var(--accent-red, #ff4d4f)',
                    }}
                  >
                    {numberAt(market, 'priceChange24hPct')!.toFixed(2)}%
                  </strong>
                </li>
              )}
              {numberAt(market, 'volume24hUsd') !== undefined && (
                <li>Volume 24h: <strong>{COMPACT.format(numberAt(market, 'volume24hUsd')!)} USD</strong></li>
              )}
              {numberAt(market, 'marketCapUsd') !== undefined && (
                <li>
                  Capitalização: <strong>{COMPACT.format(numberAt(market, 'marketCapUsd')!)} USD</strong>
                  {numberAt(market, 'marketCapRank') !== undefined && ` · #${numberAt(market, 'marketCapRank')}`}
                </li>
              )}
              {listAt(market, 'exchanges').length > 0 && (
                <li>Exchanges: <strong>{listAt(market, 'exchanges').join(', ')}</strong></li>
              )}
            </ul>
            <PriceChart points={history} />
            {history.length < 2 && (
              <p className="text-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
                Histórico de preço indisponível nesta consulta.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            {market
              ? 'Este endereço não corresponde a nenhum token listado — é uma carteira, não um contrato de token.'
              : coingecko
                ? `CoinGecko não respondeu (${coingecko.status}${coingecko.error ? `: ${coingecko.error}` : ''}).`
                : 'CoinGecko não foi consultado nesta análise.'}
          </p>
        )}
      </section>

      <section className="mb-2">
        <h4 style={{ margin: '0 0 0.4rem' }}>Blacklist (GoPlus)</h4>
        {blacklist ? (
          flags.length > 0 ? (
            <div>
              <span className="badge badge-red">MARCADO</span>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
                {flags.map(flag => <li key={flag}>{flag.replace(/_/g, ' ')}</li>)}
              </ul>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--accent-green, #52c41a)' }}>
              Limpo: nenhuma marcação de segurança para este endereço.
            </p>
          )
        ) : (
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            {goplus
              ? `GoPlus não respondeu (${goplus.status}${goplus.error ? `: ${goplus.error}` : ''}).`
              : 'Sem verificação de blacklist para este endereço.'}
          </p>
        )}
      </section>

      <section className="mb-2">
        <h4 style={{ margin: '0 0 0.4rem' }}>Denúncias da comunidade Valthoris</h4>
        {reports.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Nenhuma denúncia registada contra este endereço.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
            <li>Total: <strong>{reports.length}</strong> ({confirmed} confirmada(s))</li>
            <li>
              Tendência: <strong>{recent}</strong> nos últimos 30 dias vs <strong>{previous}</strong> nos 30
              anteriores
            </li>
            {topCategory && (
              <li>Tipo mais denunciado: <strong>{topCategory[0]}</strong> ({topCategory[1]})</li>
            )}
          </ul>
        )}
      </section>

      <section>
        <h4 style={{ margin: '0 0 0.4rem' }}>Verificar noutras fontes</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.88rem' }}>
          {explorerLinks(address, chain, stringAt(market, 'coinId')).map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ color: 'var(--accent-blue, #00d4ff)' }}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
