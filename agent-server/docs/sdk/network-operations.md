# Network Operations Functions

## getNetwork

Get network data from the current session. Returns bus, load, generator, transmission line, and transformer data.

**Parameters:**
- `sessionId` (string, optional): Session ID. If not provided, uses the current session.

**Example:**
```json
{
  "sessionId": "optional-session-id"
}
```

## addElement

Add a new network element (bus, load, generator, transmission line, or transformer) to the power grid.

**Parameters:**
- `elementType` (string, required): Type of element to add. Must be one of: `bus`, `load`, `generator`, `acline`, `transformer`
- `data` (object, required): Element data. See `element-types.md` for detailed field requirements.

**Example:**
```json
{
  "elementType": "bus",
  "data": {
    "ibus": 99999,
    "name": "NEW BUS",
    "baskv": 230.0,
    "ide": 1,
    "vm": 1.0,
    "va": 0.0
  }
}
```

## modifyElement

Modify an existing network element. Updates properties of a bus, load, generator, transmission line, or transformer.

**IMPORTANT:**
1. The `identifier` parameter MUST be an object with specific keys, NOT just a number.
2. The `data` parameter must contain only the fields you want to modify.

**Parameters:**
- `elementType` (string, required): Type of element to modify. Must be one of: `bus`, `load`, `generator`, `acline`, `transformer`
- `identifier` (object, required): Element identifier. See `element-types.md` for identifier requirements.
- `data` (object, required): Updated element data. See `element-types.md` for valid fields.

**Identifier Examples:**
- Bus: `{ibus: 1}`
- Load: `{ibus: 1, loadid: "1"}`
- Generator: `{ibus: 1, machid: "1"}`
- AC Line: `{ibus: 1, jbus: 2, ckt: "1"}`
- Transformer: `{ibus: 1, jbus: 2, k: 0, ckt: "1"}`

**Data Examples:**
- Bus: `{baskv: 150, name: "BUS 1", vm: 1.05}`
- Load: `{pl: 100.0, ql: 50.0}`
- Generator: `{pg: 200.0, qg: 100.0, vs: 1.0}`
- AC Line: `{r: 0.01, x: 0.05, b: 0.001}`
- Transformer: `{r12: 0.01, x12: 0.1}`

## deleteElement

Delete a network element from the power grid.

**IMPORTANT:** The `identifier` parameter MUST be an object with specific keys, NOT just a number.

**Parameters:**
- `elementType` (string, required): Type of element to delete. Must be one of: `bus`, `load`, `generator`, `acline`, `transformer`
- `identifier` (object, required): Element identifier. See `element-types.md` for identifier requirements.

**Example:**
```json
{
  "elementType": "bus",
  "identifier": {
    "ibus": 1
  }
}
```

