# Analysis Functions

## findShortestPath

Find the path with the fewest buses between two buses in the in-service network topology. Uses BFS over in-service AC lines and transformers. Returns the ordered sequence of bus IDs including both endpoints.

**Parameters:**
- `fromBus` (number, required): Starting bus number.
- `toBus` (number, required): Target bus number.
- `sessionId` (string, optional): Session ID. If not provided, uses the current active session.

**Returns (path found):**
```json
{
  "found": true,
  "path": [101, 205, 307]
}
```

**Returns (no path — disconnected islands):**
```json
{
  "found": false
}
```

**Returns (same bus):**
```json
{
  "found": true,
  "path": [101]
}
```

**Example:**
```json
{
  "fromBus": 101,
  "toBus": 307
}
```

**Notes:**
- Only in-service AC lines and transformers form edges; out-of-service branches are ignored.
- When `fromBus == toBus` a single-element path is returned immediately.
- `found: false` means the buses exist but are in different disconnected islands. It does not mean a bus number is invalid.

---

## findNeighbourElements

Find all in-service network elements within N buses of an origin bus. Returns elements annotated with how many buses away they are and their closest terminal bus.

**Parameters:**
- `originBus` (number, required): Origin bus number.
- `n` (number, required): Number of bus-levels to search (integer, 1–99). Level 0 = origin bus itself.
- `elementTypes` (array of strings, optional): Filter to specific element types. When omitted or empty, all nine types are returned. Valid values: `Bus`, `AcLine`, `Transformer`, `Generator`, `Load`, `FixShunt`, `SwitchedShunt`, `TwoTermDc`, `VscDc`.
- `sessionId` (string, optional): Session ID. If not provided, uses the current active session.

**Returns:**

```json
{
  "status": "success",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "origin_bus": 101,
  "max_buses_away": 2,
  "elements": [...]
}
```

Each object in `elements` has:
- `type` (string): Element type (`Bus`, `AcLine`, `Transformer`, `Generator`, `Load`, `FixShunt`, `SwitchedShunt`, `TwoTermDc`, `VscDc`)
- `buses_away` (number): Number of buses away the closest terminal bus is from the origin (0 = at origin bus)
- `closest_terminal_bus` (number): Bus ID used for the buses_away calculation
- All element data fields (e.g. `ibus`, `jbus`, `pg`, `pl`, `stat`, `baskv`, etc.)

```json
[
  {
    "type": "Bus",
    "buses_away": 0,
    "closest_terminal_bus": 101,
    "ibus": 101,
    "name": "MAIN-101",
    "baskv": 230.0,
    "ide": 2
  },
  {
    "type": "Generator",
    "buses_away": 0,
    "closest_terminal_bus": 101,
    "ibus": 101,
    "machid": "1",
    "pg": 250.0,
    "qg": 50.0,
    "stat": 1
  },
  {
    "type": "AcLine",
    "buses_away": 0,
    "closest_terminal_bus": 101,
    "ibus": 101,
    "jbus": 205,
    "ckt": "1",
    "stat": 1,
    "rpu": 0.0042,
    "xpu": 0.0395
  }
]
```

**Example (all types, 2 levels):**
```json
{
  "originBus": 101,
  "n": 2
}
```

**Example (generators and loads only, 3 levels):**
```json
{
  "originBus": 101,
  "n": 3,
  "elementTypes": ["Generator", "Load"]
}
```

**Notes:**
- Branch elements (AcLine, Transformer, TwoTermDc, VscDc) are included if **any** terminal bus is within `n` buses of the origin. `buses_away` reflects the closest terminal.
- Only in-service elements are returned (stat=0 / status=0 elements are excluded).
- The origin bus and all its attached shunt/injection elements are at level 0.
- Results are sorted by (buses_away, closest_terminal_bus, element type).

---

## solveFlow

Solve power flow calculation. Performs dc, fnsl, or fdns power flow analysis. Returns only success status (success, converged, method, session_id, message), not full results. Use `getPowerFlowData()` to retrieve the actual calculation results.

**Parameters:**
- `method` (string, optional): Power flow calculation method. Must be one of: `dc`, `fnsl`, `fdns`. Default: `fnsl`
- `area_interchange_adjustment` (string, optional): AC area-interchange control mode. Must be one of: `disabled`, `tie_lines_only`, `tie_lines_and_loads`. Adjusts each area's swing generator to meet its scheduled net interchange. **Not required** — when omitted, the field is not sent and the server applies its default (`disabled`). Only applies to non-DC methods (`fnsl`, `fdns`). Values align with the react-ui solver settings and the api-server defaults.

All solver settings use sensible defaults and normally don't need to be specified.

**Returns:**
```json
{
  "status": "success",
  "success": true,
  "converged": true,
  "message": "Power flow calculation completed successfully",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "method": "fnsl"
}
```

**Example:**
```json
{}
```

**Example with explicit method:**
```json
{
  "method": "dc"
}
```

**Example with area interchange control:**
```json
{
  "method": "fnsl",
  "area_interchange_adjustment": "tie_lines_only"
}
```

**Notes:**
- DC power flow is linearized and faster, useful for quick estimates
- AC power flow is full nonlinear solution, more accurate for most cases
- This function returns only status. Call `getPowerFlowData()` to get actual results.
- `area_interchange_adjustment` is optional; omit it to let the server default it to `disabled`.

---

## getPowerFlowData

Get power flow calculation results. Can optionally filter by bus numbers or branches. Must call `solveFlow()` first before calling this function.

**Parameters:**
- `sessionId` (string, optional): Session ID. If not provided, uses the current active session.
- `busNumbers` (array of numbers, optional): Filter by bus numbers. If empty or omitted, returns all buses.
- `branches` (array of objects, optional): Filter by branches. If empty or omitted, returns all branches.
  - `from_bus` (number, required): From bus number
  - `to_bus` (number, required): To bus number
  - `id` (string, optional): Branch ID. If provided, must match exactly. If omitted, matches by bus pair only (order doesn't matter).

**Returns:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "method": "dc",
  "converged": true,
  "solution_time_ms": 125.5,
  "iterations": 5,
  "max_mismatch": 1e-8,
  "bus_results": [
    {
      "bus_number": 1,
      "voltage_mag": 1.0,
      "voltage_angle": 0.0,
      "voltage_angle_deg": 0.0,
      "net_p_injection": 100.0,
      "net_q_injection": 50.0
    }
  ],
  "branch_results": [
    {
      "from_bus": 1,
      "to_bus": 2,
      "id": "1",
      "p_flow": 50.0,
      "q_flow": 25.0,
      "s_flow": 55.9,
      "power_loss": 0.5
    }
  ],
  "system_summary": {
    "total_load_mw": 500.0,
    "total_generation_mw": 510.0,
    "total_losses_mw": 10.0,
    "efficiency_percent": 98.0
  }
}
```

**Example (Get all results):**
```json
{}
```

**Example (Filter by buses):**
```json
{
  "busNumbers": [1, 2, 3]
}
```

**Example (Filter by branches):**
```json
{
  "branches": [
    {
      "from_bus": 1,
      "to_bus": 2,
      "id": "1"
    },
    {
      "from_bus": 2,
      "to_bus": 3
    }
  ]
}
```

**Notes:**
- Must call `solveFlow()` first before calling this function
- When filtering branches, the `from_bus` and `to_bus` order doesn't matter - a branch from bus 1 to bus 2 will match a filter with `from_bus: 2, to_bus: 1`
- If `id` is provided in branch filter, it must match exactly
- If `id` is omitted, matches by bus pair only (order doesn't matter)

