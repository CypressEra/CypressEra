# API Server Data Structure

## Overview
The API server organizes data into three main directories, each serving a specific purpose in the workflow.

## Directory Structure

```
api-server/data/
├── models/           # Original uploaded model files
│   ├── demo_user/
│   │   ├── bench.rawx
│   │   ├── ieee_harmonics_test_case.rawx
│   │   ├── test.rawx
│   │   └── working_file.rawx
│   └── test_user/
│       ├── sample.rawx
│       ├── bench.rawx
│       └── ...
├── sessions/         # Active session working files
│   ├── demo_user/
│   │   ├── session_id_1/
│   │   │   └── working_file.rawx
│   │   ├── session_id_2/
│   │   │   └── working_file.rawx
│   │   └── ...
│   └── test_user/
│       └── session_id_3/
│           └── working_file.rawx
└── results/          # Computation results
    ├── demo_user/
    │   ├── session_id_1/
    │   │   └── results.json
    │   └── ...
    └── test_user/
        └── ...
```

## Directory Purposes

### 1. `models/` (formerly `uploads/`)
**Purpose**: Stores the original, uploaded model files for each user.

**Structure**: `models/{user_id}/{model_file}.rawx`

**Characteristics**:
- Contains the pristine uploaded files
- Flat structure (no session subfolders)
- One directory per user
- Files are named as uploaded (e.g., `bench.rawx`, `test.rawx`)

**Usage**:
- When a user uploads a file, it goes here
- These files serve as the base templates for new sessions
- Should not be modified during session operations

### 2. `sessions/`
**Purpose**: Stores working files for active sessions.

**Structure**: `sessions/{user_id}/{session_id}/working_file.rawx`

**Characteristics**:
- Contains session-specific working copies
- Hierarchical structure: user → session → files
- Each session has its own isolated directory
- Only the latest 5 sessions per user are kept (automatic cleanup)

**Usage**:
- When a new session is created, a copy from `models/` is placed here
- All edit operations work on these session files
- If a session is "saved", it can overwrite the corresponding model file
- Old sessions (beyond the latest 5) are automatically deleted

### 3. `results/`
**Purpose**: Stores computation results from the solver.

**Structure**: `results/{user_id}/{session_id}/results.json`

**Characteristics**:
- Contains JSON output from solver operations
- Linked to specific sessions by session_id
- Results persist even after sessions are cleaned up

## Workflow

### Upload Flow
1. User uploads a model file
2. File is stored in `models/{user_id}/{filename}.rawx`
3. File remains as the "master" copy

### Session Creation Flow
1. User creates a new session
2. System copies model from `models/{user_id}/{model}.rawx`
3. Copy is placed in `sessions/{user_id}/{session_id}/working_file.rawx`
4. Session ID is generated (UUID)

### Edit Flow
1. User makes edits during a session
2. Edits are applied to `sessions/{user_id}/{session_id}/working_file.rawx`
3. Original model in `models/` remains unchanged

### Save Flow
1. User decides to save the session changes
2. System overwrites `models/{user_id}/{original_filename}.rawx`
3. Session file becomes the new master

### Solver Flow
1. Solver reads from `sessions/{user_id}/{session_id}/working_file.rawx`
2. Results are written to `results/{user_id}/{session_id}/results.json`

## Cleanup Policy

### Sessions
- **Retention**: Only the latest 5 sessions per user are kept
- **Cleanup**: Automatic deletion of older sessions
- **Criteria**: Based on modification time (newest first)

### Models
- No automatic cleanup
- Files persist unless explicitly deleted by user

### Results
- Results persist independently of sessions
- No automatic cleanup (may be implemented in the future)

## Migration Notes

The recent reorganization made the following changes:
1. Renamed `data/uploads/` → `data/models/`
2. Removed session subfolders from models directory (flattened structure)
3. Eliminated the `src/data/temp/` directory completely
4. Removed the entire `src/data/` directory (including uploads/ and results/)
5. Consolidated all session files into `data/sessions/`
6. Implemented automatic cleanup of old sessions (keep latest 5 per user)

### Before:
```
api-server/
├── data/
│   └── uploads/
│       └── user/
│           └── session_id/  ← session subfolders (messy)
│               └── file.rawx
└── src/
    └── data/
        ├── temp/            ← temporary files (duplicate)
        ├── uploads/         ← duplicate cache
        └── results/
```

### After:
```
api-server/
└── data/
    ├── models/              ← clean, flat structure
    │   └── user/
    │       └── file.rawx
    ├── sessions/            ← organized by user/session
    │   └── user/
    │       └── session_id/
    │           └── working_file.rawx
    └── results/
        └── user/
            └── results.json
```

## Best Practices

1. **Upload**: Always upload to `models/` directory
2. **Session Work**: Never directly modify files in `models/`
3. **Edits**: Always work on session copies in `sessions/`
4. **Save**: Only overwrite models when user explicitly saves
5. **Cleanup**: Run session cleanup periodically to maintain storage

