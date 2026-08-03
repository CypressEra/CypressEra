# Contributing to CypressEra

Thanks for your interest in CypressEra — an AI-assisted power-system analysis
platform. Contributions of all kinds are welcome: bug reports, docs fixes,
features, and test cases.

## Licensing model (please read before contributing)

CypressEra is **source-available**, not OSI open source:

- **Platform code** (this repository: api-server, agent-server, react-ui,
  deployment) is licensed under the
  [PolyForm Noncommercial License 1.0.0](LICENSE) — free for personal and
  noncommercial use; commercial use requires a license from CypressEra.
- **The flow-solver** (the power-flow computation engine) is closed source.
  It is distributed as a binary under its own [license agreement](SOLVER-EULA.md)
  with the same rule: free for noncommercial use, commercial use requires a
  license.

We chose this model so individuals, students, and researchers can use
everything freely while commercial deployments fund the project's
development.

## Contribution License Agreement

Because CypressEra sells commercial licenses, we need broader rights to your
contribution than the project license alone grants. **By submitting a
contribution (pull request, patch, or code in an issue), you agree that:**

1. The contribution is your original work, or you otherwise have the right
   to submit it under these terms.
2. You grant CypressEra a perpetual, worldwide, irrevocable, royalty-free,
   transferable license to use, reproduce, modify, distribute, publicly
   display, and sublicense your contribution, and to **relicense it under any
   terms, including commercial licenses**.
3. You retain copyright in your contribution and are free to use it for any
   other purpose.
4. Your contribution is provided "as is", without warranties, and you are
   not expected to provide support for it.

If you are contributing on behalf of an employer, make sure you have
permission to agree to the above.

## Development setup

Prerequisites: Docker, Go 1.22+, Node 20+.

```bash
git clone https://github.com/CypressEra/<repo>.git
cd <repo>

# Get the flow-solver binary (public image; no account needed)
./scripts/get-solver.sh   # pulls ghcr.io/cypressera/flow-solver and extracts the binary

# Configure: only two keys are required
cp product-deploy/.env.template .env
#   OPENAI_API_KEY=...          (any OpenAI-compatible provider)
#   KB_EMBEDDING_API_KEY=...    (embeddings for the knowledge base)
#   AUTH_MODE=none              (skip the login system for local development)

docker compose up -d
# App: http://localhost:3000
```

Running the test suites:

```bash
# api-server (Go)
cd api-server && go test ./...
# with a local postgres for the DB-backed tests:
# TEST_DATABASE_URL=postgres://xflow:xflow_password@localhost:5433/xflow?sslmode=disable go test ./...

# react-ui
cd react-ui && CI=true npm test -- --watchAll=false

# agent-server
cd agent-server && npm test
```

## Pull request guidelines

- **Keep PRs focused** — one logical change per PR.
- **Match the surrounding code** — style, naming, and idiom of the file you
  are editing win over personal preference.
- **Tests** — new behavior comes with tests; fixes come with a regression
  test where practical.
- **Compatibility** — changes to configuration must keep an existing `.env`
  working unchanged (compose-level `${VAR:-default}` defaults, never new
  required variables).
- **No secrets** — never commit API keys, tokens, or credentials, including
  in defaults, examples, or test fixtures.

## Reporting bugs and requesting features

Open a GitHub issue with:

- what you did, what you expected, and what happened;
- deployment mode (`AUTH_MODE`, Docker vs local dev) and platform version
  (About dialog, or `PLATFORM_VERSION`);
- relevant logs (`docker compose logs api-server --tail=100`) — **scrub
  secrets before pasting**.

For suspected security vulnerabilities, please email
**support@cypressera.ai** instead of opening a
public issue.
