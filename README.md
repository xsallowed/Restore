# Restore — Operational Resilience & Recovery Orchestration Platform

> **RESTORE-SDD-001 v1.1 — Lean MVP**  
> Target operating cost: ~$30–95/month in steady state

Restore is a unified platform for orchestrating recovery from any disruption event — cyber incidents, infrastructure failures, DR activations, major incidents — through a single system of record with Bronze, Silver, and Gold tiered visibility.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  React SPA (Vite + TypeScript + Tailwind)                   │
│  Bronze UI · Silver Gantt · Gold Executive Dashboard        │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS + SSE
┌──────────────────────▼──────────────────────────────────────┐
│  Caddy / Nginx  (TLS termination + reverse proxy)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Express Modular Monolith (Node.js + TypeScript)            │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐│
│  │Identity &   │ │Orchestration │ │Runbook & SOE          ││
│  │Access Module│ │& Asset Module│ │Generation Module      ││
│  └─────────────┘ └──────────────┘ └───────────────────────┘│
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐│
│  │Execution &  │ │Reporting &   │ │Background Worker      ││
│  │Event Module │ │Audit Module  │ │(job queue via PG)     ││
│  └─────────────┘ └──────────────┘ └───────────────────────┘│
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  PostgreSQL 16                                              │
│  • JSONB for flexible SOE step schemas                      │
│  • LISTEN/NOTIFY for real-time SSE bridge                   │
│  • Recursive CTE for blast radius traversal                 │
│  • Append-only audit log with HMAC-SHA256 chain             │
│  • Separate rehearsal schema for sandbox isolation          │
└─────────────────────────────────────────────────────────────┘
         │                              │
┌────────▼──────┐             ┌─────────▼──────┐
│ LLM Provider  │             │ Object Storage │
│ OpenAI/Claude │             │ Local / R2 / S3│
│ (configurable)│             │ Evidence files │
└───────────────┘             └────────────────┘
```

**Real-time:** PostgreSQL LISTEN/NOTIFY → Server-Sent Events (SSE) → React UI  
**Async work:** PostgreSQL jobs table → Background Worker (polls every 5s)  
**No Kafka. No Neo4j. No Kubernetes.** Upgradeable later when justified.

---

## Project Structure

```
restore/
├── docker-compose.yml          # Local dev stack
├── .env.example                # All environment variables documented
├── package.json                # Monorepo root
│
├── backend/                    # Express modular monolith
│   ├── src/
│   │   ├── index.ts            # App entry point
│   │   ├── worker.ts           # Background job processor
│   │   ├── api/
│   │   │   └── routes.ts       # All REST API endpoints
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT auth + Bronze/Silver/Gold tier enforcement
│   │   │   └── goldFilter.ts   # Server-side Gold data abstraction
│   │   ├── lib/
│   │   │   ├── db.ts           # postgres.js client + audit log + job enqueue
│   │   │   ├── sse.ts          # SSE manager + PG LISTEN/NOTIFY bridge
│   │   │   └── logger.ts       # Winston logger
│   │   ├── llm/
│   │   │   └── provider.ts     # LLM abstraction (OpenAI / Anthropic)
│   │   ├── modules/
│   │   │   └── runbook/
│   │   │       └── soeGenerator.ts  # 4-stage LLM SOE generation pipeline
│   │   └── connectors/
│   │       ├── github.ts       # GitHub REST API connector
│   │       └── confluence.ts   # Confluence + HTTP connectors
│   ├── tsconfig.json
│   ├── Dockerfile.dev          # App container
│   └── Dockerfile.worker       # Worker container
│
├── apps/web/                   # React frontend
│   ├── src/
│   │   ├── App.tsx             # Router with tier-aware routing
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── lib/
│   │   │   └── api.ts          # Axios client + SSE hook + typed API helpers
│   │   ├── store/
│   │   │   └── auth.ts         # Zustand auth store with tier helpers
│   │   ├── components/
│   │   │   ├── shared/
│   │   │   │   └── AppShell.tsx     # Sidebar + tier badge + nav
│   │   │   └── silver/
│   │   │       └── GanttChart.tsx   # Recharts Gantt with swim lanes + TTFR
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── bronze/
│   │       │   └── ExecutionInterface.tsx   # Step-by-step SOE execution
│   │       ├── silver/
│   │       │   ├── OrchestratorDashboard.tsx # Business service health + events
│   │       │   ├── NewEventPage.tsx
│   │       │   ├── RehearsalPage.tsx
│   │       │   └── AssetRegistryPage.tsx
│   │       ├── gold/
│   │       │   └── GoldDashboard.tsx  # Executive view — no step-level detail
│   │       └── shared/
│   │           ├── EventListPage.tsx
│   │           ├── AuditPage.tsx
│   │           └── ConnectorsPage.tsx
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── Dockerfile.dev
│
└── infra/
    └── postgres/
        └── init.sql            # Full schema: all tables, triggers, functions
```

---

## Quick Start

### 1. Clone and configure

```bash
git clone <your-repo>
cd restore
cp .env.example .env
# Edit .env — at minimum set LLM_API_KEY
```

### 2. Start with Docker Compose

```bash
# Start PostgreSQL + backend + worker + web
docker compose up -d

# Check all containers are healthy
docker compose ps

# View backend logs
docker compose logs -f backend

# View worker logs
docker compose logs -f worker
```

The web app will be available at **http://localhost:5173**  
The API will be available at **http://localhost:3001/api/v1**

### 3. Local development (without Docker)

```bash
# Start PostgreSQL only
docker compose up -d postgres

# Install all dependencies
npm install

# Run backend + frontend in parallel
npm run dev
```

---

## Environment Variables

See `.env.example` for full documentation of every variable.

**Minimum required to run:**
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random string ≥ 64 chars for JWT signing |
| `HMAC_SECRET` | Random string ≥ 64 chars for audit chain |
| `LLM_API_KEY` | Your OpenAI or Anthropic API key |

---

## LLM Provider

Restore abstracts the LLM provider. Switch via environment variable:

```bash
# Use OpenAI GPT-4o-mini (cheapest, default)
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...

# Use Anthropic Claude Haiku (alternative)
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-...
```

Token budgets are enforced per pipeline stage to keep costs predictable. Typical SOE generation costs ~$0.002–0.008 per event at GPT-4o-mini rates.

---

## Bronze / Silver / Gold Tier System

Tier is assigned at login based on the user's IdP group (or database role for pilots).

| Tier | Default Landing Page | What They See |
|---|---|---|
| **Bronze** | `/events` | Step list, evidence capture, escalation |
| **Silver** | `/dashboard` | Gantt chart, blast radius, team coordination |
| **Gold** | `/gold` | Business service health only — no step detail |
| **Author** | `/connectors` | Runbook management + Silver capabilities |
| **Admin** | `/dashboard` | Everything |

**Gold data abstraction is enforced server-side** — the `GoldDataFilter` middleware strips step-level data from all API responses to Gold-tier JWTs before they leave the server.

---

## Database Schema Highlights

- **`get_blast_radius(asset_id)`** — recursive CTE traversing the dependency adjacency list up to 10 hops
- **`audit_log`** — append-only (UPDATE/DELETE blocked by database rules), HMAC-SHA256 chain
- **`rehearsal` schema** — isolated PostgreSQL schema for all dress rehearsal data
- **LISTEN/NOTIFY triggers** on `soe_steps` and `assets` → SSE broadcast to connected clients
- **`jobs` table** — lightweight job queue replacing Kafka for the lean MVP

---

## Adding a Runbook Connector

1. Create a class implementing the `ConnectorInterface` pattern in `backend/src/connectors/`
2. Register it in the `sync_connector` job handler in `worker.ts`
3. Add connector config via the API:

```bash
curl -X POST http://localhost:3001/api/v1/connectors \
  -H "Authorization: Bearer <author-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Security Runbooks GitHub",
    "connectorType": "GITHUB",
    "config": { "owner": "myorg", "repo": "runbooks", "paths": ["cyber", "dr"] },
    "credentialRef": "GITHUB_TOKEN"
  }'
```

Set `GITHUB_TOKEN=ghp_...` in your environment. The connector stores only the env var name — never the credential itself.

---

## Monthly Cost Envelope

| Component | Choice | Est. Monthly |
|---|---|---|
| App hosting | Single VM or PaaS container | $10–25 |
| Database | Free/entry managed PostgreSQL | $0–25 |
| Object storage | Cloudflare R2 or S3 | $0–10 |
| Reverse proxy / CDN | Caddy + Cloudflare free | $0 |
| Secrets / monitoring | Env vars + free uptime tool | $0–10 |
| Email / notifications | Low-volume SMTP | $0–10 |
| LLM usage | GPT-4o-mini with token budgets | $10–30 |
| **Total** | | **~$30–95/month** |

---

## Upgrade Path

The lean MVP is deliberately designed to be upgraded component-by-component:

| When you need | Upgrade to |
|---|---|
| High availability | Add second app instance + load balancer |
| High-throughput real-time | Replace LISTEN/NOTIFY with Redis pub/sub or Kafka |
| Large asset graph (10k+ nodes) | Migrate adjacency list to Neo4j |
| Multi-region | Kubernetes + Helm charts |
| Dedicated secrets | HashiCorp Vault |
| Full observability | OpenTelemetry + Grafana stack |

---

## Document References

- `RESTORE-RDD-001` — Requirements Definition Document  
- `RESTORE-SDD-001 v1.0` — Full enterprise architecture (original)  
- `RESTORE-SDD-001 v1.1` — This lean MVP architecture

---

*Restore — Operational Resilience & Recovery Orchestration Platform*
