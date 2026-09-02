/**
 * Deterministic verdict layer for the `ai-chat` Edge Function.
 *
 * Why this file exists
 * ────────────────────
 * A lookup that came back with `VirusTotal malicious: 4, suspicious: 2,
 * reputation: -2` and AbuseIPDB reports is a dangerous address, and the user
 * must be told so in the first line of the answer. Until now that conclusion
 * was left to the language model: it had to read the evidence block and choose
 * a verdict itself. That is not acceptable for a safety product —
 *
 *   • the model is sometimes unavailable (quota, timeout), and the answer then
 *     falls back to a plain evidence dump with no verdict at all;
 *   • even when it answers, a model may describe `malicious: 4` neutrally
 *     instead of concluding "do not contact this address";
 *   • the same evidence must always produce the same verdict, and a model does
 *     not guarantee that.
 *
 * So the verdict is computed here, from the raw provider payloads, after every
 * source has answered and before anything is shown. The model still writes the
 * explanation — it never decides the traffic light.
 *
 * The four levels, exactly as specified:
 *
 *   🔴 danger       — at least one source carries a strong, confirmed signal of
 *                     malice (VirusTotal detections, a high AbuseIPDB abuse
 *                     confidence, a phishing hit, a confirmed community report)
 *   🟠 caution      — mixed signals, a mildly negative reputation, or a single
 *                     source pointing at risk with no cross-confirmation
 *   🟢 safe         — the sources that cover this entity answered and none of
 *                     them carries any signal of risk
 *   ⚪ insufficient — most sources failed or did not answer. This is NOT
 *                     "safe": absence of data is never rendered as green.
 *
 * Thresholds
 * ──────────
 * Every number the decision depends on lives in `VERDICT_THRESHOLDS` below,
 * grouped by source, so they can be tuned later without touching the logic.
 */

import type { IntelEntityKind, SourceReport } from './intel.ts';

/** The four traffic-light levels. */
export type VerdictLevel = 'danger' | 'caution' | 'safe' | 'insufficient';

/** How strongly one observation pushes the verdict. */
export type SignalSeverity = 'strong' | 'moderate' | 'weak';

/** One observation that moved the verdict, with the source it came from. */
export interface VerdictSignal {
  provider: string;
  endpoint: string;
  severity: SignalSeverity;
  /** Points contributed to the score. */
  weight: number;
  /** Plain-language reason, in Portuguese. */
  reason: string;
  /** The same reason in English. */
  reasonEn: string;
}

/** How much of the evidence the verdict could actually stand on. */
export interface VerdictCoverage {
  /** Sources able to carry a risk signal for this entity that answered. */
  answered: number;
  /** Risk-bearing sources that failed. */
  failed: number;
  /** Risk-bearing sources with no credential on this deployment. */
  notConfigured: number;
}

export interface Verdict {
  level: VerdictLevel;
  /** Total points. Documented thresholds turn it into a level. */
  score: number;
  signals: VerdictSignal[];
  coverage: VerdictCoverage;
  /** The block shown before anything else, already in the user's language. */
  headline: string;
}

/**
 * Every threshold the verdict depends on, in one place.
 *
 * `weights` converts a severity into points; `score.danger` / `score.caution`
 * turn the total into a level. A single strong signal therefore always reaches
 * 🔴 on its own, two weak ones reach 🟠, and one weak one is enough for 🟠 —
 * which is what "a single source pointing at risk without cross-confirmation"
 * has to mean.
 */
export const VERDICT_THRESHOLDS = {
  /** Points per severity. */
  weights: { strong: 60, moderate: 25, weak: 10 },
  /** Total points needed for each level. */
  score: { danger: 60, caution: 10 },

  /** VirusTotal `last_analysis_stats` and `reputation`. */
  virusTotal: {
    /** Engines flagging the entity as malicious: ≥ this is a strong signal. */
    maliciousStrong: 2,
    /** ≥ this (and below `maliciousStrong`) is a moderate signal. */
    maliciousModerate: 1,
    /** Engines flagging it as suspicious. */
    suspiciousModerate: 2,
    suspiciousWeak: 1,
    /** Community reputation: below this is a weak negative signal. */
    reputationWeak: 0,
    /** Clearly negative reputation, a moderate signal on its own. */
    reputationModerate: -25,
  },

  /** AbuseIPDB `abuseConfidenceScore` (0-100) and report counts. */
  abuseIpdb: {
    confidenceStrong: 50,
    confidenceModerate: 15,
    /** Any report at all, when the confidence is still low. */
    reportsWeak: 1,
  },

  /** URLScan scan history for the domain. */
  urlScan: { maliciousStrong: 1 },

  /** GoPlus phishing-site and address-security checks. */
  goPlus: { phishingStrong: 1, flaggedStrong: 1 },

  /** Abstract e-mail validation. */
  email: {
    /** Quality score (0-1) below which the address looks poor. */
    qualityWeak: 0.3,
  },

  /** Phone reputation. */
  phone: {
    /** US robocall complaints in the same area code (an area signal only). */
    ftcRobocallsWeak: 5,
  },

  /**
   * Valthoris community reports (the `community` canister), passed in by the
   * caller when the lookup came from the sidebar tools.
   */
  community: {
    /** A single confirmed report is a confirmed denunciation: strong. */
    confirmedStrong: 1,
    /** Reports still under review: moderate, they are not confirmed yet. */
    pendingModerate: 1,
  },

  /** Reputation held by the `identity` canister. */
  identity: {
    riskScoreStrong: 70,
    riskScoreModerate: 40,
  },

  /** IOC match reported by the `threat_intelligence` canister. */
  threatIntel: {
    confidenceStrong: 70,
    confidenceModerate: 30,
  },
} as const;

/**
 * Signals collected outside the HTTP intelligence providers.
 *
 * The sidebar tools query the Internet Computer canisters, and their findings
 * must reach the very same verdict function — otherwise the Scanner and the
 * assistant could disagree about the same number.
 */
export interface LocalEvidence {
  /** `identity` canister reputation record. */
  reputation?: {
    found?: boolean;
    riskScore?: number;
    trustScore?: number;
    reportCount?: number;
    isKnownScammer?: boolean;
    isVerifiedBusiness?: boolean;
  };
  /** `threat_intelligence` canister IOC match. */
  threat?: {
    isThreat?: boolean;
    confidence?: number;
    severity?: string | null;
    matchedIndicators?: number;
  };
  /** Reports filed by the community against this exact target. */
  reports?: Array<{ status?: string | null; riskScore?: number }>;
}

/** Entity kinds a threat verdict is meaningful for. */
const RISK_KINDS: IntelEntityKind[] = [
  'ip',
  'url',
  'domain',
  'email',
  'crypto_eth',
  'crypto_btc',
  'iban',
  'phone',
  'vat',
];

/** True when a traffic-light verdict applies to this kind of lookup. */
export function isRiskKind(kind: IntelEntityKind): boolean {
  return RISK_KINDS.includes(kind);
}

/**
 * Providers whose answer can carry a risk signal.
 *
 * Coverage is measured over these alone: a web search engine answering with
 * ten pages says nothing about whether an IP is dangerous, so it must never
 * turn "nothing was checked" into "everything checked out".
 */
const RISK_PROVIDERS = new Set([
  'AbuseIPDB',
  'VirusTotal',
  'URLScan',
  'GoPlus',
  'Abstract Email',
  'Abstract IP',
  'Abstract Phone',
  'Abstract IBAN',
  'Abstract VAT',
  'NumVerify',
  'FTC DNC Complaints',
  'OpenIBAN',
  'Etherscan',
  'CoinGecko',
  'CryptoScamDB',
  'IPinfo',
]);

function numberOf(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function signal(
  report: { provider: string; endpoint: string },
  severity: SignalSeverity,
  reason: string,
  reasonEn: string,
): VerdictSignal {
  return {
    provider: report.provider,
    endpoint: report.endpoint,
    severity,
    weight: VERDICT_THRESHOLDS.weights[severity],
    reason,
    reasonEn,
  };
}

/** Reads one successful provider report into zero or more risk signals. */
function signalsFromReport(report: SourceReport): VerdictSignal[] {
  const data = (report.data ?? {}) as Record<string, unknown>;
  const out: VerdictSignal[] = [];
  const t = VERDICT_THRESHOLDS;

  if (report.provider === 'VirusTotal') {
    const malicious = numberOf(data.malicious) ?? 0;
    const suspicious = numberOf(data.suspicious) ?? 0;
    const reputation = numberOf(data.reputation);
    if (malicious >= t.virusTotal.maliciousStrong) {
      out.push(signal(
        report,
        'strong',
        `${malicious} motores antivírus classificam este item como malicioso.`,
        `${malicious} antivirus engines classify this item as malicious.`,
      ));
    } else if (malicious >= t.virusTotal.maliciousModerate) {
      out.push(signal(
        report,
        'moderate',
        `${malicious} motor antivírus classifica este item como malicioso.`,
        `${malicious} antivirus engine classifies this item as malicious.`,
      ));
    }
    if (suspicious >= t.virusTotal.suspiciousModerate) {
      out.push(signal(
        report,
        'moderate',
        `${suspicious} motores marcam este item como suspeito.`,
        `${suspicious} engines mark this item as suspicious.`,
      ));
    } else if (suspicious >= t.virusTotal.suspiciousWeak) {
      out.push(signal(
        report,
        'weak',
        `${suspicious} motor marca este item como suspeito.`,
        `${suspicious} engine marks this item as suspicious.`,
      ));
    }
    if (reputation !== undefined && reputation <= t.virusTotal.reputationModerate) {
      out.push(signal(
        report,
        'moderate',
        `A reputação comunitária é claramente negativa (${reputation}).`,
        `The community reputation is clearly negative (${reputation}).`,
      ));
    } else if (reputation !== undefined && reputation < t.virusTotal.reputationWeak) {
      out.push(signal(
        report,
        'weak',
        `A reputação comunitária é negativa (${reputation}).`,
        `The community reputation is negative (${reputation}).`,
      ));
    }
  }

  if (report.provider === 'AbuseIPDB') {
    const confidence = numberOf(data.abuseConfidenceScore) ?? 0;
    const reports = numberOf(data.totalReports) ?? 0;
    if (confidence >= t.abuseIpdb.confidenceStrong) {
      out.push(signal(
        report,
        'strong',
        `Denúncias de abuso com ${confidence}% de confiança (${reports} denúncias).`,
        `Abuse reports with ${confidence}% confidence (${reports} reports).`,
      ));
    } else if (confidence >= t.abuseIpdb.confidenceModerate) {
      out.push(signal(
        report,
        'moderate',
        `Denúncias de abuso com ${confidence}% de confiança (${reports} denúncias).`,
        `Abuse reports with ${confidence}% confidence (${reports} reports).`,
      ));
    } else if (reports >= t.abuseIpdb.reportsWeak) {
      out.push(signal(
        report,
        'weak',
        `${reports} denúncia(s) de abuso registadas, ainda sem confirmação forte.`,
        `${reports} abuse report(s) on record, not strongly confirmed yet.`,
      ));
    }
    if (data.isTor === true) {
      out.push(signal(
        report,
        'weak',
        'O endereço é um nó de saída Tor.',
        'The address is a Tor exit node.',
      ));
    }
  }

  if (report.provider === 'URLScan') {
    const malicious = numberOf(data.malicious) ?? 0;
    if (malicious >= t.urlScan.maliciousStrong) {
      out.push(signal(
        report,
        'strong',
        `${malicious} análise(s) recentes deste site terminaram com veredito malicioso.`,
        `${malicious} recent scan(s) of this site ended with a malicious verdict.`,
      ));
    }
  }

  if (report.provider === 'GoPlus') {
    const phishing = numberOf(data.phishingSite) ?? 0;
    const flagged = numberOf(data.flaggedCount) ?? 0;
    if (phishing >= t.goPlus.phishingStrong) {
      out.push(signal(
        report,
        'strong',
        'O endereço está identificado como site de phishing.',
        'The address is identified as a phishing site.',
      ));
    }
    if (flagged >= t.goPlus.flaggedStrong) {
      out.push(signal(
        report,
        'strong',
        `A carteira tem ${flagged} marcações de segurança negativas.`,
        `The wallet carries ${flagged} negative security flags.`,
      ));
    }
  }

  if (report.provider === 'Abstract Email') {
    const quality = numberOf(data.qualityScore);
    if (data.isDisposable === true) {
      out.push(signal(
        report,
        'moderate',
        'O endereço de e-mail é descartável (serviço temporário).',
        'The e-mail address is disposable (temporary service).',
      ));
    }
    if (typeof data.deliverability === 'string' && /undeliverable/i.test(data.deliverability)) {
      out.push(signal(
        report,
        'moderate',
        'O endereço de e-mail não é entregável.',
        'The e-mail address is undeliverable.',
      ));
    }
    if (quality !== undefined && quality < t.email.qualityWeak) {
      out.push(signal(
        report,
        'weak',
        `A qualidade do endereço é baixa (${quality}).`,
        `The address quality is low (${quality}).`,
      ));
    }
  }

  if (report.provider === 'NumVerify' || report.provider === 'Abstract Phone') {
    if (data.valid === false) {
      out.push(signal(
        report,
        'moderate',
        'O número não é um número de telefone válido.',
        'The number is not a valid phone number.',
      ));
    }
  }

  if (report.provider === 'OpenIBAN' || report.provider === 'Abstract IBAN') {
    if (data.valid === false) {
      out.push(signal(
        report,
        'moderate',
        'O IBAN não passa a validação bancária.',
        'The IBAN fails bank validation.',
      ));
    }
  }

  if (report.provider === 'FTC DNC Complaints') {
    const robocalls = numberOf(data.robocallComplaints) ?? 0;
    if (robocalls >= t.phone.ftcRobocallsWeak) {
      out.push(signal(
        report,
        'weak',
        `${robocalls} queixas de chamadas automáticas no mesmo indicativo (não é o número exato).`,
        `${robocalls} robocall complaints in the same area code (not this exact number).`,
      ));
    }
  }

  if (report.provider === 'CryptoScamDB' && data.blocked === true) {
    out.push(signal(
      report,
      'strong',
      'O endereço consta de uma base de dados de burlas.',
      'The address appears in a scam database.',
    ));
  }

  return out;
}

/** Reads the canister evidence (sidebar tools) into the same kind of signals. */
function signalsFromLocalEvidence(local: LocalEvidence): VerdictSignal[] {
  const out: VerdictSignal[] = [];
  const t = VERDICT_THRESHOLDS;

  const reputation = local.reputation;
  if (reputation?.found) {
    const risk = numberOf(reputation.riskScore) ?? 0;
    if (reputation.isKnownScammer === true) {
      out.push(signal(
        { provider: 'Valthoris', endpoint: 'identity/reputation' },
        'strong',
        'O identificador está registado como burlão conhecido na Valthoris.',
        'The identifier is recorded as a known scammer in Valthoris.',
      ));
    } else if (risk >= t.identity.riskScoreStrong) {
      out.push(signal(
        { provider: 'Valthoris', endpoint: 'identity/reputation' },
        'strong',
        `A reputação Valthoris atribui-lhe um risco de ${risk}/100.`,
        `The Valthoris reputation gives it a risk of ${risk}/100.`,
      ));
    } else if (risk >= t.identity.riskScoreModerate) {
      out.push(signal(
        { provider: 'Valthoris', endpoint: 'identity/reputation' },
        'moderate',
        `A reputação Valthoris atribui-lhe um risco de ${risk}/100.`,
        `The Valthoris reputation gives it a risk of ${risk}/100.`,
      ));
    }
  }

  const threat = local.threat;
  if (threat?.isThreat) {
    const confidence = numberOf(threat.confidence) ?? 0;
    const severity: SignalSeverity = confidence >= t.threatIntel.confidenceStrong
      ? 'strong'
      : confidence >= t.threatIntel.confidenceModerate
        ? 'moderate'
        : 'weak';
    out.push(signal(
      { provider: 'Valthoris', endpoint: 'threat-intelligence/ioc' },
      severity,
      `Corresponde a indicadores de ameaça conhecidos (confiança ${confidence}%).`,
      `It matches known threat indicators (confidence ${confidence}%).`,
    ));
  }

  const reports = local.reports ?? [];
  const confirmed = reports.filter((r) => typeof r?.status === 'string' && /confirm/i.test(r.status));
  const pending = reports.length - confirmed.length;
  if (confirmed.length >= t.community.confirmedStrong) {
    out.push(signal(
      { provider: 'Valthoris', endpoint: 'community/reports' },
      'strong',
      `${confirmed.length} denúncia(s) confirmada(s) pela comunidade Valthoris.`,
      `${confirmed.length} report(s) confirmed by the Valthoris community.`,
    ));
  }
  if (pending >= t.community.pendingModerate) {
    out.push(signal(
      { provider: 'Valthoris', endpoint: 'community/reports' },
      'moderate',
      `${pending} denúncia(s) da comunidade ainda por confirmar.`,
      `${pending} community report(s) still awaiting confirmation.`,
    ));
  }

  return out;
}

/** True when the report really carries an answer rather than an empty result. */
function answered(report: SourceReport): boolean {
  if (report.status !== 'success') return false;
  const data = report.data as Record<string, unknown> | undefined;
  if (!data || Object.keys(data).length === 0) return false;
  if (data.found === false) return false;
  if (data.applicable === false) return false;
  return true;
}

export interface VerdictInput {
  kind: IntelEntityKind;
  sources: SourceReport[];
  local?: LocalEvidence;
  /** The entity itself, only used to phrase the headline. */
  entity?: string;
  language?: 'pt' | 'en';
}

/**
 * The verdict for one analysed entity.
 *
 * Pure and deterministic: the same reports always produce the same level, and
 * no language model takes part.
 */
export function computeVerdict(input: VerdictInput): Verdict {
  const language = input.language ?? 'pt';
  const riskReports = input.sources.filter((s) => RISK_PROVIDERS.has(s.provider));

  const coverage: VerdictCoverage = {
    answered: riskReports.filter((r) => answered(r)).length,
    failed: riskReports.filter((r) => r.status === 'failed').length,
    notConfigured: riskReports.filter((r) => r.status === 'not_configured').length,
  };

  const signals: VerdictSignal[] = [];
  for (const report of riskReports) {
    if (!answered(report)) continue;
    signals.push(...signalsFromReport(report));
  }
  const local = input.local ? signalsFromLocalEvidence(input.local) : [];
  signals.push(...local);

  const score = signals.reduce((total, s) => total + s.weight, 0);

  // Community and canister evidence counts as coverage too: a lookup answered
  // only by the Valthoris canisters is still a lookup that produced data.
  const hasLocalEvidence = Boolean(
    input.local &&
      (input.local.reputation?.found ||
        input.local.threat !== undefined ||
        (input.local.reports?.length ?? 0) > 0),
  );

  let level: VerdictLevel;
  if (score >= VERDICT_THRESHOLDS.score.danger) {
    level = 'danger';
  } else if (score >= VERDICT_THRESHOLDS.score.caution) {
    level = 'caution';
  } else if (coverage.answered === 0 && !hasLocalEvidence) {
    // Nothing that could carry a risk signal answered: this is not "clean",
    // it is "unknown", and it is never shown in green.
    level = 'insufficient';
  } else if (coverage.failed >= coverage.answered && coverage.answered > 0) {
    // As many sources failed as answered — the picture is too partial to
    // certify the entity, so the answer says so instead of reassuring.
    level = 'insufficient';
  } else {
    level = 'safe';
  }

  return {
    level,
    score,
    signals,
    coverage,
    headline: renderHeadline(level, input.kind, signals, coverage, language),
  };
}

/** The noun the headline refers to, per entity kind. */
const ENTITY_NOUN: Record<string, { pt: string; en: string }> = {
  ip: { pt: 'este endereço IP', en: 'this IP address' },
  url: { pt: 'este endereço', en: 'this address' },
  domain: { pt: 'este domínio', en: 'this domain' },
  email: { pt: 'este endereço de e-mail', en: 'this e-mail address' },
  phone: { pt: 'este número', en: 'this number' },
  iban: { pt: 'este IBAN', en: 'this IBAN' },
  vat: { pt: 'este número de contribuinte', en: 'this VAT number' },
  crypto_eth: { pt: 'esta carteira', en: 'this wallet' },
  crypto_btc: { pt: 'esta carteira', en: 'this wallet' },
};

function noun(kind: IntelEntityKind, language: 'pt' | 'en'): string {
  const entry = ENTITY_NOUN[kind] ?? { pt: 'este indicador', en: 'this indicator' };
  return entry[language];
}

/** How many reasons are shown on the visible line. The rest is in the detail. */
const HEADLINE_REASONS = 2;

/**
 * The block the user sees first: one traffic-light line and, at most, two
 * short reasons. Everything else belongs behind the expander.
 */
export function renderHeadline(
  level: VerdictLevel,
  kind: IntelEntityKind,
  signals: VerdictSignal[],
  coverage: VerdictCoverage,
  language: 'pt' | 'en' = 'pt',
): string {
  const subject = noun(kind, language);
  const lines: string[] = [];

  if (level === 'danger') {
    lines.push(
      language === 'pt'
        ? `🔴 **Perigo** — Com base nas fontes inspecionadas, a Valthoris desaconselha o contacto com ${subject}.`
        : `🔴 **Danger** — Based on the sources checked, Valthoris advises against any contact with ${subject}.`,
    );
  } else if (level === 'caution') {
    lines.push(
      language === 'pt'
        ? `🟠 **Cuidado** — Com base nas fontes inspecionadas, há sinais de risco sobre ${subject} que não estão confirmados por todas as fontes.`
        : `🟠 **Caution** — Based on the sources checked, there are risk signals about ${subject} that are not confirmed by every source.`,
    );
  } else if (level === 'safe') {
    lines.push(
      language === 'pt'
        ? `🟢 **Seguro** — Com base nas fontes inspecionadas, a Valthoris não encontrou sinais de risco em ${subject}.`
        : `🟢 **Safe** — Based on the sources checked, Valthoris found no signs of risk in ${subject}.`,
    );
  } else {
    lines.push(
      language === 'pt'
        ? `⚪ **Sem informação suficiente** — As fontes consultadas não devolveram dados suficientes sobre ${subject}. Isto não quer dizer que seja seguro.`
        : `⚪ **Not enough information** — The sources consulted returned too little data about ${subject}. This does not mean it is safe.`,
    );
  }

  const ordered = [...signals].sort((a, b) => b.weight - a.weight).slice(0, HEADLINE_REASONS);
  for (const item of ordered) {
    lines.push(`• ${language === 'pt' ? item.reason : item.reasonEn}`);
  }

  if (level === 'insufficient' && ordered.length === 0) {
    lines.push(
      language === 'pt'
        ? `• Fontes que responderam: ${coverage.answered}; sem resposta: ${coverage.failed + coverage.notConfigured}.`
        : `• Sources that answered: ${coverage.answered}; unavailable: ${coverage.failed + coverage.notConfigured}.`,
    );
  }

  return lines.join('\n');
}

/**
 * The language the answer should use.
 *
 * The interface does not send a locale, so it is inferred from the user's own
 * words: Portuguese is the default (it is a Portuguese product) and English is
 * only chosen when the text clearly is English and carries nothing Portuguese.
 */
export function verdictLanguage(text: string): 'pt' | 'en' {
  const lower = text.toLowerCase();
  const portuguese =
    /[áàâãéêíóôõúç]/.test(lower) ||
    /(?<![\p{L}\p{N}])(?:o|a|os|as|de|do|da|é|não|sim|este|esta|isto|qual|quem|onde|como|porque|pode|podes|obrigado|número|telefone|morada|seguro|perigo)(?![\p{L}\p{N}])/u
      .test(lower);
  if (portuguese) return 'pt';
  const english =
    /(?<![\p{L}\p{N}])(?:the|is|are|this|that|what|who|where|how|why|can|could|please|thanks|number|phone|address|safe|danger|check)(?![\p{L}\p{N}])/u
      .test(lower);
  return english ? 'en' : 'pt';
}
