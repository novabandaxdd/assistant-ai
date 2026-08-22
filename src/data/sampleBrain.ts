import type { BrainNode, BrainLink, NodeCategory } from '../types'

// ── Paleta de cores por categoria
export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  Project:    '#f59e0b',   // amber    — hub do projeto
  Meeting:    '#10b981',   // emerald  — reuniões
  Onboarding: '#8b5cf6',   // violet   — onboarding
  Tech:       '#3b82f6',   // blue     — tecnologias
  Activity:   '#ec4899',   // pink     — atividades/tarefas
  Person:     '#06b6d4',   // cyan     — pessoas
  Decision:   '#f97316',   // orange   — decisões
  Note:       '#84cc16',   // lime     — notas livres
  Resource:   '#94a3b8',   // slate    — recursos / links
  Module:     '#a78bfa',   // purple   — módulos de código
  Feature:    '#34d399',   // teal     — funcionalidades
  Endpoint:   '#fb923c',   // orange   — endpoints de API
}

const n = (id: string, label: string, category: NodeCategory, content = ''): BrainNode => ({
  id, label, category, content,
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

export const SAMPLE_NODES: BrainNode[] = [
  // ── PROJETOS (hubs)
  n('proj-alpha',  'Projeto Alpha',       'Project',    'Novo projeto de plataforma SaaS B2B. Stack: React + Node + Postgres.'),
  n('proj-beta',   'Projeto Beta',        'Project',    'Migração de sistema legado para microsserviços em cloud AWS.'),
  n('proj-gamma',  'Projeto Gamma',       'Project',    'App mobile de delivery. React Native + Firebase + Node.js.'),

  // ── ONBOARDING
  n('ob-proc',     'Processo de Onboarding',  'Onboarding', 'Checklist de entrada: acesso a repos, ambientes, Jira, Slack, 1:1 com o tech lead.'),
  n('ob-arch',     'Arquitetura do Sistema',  'Onboarding', 'Diagrama C4 do sistema. Serviços: auth, core-api, worker, notificações.'),
  n('ob-conv',     'Convenções de Código',    'Onboarding', 'ESLint + Prettier. Commits no padrão Conventional Commits. PR deve ter 2 aprovações.'),
  n('ob-env',      'Setup de Ambiente',       'Onboarding', 'Docker Compose sobe tudo local. .env.example no repo. Node 20 LTS, pnpm 8.'),
  n('ob-flow',     'Fluxo de Deploy',         'Onboarding', 'CI/CD no GitHub Actions. main → staging automático. staging → prod manual com release tag.'),

  // ── REUNIÕES
  n('meet-kick',   'Kickoff Alpha',           'Meeting',    '15/01/2025 — Apresentação do projeto, definição de squad, roadmap Q1. Decisão: usar Postgres em vez de MySQL.'),
  n('meet-sprint1','Sprint Planning #1',      'Meeting',    '20/01/2025 — Histórias do sprint 1. Velocity estimada: 40pts. Foco em autenticação e CRUD base.'),
  n('meet-retro1', 'Retrospectiva Sprint 1',  'Meeting',    '03/02/2025 — O que foi bem: CI/CD. Melhorar: comunicação entre front e back. Ação: daily às 9h.'),
  n('meet-1on1',   '1:1 Tech Lead',           'Meeting',    '10/02/2025 — Feedback positivo sobre onboarding. Próximos passos: assumir módulo de pagamentos.'),
  n('meet-arch',   'Review Arquitetura',      'Meeting',    '17/02/2025 — Decisão de migrar cache de Redis para upstash. Motivo: reduzir infra gerenciada.'),

  // ── TECNOLOGIAS
  n('tech-react',  'React 18',                'Tech',       'UI framework principal. Usar RSC onde possível. Zustand para state global.'),
  n('tech-node',   'Node.js / Fastify',       'Tech',       'API REST com Fastify v4. Plugins: JWT, multipart, rate-limit.'),
  n('tech-pg',     'PostgreSQL',              'Tech',       'DB principal. Migrations com Drizzle ORM. Pool de conexões via pgBouncer.'),
  n('tech-docker', 'Docker / K8s',            'Tech',       'Containers Docker. Orquestração em K8s no EKS. Helm charts no /infra.'),
  n('tech-gh',     'GitHub Actions',          'Tech',       'CI: lint + test + build. CD: deploy automático em staging, manual em prod.'),
  n('tech-redis',  'Redis / Upstash',         'Tech',       'Cache de sessões e rate-limit. Migração para Upstash serverless em andamento.'),
  n('tech-ts',     'TypeScript',              'Tech',       'Strict mode habilitado. Types compartilhados no pacote @monorepo/types.'),
  n('tech-rn',     'React Native',            'Tech',       'App mobile do Projeto Gamma. Expo managed workflow. OTA updates via expo-updates.'),

  // ── ATIVIDADES / TAREFAS
  n('act-auth',    'Módulo de Autenticação',  'Activity',   'JWT + refresh token. OAuth Google e GitHub. Implementado no sprint 1. Status: ✅ Done.'),
  n('act-pay',     'Módulo de Pagamentos',    'Activity',   'Integração Stripe. Webhooks para eventos de assinatura. Status: 🔄 Em progresso.'),
  n('act-notif',   'Sistema de Notificações', 'Activity',   'Email via Resend + push notification. Status: 📋 Backlog.'),
  n('act-dash',    'Dashboard Analytics',     'Activity',   'Gráficos de uso com Recharts. Dados agregados por worker. Status: 📋 Backlog.'),
  n('act-migr',    'Migração de Dados',       'Activity',   'Script de migração do sistema legado. Validação de 1.2M registros. Status: 🔄 Em progresso.'),
  n('act-perf',    'Otimização de Performance','Activity',  'Indexação de queries lentas. Meta: P99 < 200ms. Status: 📋 Backlog.'),

  // ── PESSOAS
  n('per-me',      'Eu (Dev)',                'Person',     'Meu papel no projeto. Responsável pelo módulo de pagamentos e integrações.'),
  n('per-tl',      'João — Tech Lead',        'Person',     'Tech lead do squad Alpha. Ponto de contato para decisões de arquitetura.'),
  n('per-pm',      'Ana — Product Manager',   'Person',     'PM responsável pelo roadmap e priorização. Reunião semanal às sextas.'),
  n('per-qa',      'Carlos — QA',             'Person',     'Responsável por automação de testes. Cypress E2E + Jest unitário.'),
  n('per-devops',  'Marina — DevOps',         'Person',     'Responsável pela infra e pipelines CI/CD. Contato para dúvidas de deploy.'),

  // ── DECISÕES
  n('dec-pg',      'Postgres > MySQL',        'Decision',   'Decidido no kickoff. Motivo: suporte nativo a JSON, pgvector para features futuras.'),
  n('dec-redis',   'Upstash > Redis próprio', 'Decision',   'Decidido na review de arquitetura 17/02. Motivo: reduzir infra gerenciada e custo.'),
  n('dec-mono',    'Monorepo com pnpm',        'Decision',   'Decidido no setup inicial. Turborepo + pnpm workspaces para compartilhar types e utils.'),
  n('dec-api',     'REST > GraphQL',           'Decision',   'Decidido no kickoff. Motivo: simplicidade, equipe mais familiarizada, sem over-fetching no MVP.'),

  // ── NOTAS LIVRES
  n('note-1',      'Dúvidas para próxima 1:1', 'Note',      '1) Como é o processo de code review? 2) Existe documentação de ADRs? 3) Qual o plano de carreira no squad?'),
  n('note-2',      'Links úteis do projeto',   'Note',      'Jira: jira.empresa.com/alpha | Notion: notion.so/alpha-docs | Staging: alpha-staging.empresa.com'),
  n('note-3',      'Aprendizados Sprint 1',    'Note',      'Fastify é muito mais rápido que Express. Drizzle ORM tem DX excelente. Daily às 9h funciona bem.'),
  n('note-4',      'Riscos identificados',     'Note',      '1) Migração de dados pode atrasar sprint 3. 2) Redis próprio é single point of failure. 3) Falta doc de API pública.'),

  // ── RECURSOS
  n('res-repo',    'Repositório GitHub',       'Resource',  'github.com/empresa/proj-alpha — monorepo com apps/web, apps/api, packages/types'),
  n('res-figma',   'Figma — UI Design',        'Resource',  'Design system completo. Componentes no Storybook. Link no canal #design do Slack.'),
  n('res-adr',     'ADRs (Architecture Decision Records)', 'Resource', 'Registro de decisões técnicas. Pasta /docs/adr no repo.'),
  n('res-runbook', 'Runbook de Deploy',        'Resource',  'Passo a passo de deploy em produção. Inclui rollback. Notion: /alpha-runbook'),
]

export const SAMPLE_LINKS: BrainLink[] = [
  // Projetos → onboarding
  { id:'l1',  source:'proj-alpha',  target:'ob-proc',    strength:0.9 },
  { id:'l2',  source:'proj-alpha',  target:'ob-arch',    strength:0.9 },
  { id:'l3',  source:'proj-alpha',  target:'ob-conv',    strength:0.8 },
  { id:'l4',  source:'proj-alpha',  target:'ob-env',     strength:0.8 },
  { id:'l5',  source:'proj-alpha',  target:'ob-flow',    strength:0.7 },
  { id:'l6',  source:'proj-beta',   target:'ob-arch',    strength:0.7 },
  { id:'l7',  source:'proj-gamma',  target:'tech-rn',    strength:0.9 },
  { id:'l8',  source:'proj-gamma',  target:'tech-react', strength:0.7 },

  // Projetos → reuniões
  { id:'l10', source:'proj-alpha',  target:'meet-kick',  strength:0.9 },
  { id:'l11', source:'proj-alpha',  target:'meet-sprint1',strength:0.8 },
  { id:'l12', source:'proj-alpha',  target:'meet-retro1',strength:0.8 },
  { id:'l13', source:'proj-alpha',  target:'meet-1on1',  strength:0.7 },
  { id:'l14', source:'proj-alpha',  target:'meet-arch',  strength:0.8 },

  // Projetos → atividades
  { id:'l20', source:'proj-alpha',  target:'act-auth',   strength:0.9 },
  { id:'l21', source:'proj-alpha',  target:'act-pay',    strength:0.9 },
  { id:'l22', source:'proj-alpha',  target:'act-notif',  strength:0.7 },
  { id:'l23', source:'proj-alpha',  target:'act-dash',   strength:0.7 },
  { id:'l24', source:'proj-beta',   target:'act-migr',   strength:0.9 },
  { id:'l25', source:'proj-alpha',  target:'act-perf',   strength:0.7 },

  // Reuniões → decisões
  { id:'l30', source:'meet-kick',   target:'dec-pg',     strength:0.9 },
  { id:'l31', source:'meet-kick',   target:'dec-api',    strength:0.9 },
  { id:'l32', source:'meet-kick',   target:'dec-mono',   strength:0.8 },
  { id:'l33', source:'meet-arch',   target:'dec-redis',  strength:0.9 },

  // Reuniões → pessoas
  { id:'l40', source:'meet-kick',   target:'per-tl',     strength:0.8 },
  { id:'l41', source:'meet-kick',   target:'per-pm',     strength:0.8 },
  { id:'l42', source:'meet-1on1',   target:'per-tl',     strength:0.9 },
  { id:'l43', source:'meet-sprint1',target:'per-qa',     strength:0.7 },

  // Pessoas → atividades
  { id:'l50', source:'per-me',      target:'act-pay',    strength:0.9 },
  { id:'l51', source:'per-me',      target:'act-auth',   strength:0.7 },
  { id:'l52', source:'per-qa',      target:'act-auth',   strength:0.8 },
  { id:'l53', source:'per-devops',  target:'ob-flow',    strength:0.9 },
  { id:'l54', source:'per-devops',  target:'tech-docker',strength:0.8 },
  { id:'l55', source:'per-devops',  target:'tech-gh',    strength:0.9 },
  { id:'l56', source:'per-tl',      target:'ob-arch',    strength:0.9 },
  { id:'l57', source:'per-pm',      target:'act-dash',   strength:0.8 },

  // Tech → atividades
  { id:'l60', source:'tech-react',  target:'act-auth',   strength:0.7 },
  { id:'l61', source:'tech-node',   target:'act-auth',   strength:0.8 },
  { id:'l62', source:'tech-node',   target:'act-pay',    strength:0.8 },
  { id:'l63', source:'tech-pg',     target:'act-migr',   strength:0.9 },
  { id:'l64', source:'tech-redis',  target:'dec-redis',  strength:0.9 },
  { id:'l65', source:'tech-ts',     target:'ob-conv',    strength:0.8 },
  { id:'l66', source:'tech-docker', target:'ob-env',     strength:0.8 },
  { id:'l67', source:'tech-gh',     target:'ob-flow',    strength:0.9 },
  { id:'l68', source:'tech-rn',     target:'act-notif',  strength:0.7 },

  // Notas → contexto
  { id:'l70', source:'note-1',      target:'meet-1on1',  strength:0.8 },
  { id:'l71', source:'note-2',      target:'proj-alpha', strength:0.7 },
  { id:'l72', source:'note-3',      target:'meet-retro1',strength:0.8 },
  { id:'l73', source:'note-4',      target:'act-migr',   strength:0.7 },
  { id:'l74', source:'note-4',      target:'tech-redis', strength:0.7 },

  // Recursos
  { id:'l80', source:'res-repo',    target:'proj-alpha', strength:0.9 },
  { id:'l81', source:'res-figma',   target:'act-dash',   strength:0.7 },
  { id:'l82', source:'res-adr',     target:'dec-pg',     strength:0.9 },
  { id:'l83', source:'res-adr',     target:'dec-redis',  strength:0.9 },
  { id:'l84', source:'res-adr',     target:'dec-mono',   strength:0.8 },
  { id:'l85', source:'res-runbook', target:'ob-flow',    strength:0.9 },
  { id:'l86', source:'res-runbook', target:'per-devops', strength:0.7 },
  { id:'l87', source:'per-me',      target:'proj-alpha', strength:0.9 },
  { id:'l88', source:'per-me',      target:'note-1',     strength:0.8 },
  { id:'l89', source:'proj-alpha',  target:'tech-react', strength:0.8 },
  { id:'l90', source:'proj-alpha',  target:'tech-node',  strength:0.8 },
  { id:'l91', source:'proj-alpha',  target:'tech-pg',    strength:0.8 },
  { id:'l92', source:'proj-alpha',  target:'tech-ts',    strength:0.7 },
  { id:'l93', source:'proj-alpha',  target:'tech-gh',    strength:0.7 },
]
