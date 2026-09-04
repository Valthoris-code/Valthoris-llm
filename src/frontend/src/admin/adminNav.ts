/**
 * Administrative navigation model.
 *
 * The sidebar is data-driven so the area can grow phase by phase without the
 * navigation being rewritten. Each entry declares the permission it needs;
 * permissions are resolved from `governance.role_permissions` at sign-in and
 * are never hardcoded per component.
 *
 * `phase` marks sections whose backend is scheduled for a later phase. They are
 * rendered as "planned" instead of pretending to hold data that does not exist.
 */

export interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
  permission: string;
  /** Delivery phase; 1 means available now. */
  phase: number;
  /** Short description shown by the placeholder page. */
  summary: string;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: 'Command',
    items: [
      {
        to: '/admin',
        label: 'Dashboard',
        icon: '🛡',
        permission: 'dashboard.read',
        phase: 1,
        summary: 'Overview of the platform, its administration and its audit trail.',
      },
    ],
  },
  {
    title: 'Centro de Comando',
    items: [
      {
        to: '/admin/statistics',
        label: 'Estatísticas',
        icon: '📊',
        permission: 'dashboard.read',
        phase: 1,
        summary: 'Contagens reais das tabelas deste Supabase, sem números fabricados.',
      },
      {
        to: '/admin/fraud-reports',
        label: 'Denúncias',
        icon: '📣',
        permission: 'reports.read',
        phase: 1,
        summary: 'Submissão e consulta de denúncias de fraude registadas na plataforma.',
      },
      {
        to: '/admin/fraud-map',
        label: 'Mapa de Denúncias',
        icon: '🗺',
        permission: 'reports.read',
        phase: 1,
        summary: 'Denúncias com coordenadas conhecidas, sobre o mapa.',
      },
      {
        to: '/admin/blacklist',
        label: 'Blacklist',
        icon: '⛔',
        permission: 'blacklist.read',
        phase: 1,
        summary: 'IP, telefone, email, cripto, IBAN, domínio e outros, com importação em lote.',
      },
      {
        to: '/admin/reputation',
        label: 'Reputação de Entidades',
        icon: '⚖',
        permission: 'reputation.read',
        phase: 1,
        summary: 'Score por entidade e o histórico de cada alteração.',
      },
      {
        to: '/admin/monitoring',
        label: 'Monitorização Global',
        icon: '📡',
        permission: 'audit.read',
        phase: 1,
        summary: 'Feed recente da auditoria e do registo técnico de erros.',
      },
    ],
  },
  {
    title: 'Governance',
    items: [
      {
        to: '/admin/administrators',
        label: 'Administrators',
        icon: '👤',
        permission: 'admins.read',
        phase: 1,
        summary: 'Administrator accounts, their roles, MFA state and last access.',
      },
      {
        to: '/admin/roles',
        label: 'Roles & Permissions',
        icon: '🗝',
        permission: 'roles.read',
        phase: 1,
        summary: 'RBAC model: roles, the permissions they grant and who holds them.',
      },
      {
        to: '/admin/audit',
        label: 'Audit Log',
        icon: '📜',
        permission: 'audit.read',
        phase: 1,
        summary: 'Who did what, when, with which permission and with what result.',
      },
    ],
  },
  {
    title: 'Platform',
    items: [
      {
        to: '/admin/users',
        label: 'Utilizadores e Admins',
        icon: '🧑‍🤝‍🧑',
        permission: 'users.read',
        phase: 1,
        summary: 'Contas da plataforma e administradores, com o estado real de cada uma.',
      },
      {
        to: '/admin/plans',
        label: 'Plans',
        icon: '🎫',
        permission: 'plans.read',
        phase: 3,
        summary: 'Free / Pro / Pro+ daily search quotas, configurable without a deploy.',
      },
      {
        to: '/admin/usage',
        label: 'Usage',
        icon: '📈',
        permission: 'plans.read',
        phase: 4,
        summary: 'Entitlements, per-tool cost units, daily quota and remaining balance.',
      },
      {
        to: '/admin/billing',
        label: 'Billing',
        icon: '💳',
        permission: 'billing.read',
        phase: 5,
        summary: 'Subscriptions, payments, renewals, refunds and invoices.',
      },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      {
        to: '/admin/intel-sources',
        label: 'Fontes de Intel',
        icon: '🛰',
        permission: 'system_health.read',
        phase: 1,
        summary: 'Estado real de cada fonte externa, último erro e teste em tempo real.',
      },
      {
        to: '/admin/threat-intelligence',
        label: 'Threat Intelligence',
        icon: '🕵',
        permission: 'threat_intel.read',
        phase: 1,
        summary: 'Indicadores agregados por tipo de ameaça, a partir das nossas tabelas.',
      },
      {
        to: '/admin/ingestion',
        label: 'Data Ingestion',
        icon: '📥',
        permission: 'ingestion.read',
        phase: 7,
        summary: 'CSV / JSON imports with provenance, licensing and per-run statistics.',
      },
      {
        to: '/admin/intelligence',
        label: 'Intelligence Modules',
        icon: '🧠',
        permission: 'threat_intel.read',
        phase: 8,
        summary: 'Phone, IP, e-mail, crypto, IBAN, URL, message and identity modules.',
      },
      {
        to: '/admin/autoshield',
        label: 'AutoShield',
        icon: '🔰',
        permission: 'security.read',
        phase: 9,
        summary: 'Monitoring of the existing AutoShield engine. Read-only by design.',
      },
      {
        to: '/admin/incidents',
        label: 'Incidents',
        icon: '🚨',
        permission: 'incidents.read',
        phase: 9,
        summary: 'Security incidents, their correlation and their resolution.',
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        to: '/admin/reports',
        label: 'Reports',
        icon: '📑',
        permission: 'reports.read',
        phase: 10,
        summary: 'User submissions and exportable operational reports.',
      },
      {
        to: '/admin/api-center',
        label: 'API Center',
        icon: '🔌',
        permission: 'api_center.read',
        phase: 10,
        summary: 'Provider status, latency, quotas and errors. Secrets are never shown.',
      },
      {
        to: '/admin/security',
        label: 'Security',
        icon: '🔐',
        permission: 'security.read',
        phase: 11,
        summary: 'Security posture, error log and administrative hardening.',
      },
      {
        to: '/admin/compliance',
        label: 'Compliance',
        icon: '⚖️',
        permission: 'compliance.read',
        phase: 11,
        summary: 'GDPR, Lei 58/2019, retention, data-subject requests and evidence packages.',
      },
      {
        to: '/admin/authority',
        label: 'Authority View',
        icon: '🏛',
        permission: 'compliance.read',
        phase: 11,
        summary: 'Institutional, aggregated view. Never keys, never bulk personal data.',
      },
      {
        to: '/admin/system-health',
        label: 'System Health',
        icon: '💓',
        permission: 'system_health.read',
        phase: 11,
        summary: 'Supabase, ICP, AI, AutoShield, APIs, billing and ingestion status.',
      },
      {
        to: '/admin/support',
        label: 'Support',
        icon: '🎧',
        permission: 'support.read',
        phase: 11,
        summary: 'Tickets, priority, assignment and resolution history.',
      },
      {
        to: '/admin/feature-flags',
        label: 'Feature Flags',
        icon: '🚩',
        permission: 'feature_flags.read',
        phase: 11,
        summary: 'ON / OFF / BETA switches, every change audited.',
      },
      {
        to: '/admin/versioning',
        label: 'Versioning',
        icon: '🧬',
        permission: 'system_health.read',
        phase: 11,
        summary: 'Administrative releases, authorship, reason and rollback availability.',
      },
      {
        to: '/admin/business',
        label: 'Business',
        icon: '📊',
        permission: 'business.read',
        phase: 11,
        summary: 'Growth, conversion, revenue, retention and operating cost.',
      },
    ],
  },
];

/** Flattened view, used by the router to mount the planned sections. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap(group => group.items);
