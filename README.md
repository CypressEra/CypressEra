# CypressEra

**The next-level AI-automated power system analysis platform.**

CypressEra pairs a high-performance power-flow engine with an AI assistant
that operates the platform for you. One message is enough to load a network
case, run a study, and report the results — the assistant performs the
operations, you review the engineering. Upload your ISO and utility documents
to the built-in knowledge base and the assistant grounds its answers in them.
Everything runs on your own infrastructure: your models, results, and
documents never leave your servers.

Try the hosted version at [cypressera.ai](https://cypressera.ai), or
self-host with the quick start below.

## Capabilities

- **AI-automated operation** — a natural-language interface that understands
  power systems. The assistant loads cases, prepares and runs studies, and
  explains results. Works with any OpenAI-compatible LLM provider.
- **AI knowledge base** — upload ISO documents, planning criteria, and
  internal procedures; the assistant incorporates them into its analysis
  through retrieval-augmented generation.
- **Power flow** — full Newton-Raphson AC solution (`fnsl`) on RAWX network
  cases, computed by a high-performance native solver engine.
- **AC contingency analysis** — ACCC studies driven by subsystem, monitor,
  and contingency study files, with multicore execution and a durable
  per-user result history.
- **Interactive network diagrams** — automatically laid-out single-line
  diagrams with power-flow results overlaid.
- **Private deployment** — one-command Docker deployment with automatic
  HTTPS. Complete control over your data.

Typical applications: transmission planning studies, energy market analysis,
and grid operation support.

## Quick start (server)

Deploys the full platform with automatic HTTPS on any Ubuntu VM:

```bash
git clone https://github.com/CypressEra/CypressEra.git
cd CypressEra/product-deploy
./deploy.sh          # installs Docker, generates secrets, pulls images, starts services

nano .env            # set the only two required values:
                     #   OPENAI_API_KEY=...        (LLM for the assistant)
                     #   KB_EMBEDDING_API_KEY=...  (embeddings for the knowledge base)

docker compose up -d
```

See [product-deploy/README.md](product-deploy/README.md) for DNS setup,
authentication modes, backups, and troubleshooting.

**Login is optional.** The default is email/password authentication with a
seeded administrator account. For a single-user machine on a trusted network,
set `AUTH_MODE=none` and the application opens with no login. Email
verification (Mailgun) and Google sign-in are optional features, enabled by
providing their keys.

## Local development

```bash
git clone https://github.com/CypressEra/CypressEra.git
cd CypressEra

./scripts/get-solver.sh                   # fetch the flow-solver binary (public image)
cp product-deploy/.env.template .env      # then set the two required keys
echo "AUTH_MODE=none" >> .env             # skip login for local development

docker compose up -d                      # builds all services from source
# Application: http://localhost:3000
```

## Architecture

```
       ┌──────────┐   ┌────────────┐   ┌──────────────┐
       │ react-ui │──▶│ api-server │──▶│ flow-solver  │
       │ (browser)│   │  (Go/Gin)  │   │ (native bin) │
       └────┬─────┘   └─────┬──────┘   └──────────────┘
            │               │ user-data (filesystem)
            ▼               ▼
       ┌──────────────┐  ┌──────────┐
       │ agent-server │  │ postgres │  (authentication only —
       │ (AI, Node)   │  │ optional │   not used in AUTH_MODE=none)
       └──────────────┘  └──────────┘
```

| Component | Role | Source |
|---|---|---|
| [react-ui](react-ui/) | Web application | This repository |
| [api-server](api-server/) | Sessions, studies, results, authentication | This repository |
| [agent-server](agent-server/) | AI assistant, knowledge base | This repository |
| [product-deploy](product-deploy/) | One-command server deployment | This repository |
| flow-solver | Power-flow computation engine | Closed source; distributed as a [binary](SOLVER-EULA.md) |

## Licensing

CypressEra is source-available with two tiers:

| | Terms |
|---|---|
| **Community** — personal, academic, research, and other noncommercial use | Free. Platform code is licensed under [PolyForm Noncommercial 1.0.0](LICENSE); the flow-solver binary under its [license agreement](SOLVER-EULA.md), with the same noncommercial scope. |
| **Professional** — commercial use of any kind | Requires a commercial license. Contact **support@cypressera.ai**. |

## Contributing

Bug reports, fixes, and features are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) for development setup, guidelines, and the
contribution license agreement.
