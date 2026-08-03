# Edit Element API - Input Format Update

## Overview

The edit element functionality has been updated to support the same flexible input format as the solve command, allowing it to work with both RAWX files and network struct data.

## Changes Made

### 1. Rust CLI Changes (`flow-solver/src/handlers/cli.rs`)

**Before:**
```rust
.arg(Arg::with_name("file")
    .short("f")
    .long("file")
    .value_name("PATH")
    .help("Path to RAWX file to modify")
    .takes_value(true)
    .required(true))
```

**After:**
```rust
.arg(Arg::with_name("input")
    .short("i")
    .long("input")
    .value_name("JSON")
    .help("Input format JSON: {\"type\": \"rawx\"|\"structs\", \"rawpath\": \"path\", \"networks\": {...}}")
    .takes_value(true)
    .required(true))
.arg(Arg::with_name("output")
    .short("o")
    .long("output")
    .value_name("PATH")
    .help("Output path for modified network (optional, defaults to input path for rawx type)")
    .takes_value(true))
```

### 2. Rust Handler Changes (`flow-solver/src/handlers/edit_element.rs`)

The handler now:
- Accepts `--input` with JSON format instead of `--file`
- Parses the input JSON to determine the source type (`rawx` or `structs`)
- Loads network data from either a RAWX file or directly from JSON structs
- Supports optional `--output` path (defaults to input file path for RAWX type)

**Input Format:**

**Option 1: RAWX File**
```json
{
  "type": "rawx",
  "rawpath": "/path/to/file.rawx"
}
```

**Option 2: Network Structs**
```json
{
  "type": "structs",
  "networks": {
    "buses": [...],
    "loads": [...],
    "generators": [...],
    "ac_lines": [...],
    "transformers": [...]
  }
}
```

### 3. Go API Service Changes (`api-server/src/services/editor.go`)

The service now constructs the input JSON automatically:

```go
// Create input JSON with rawx file path
input := map[string]interface{}{
    "type":    "rawx",
    "rawpath": req.FilePath,
}
inputJSON, err := json.Marshal(input)
// ...
args := []string{
    "edit",
    "--type", string(req.ElementType),
    "--action", string(req.Action),
    "--input", string(inputJSON),  // Changed from --file
}
```

## Command Line Usage

### Before (Old Format)
```bash
./flow-solver edit \
  --type bus \
  --action add \
  --file /path/to/network.rawx \
  --data '{"ibus": 99999, "name": "NEW BUS", "baskv": 230.0}'
```

### After (New Format)

**Using RAWX file:**
```bash
./flow-solver edit \
  --type bus \
  --action add \
  --input '{"type": "rawx", "rawpath": "/path/to/network.rawx"}' \
  --data '{"ibus": 99999, "name": "NEW BUS", "baskv": 230.0}'
```

**Using network structs:**
```bash
./flow-solver edit \
  --type bus \
  --action add \
  --input '{"type": "structs", "networks": {...}}' \
  --output /path/to/output.rawx \
  --data '{"ibus": 99999, "name": "NEW BUS", "baskv": 230.0}'
```

## API Usage (No Changes Required)

The HTTP API usage **remains the same**. The Go service automatically handles the conversion:

```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id",
    "element_type": "bus",
    "action": "add",
    "data": {
      "ibus": 99999,
      "name": "NEW BUS",
      "baskv": 230.0
    }
  }'
```

The API server internally constructs the proper input JSON format before calling the Rust solver.

## Benefits

1. **Consistency**: Edit command now uses the same input format as solve command
2. **Flexibility**: Can work with either file paths or in-memory network data
3. **Extensibility**: Easy to add new input types in the future
4. **API Compatibility**: No breaking changes to the HTTP API

## Migration Guide

### For Direct CLI Users

If you were using the edit command directly from the command line, update your scripts:

**Old:**
```bash
--file /path/to/file.rawx
```

**New:**
```bash
--input '{"type": "rawx", "rawpath": "/path/to/file.rawx"}'
```

### For HTTP API Users

No changes required! The HTTP API automatically handles the new format internally.

## Testing

Test the new functionality:

```bash
# Test with RAWX file input
cd flow-solver
./target/release/flow-solver edit \
  --type bus \
  --action add \
  --input '{"type": "rawx", "rawpath": "examples/sample.rawx"}' \
  --output examples/sample_modified.rawx \
  --data '{"ibus": 99999, "name": "TEST BUS", "baskv": 230.0, "ide": 1, "vm": 1.0, "va": 0.0}'

# Verify the modification
./target/release/flow-solver parse --file examples/sample_modified.rawx
```

## Files Modified

1. `flow-solver/src/handlers/cli.rs` - CLI argument definitions
2. `flow-solver/src/handlers/edit_element.rs` - Input parsing and processing
3. `api-server/src/services/editor.go` - Go service to construct input JSON

## Build Status

✅ Rust solver: Built successfully
✅ Go API server: Built successfully
✅ All functionality tested and working