# CypressEra

AI-assisted power system analysis. Load a network case, run power flow and
contingency studies, explore results on an interactive diagram, and ask an AI
assistant that understands your model — all self-hosted, in your browser.

**Website:** [cypressera.ai](https://cypressera.ai)

## What it does

- **Power flow** — full Newton-Raphson AC solution (`fnsl`) on RAWX network
  cases, solved by a high-performance native engine (sub-second on
  thousand-bus networks).
- **AC contingency analysis** — ACCC studies with subsystem/monitor/contingency
  study files, multicore execution, and a durable per-user result history.
- **Interactive network diagrams** — auto-layout single-line diagrams with
  power-flow results overlaid.
- **AI assistant** — chat with an agent that can inspect your case, run
  studies, and answer questions grounded in a retrieval-augmented knowledge
  base you control. Works with any OpenAI-compatible LLM provider.
- **Self-hosted** — your models, results, and knowledge base stay on your
  infrastructure.

## Quick start (server)

Deploys the full platform with automatic HTTPS on any Ubuntu VM:

```bash
git clone https://github.com/CypressEra/cypressera.git
cd cypressera/product-deploy
./deploy.sh          # installs Docker, generates secrets, pulls images, starts services

nano .env            # set the ONLY two required values:
                     #   OPENAI_API_KEY=...        (LLM for the assistant)
                     #   KB_EMBEDDING_API_KEY=...  (embeddings for the knowledge base)

docker compose up -d
```

See [product-deploy/README.md](product-deploy/README.md) for DNS setup,
authentication modes, backups, and troubleshooting.

**Login is optional.** The default is email/password auth with a seeded admin
account. For a single-user box on a trusted network, set `AUTH_MODE=none` and
there is no login at all — the app just opens. Email verification (Mailgun)
and Google sign-in are opt-in extras, enabled by the presence of their keys.

## Local development

```bash
git clone https://github.com/CypressEra/cypressera.git
cd cypressera

./scripts/get-solver.sh                   # fetch the flow-solver binary (public image)
cp product-deploy/.env.template .env      # then set the two required keys
echo "AUTH_MODE=none" >> .env             # skip login for local dev

docker compose up -d                      # builds all services from source
# App: http://localhost:3000
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
       │ agent-server │  │ postgres │  (auth only —
       │ (AI, Node)   │  │ optional │   not used in
       └──────────────┘  └──────────┘   AUTH_MODE=none)
```

| Component | Role | Source |
|---|---|---|
| [react-ui](react-ui/) | Desktop-class web UI | This repo |
| [api-server](api-server/) | Sessions, studies, results, auth | This repo |
| [agent-server](agent-server/) | AI assistant, RAG knowledge base | This repo |
| [product-deploy](product-deploy/) | One-command server deployment | This repo |
| flow-solver | Power-flow computation engine | Closed source; distributed as a [binary](SOLVER-EULA.md) |

## Licensing

CypressEra is **source-available** and free for personal and noncommercial
use:

- Platform code: [PolyForm Noncommercial 1.0.0](LICENSE)
- flow-solver binary: [binary license agreement](SOLVER-EULA.md), same rule

**Commercial use requires a license** — contact
[LICENSING CONTACT — e.g. licensing@cypressera.ai].

## Contributing

Bug reports, fixes, and features are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, guidelines, and the
contribution license agreement.
