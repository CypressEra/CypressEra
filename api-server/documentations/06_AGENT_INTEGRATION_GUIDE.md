# Building an Agent on the CypressEra API

A step-by-step guide to connecting your own agent to the CypressEra power-flow API
server. By the end you'll be able to log in, create a session, edit a network, run a
power flow, and read the results — all programmatically.

This guide is framework-agnostic: the examples use plain HTTP (curl) and Python, and
the last section shows how to wire the same calls into an LLM agent as tools.

---

## 1. Mental model

The API is organized around three ideas:

1. **You authenticate once** with your email + password and get a **bearer token**.
2. **You create a session** — an isolated workspace that holds one network model.
3. **You operate on that session**: load a case, edit elements, solve the power flow,
   and read results. The `session_id` ties every operation together.

Your agent's whole job is a loop:

```
login  ->  create/load session  ->  (edit | solve | read)*  ->  done
```

Every response is JSON with a consistent shape (see §2), so your agent can always
inspect `status` and `message` to decide what to do next.

---

## 2. The response contract (read this first)

Every endpoint returns the same envelope, which makes agent logic simple:

- **Success:** body contains `"status": "success"` and usually a `"message"`.
- **Error:** body contains `"status": "error"`, an `"error"` code, and a human-readable
  `"message"`.

So your agent never has to rely only on HTTP status codes — it can branch on
`response["status"] == "error"` and feed `message` back into its reasoning. Error codes
you'll see most often: `session_not_found`, `file_not_found`, `invalid_request`,
`calculation_failed`, `invalid_method`. (Full table at the end of `03_API_REFERENCE.md`.)

---

## 3. Authentication

**Base URL:** `http://localhost:8080/api/v1` (replace host/port with your deployment).

### Step 1 — Log in

```bash
curl -X POST "http://localhost:8080/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'
```

Response:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": { "id": "...", "email": "you@example.com", "role": "user" }
}
```

### Step 2 — Send the token on every other call

All `/api/v1/**` routes (except `/auth/*`) require:

```
Authorization: Bearer <access_token>
```

### Token lifetime & refresh

The access token lasts **24 hours** (`expires_in: 86400`). If your agent runs longer,
call `POST /auth/refresh` to get a fresh token instead of logging in again. When done,
`POST /auth/logout`.

> **Tip for agents:** store the token in memory, and if any call returns a 401, refresh
> once and retry before giving up.

---

## 4. A complete walk-through (curl)

This is the full happy path. Run these in order.

```bash
# --- 0. Authenticate, capture the token ---
TOKEN=$(curl -s -X POST "http://localhost:8080/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}' \
  | jq -r '.access_token')

# --- 1. (Optional) See what case files you have ---
curl -s -X POST "http://localhost:8080/api/v1/user/files" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"file_type":"models"}'

# --- 2. Create a session from one of your library cases ---
SESSION=$(curl -s -X POST "http://localhost:8080/api/v1/session/load-case" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"file_name":"network.rawx"}' | jq -r '.session_id')

# --- 3. Inspect the network (buses, generators, lines, ...) ---
curl -s -X POST "http://localhost:8080/api/v1/session/network" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\"}"

# --- 4. (Optional) Edit an element, e.g. bump a bus voltage setpoint ---
curl -s -X POST "http://localhost:8080/api/v1/session/edit" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\",\"element_type\":\"bus\",\"action\":\"modify\",
       \"identifier\":{\"ibus\":101},\"data\":{\"vm\":1.05}}"

# --- 5. Solve the power flow ---
curl -s -X POST "http://localhost:8080/api/v1/session/solve-flow" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\",\"config\":{\"method\":\"dc\"}}"

# --- 6. Read the results ---
curl -s -X POST "http://localhost:8080/api/v1/session/powerflow" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\"}"
```

Notice the pattern: **`solve-flow` only tells you whether it converged**; you then call
**`powerflow`** to get the actual bus/generator/line results and the system summary.

---

## 5. The endpoints your agent will use most

| Goal | Endpoint | Key fields |
|------|----------|-----------|
| Start fresh (empty) | `POST /session` | — |
| Start from a saved case | `POST /session/load-case` | `file_name` |
| Upload a new case first | `POST /user/upload` (multipart) | `file_type=models`, `file` |
| List your cases | `POST /user/files` | `file_type` |
| Read the model | `POST /session/network` | `session_id` |
| Change the model | `POST /session/edit` | `session_id`, `element_type`, `action`, `data`/`identifier` |
| Run the calculation | `POST /session/solve-flow` | `session_id`, `config.method` |
| Get the answers | `POST /session/powerflow` | `session_id` (+ optional `bus_numbers`, `branches`) |
| Save changes back | `POST /session/save-case` | `session_id` |
| List sessions | `POST /user/sessions` | — |
| Clean up | `DELETE /user/sessions` | — |

**Editing reference** (`/session/edit`):
- `element_type`: `bus` | `load` | `generator` | `acline` | `transformer`
- `action`: `add` (needs `data`) | `modify` (needs `identifier` + `data`) | `delete` (needs `identifier`)

**Solve config** (`/session/solve-flow`):
- `method`: `"dc"`, `"fnsl"`, or `"fdns"` (optional; default `"fnsl"`)
- optional: `tolerance` (default `1e-6`), `max_iterations` (default `100`),
  `lossless_network`, `strip_vector_group_from_ang1`

**Results filtering** (`/session/powerflow`): omit filters to get everything, or pass
`bus_numbers: [1,2,3]` and/or `branches: [{from_bus, to_bus, id?}]`. Branch direction
doesn't matter for matching.

---

## 6. A minimal Python client

Drop this into your agent project. It handles auth, the bearer header, and the
success/error contract.

```python
import requests

class CypressEraClient:
    def __init__(self, base_url, email, password):
        self.base = base_url.rstrip("/")
        self._login(email, password)

    def _login(self, email, password):
        r = requests.post(f"{self.base}/auth/login",
                          json={"email": email, "password": password})
        r.raise_for_status()
        self.token = r.json()["access_token"]

    def _post(self, path, body=None):
        r = requests.post(f"{self.base}{path}",
                          json=body or {},
                          headers={"Authorization": f"Bearer {self.token}"})
        data = r.json()
        if data.get("status") == "error":
            raise RuntimeError(f"{data.get('error')}: {data.get('message')}")
        return data

    # --- high-level helpers ---
    def load_case(self, file_name):
        return self._post("/session/load-case", {"file_name": file_name})["session_id"]

    def get_network(self, sid):
        return self._post("/session/network", {"session_id": sid})["network_data"]

    def edit(self, sid, element_type, action, data=None, identifier=None):
        body = {"session_id": sid, "element_type": element_type, "action": action}
        if data:       body["data"] = data
        if identifier: body["identifier"] = identifier
        return self._post("/session/edit", body)

    def solve(self, sid, method="fnsl"):
        return self._post("/session/solve-flow",
                          {"session_id": sid, "config": {"method": method}})

    def results(self, sid, bus_numbers=None, branches=None):
        body = {"session_id": sid}
        if bus_numbers: body["bus_numbers"] = bus_numbers
        if branches:    body["branches"] = branches
        return self._post("/session/powerflow", body)


# --- usage ---
c = CypressEraClient("http://localhost:8080/api/v1", "you@example.com", "your-password")
sid = c.load_case("network.rawx")
c.edit(sid, "bus", "modify", identifier={"ibus": 101}, data={"vm": 1.05})
solve = c.solve(sid)
if solve["converged"]:
    res = c.results(sid)
    print(res["system_summary"])
```

---

## 7. Wiring it into an LLM agent (optional)

If the user's agent is an LLM that calls tools (e.g. via the Claude API's tool use),
expose the client methods above as tools. Each tool is a thin wrapper that calls one
endpoint and returns the JSON — the model reads `status`/`message` and decides the next
step on its own.

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
api = CypressEraClient("http://localhost:8080/api/v1", "you@example.com", "your-password")

tools = [
    {"name": "load_case", "description": "Create a session from a library case file.",
     "input_schema": {"type": "object",
        "properties": {"file_name": {"type": "string"}}, "required": ["file_name"]}},
    {"name": "solve_power_flow", "description": "Run the power flow for a session (default method fnsl).",
     "input_schema": {"type": "object",
        "properties": {"session_id": {"type": "string"}}, "required": ["session_id"]}},
    {"name": "get_results", "description": "Get power flow results for a session.",
     "input_schema": {"type": "object",
        "properties": {"session_id": {"type": "string"}}, "required": ["session_id"]}},
]

def run_tool(name, args):
    if name == "load_case":        return {"session_id": api.load_case(args["file_name"])}
    if name == "solve_power_flow": return api.solve(args["session_id"])
    if name == "get_results":      return api.results(args["session_id"])

messages = [{"role": "user",
             "content": "Load network.rawx, solve it, and tell me the total losses."}]

while True:
    resp = client.messages.create(
        model="claude-opus-4-8",   # use the latest model available to you
        max_tokens=1024, tools=tools, messages=messages)
    messages.append({"role": "assistant", "content": resp.content})
    if resp.stop_reason != "tool_use":
        print(resp.content[-1].text); break
    results = []
    for block in resp.content:
        if block.type == "tool_use":
            out = run_tool(block.name, block.input)
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": str(out)})
    messages.append({"role": "user", "content": results})
```

That's the entire pattern — the API does the power-flow work, and the model orchestrates
which calls to make based on the `status`/`message` it gets back.

---

## 8. Practical tips

- **Always thread the `session_id`.** It's the handle for every model operation; losing
  it means starting over.
- **`solve-flow` then `powerflow`.** Solving returns only convergence status; fetch
  results separately.
- **Check `converged`.** A `solve` can succeed as a request but report `converged:false`
  — treat that as a modeling problem, not an API error.
- **Handle 401 by refreshing.** Tokens expire after 24h; refresh and retry once.
- **Use result filters for big networks.** Pass `bus_numbers`/`branches` to keep
  responses (and the model's context) small.
- **Health check.** `GET /health` (no auth) is a quick way for the agent's setup code to
  confirm the server is reachable before doing anything else.

---

For the exhaustive request/response schema of every endpoint, see
[`03_API_REFERENCE.md`](03_API_REFERENCE.md) in this same folder.
```
