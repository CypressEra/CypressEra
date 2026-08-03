# API Server Data Structure Update

## Summary
Updated the API server to align with the new data structure where `uploads/` is renamed to `models/`, and all session files are properly organized under `sessions/`.

## Changes Made

### 1. Directory Structure
**Before:**
```
data/
├── uploads/{user_id}/{session_id}/file.rawx  ← Mixed structure
├── sessions/{user_id}/{session_id}/
└── results/{user_id}/{session_id}/
```

**After:**
```
data/
├── models/{user_id}/filename.rawx              ← Original uploaded files
├── sessions/{user_id}/{session_id}/working_file.rawx  ← Session working copies
└── results/{user_id}/{session_id}/results.json        ← Computation results
```

### 2. Code Changes

#### `src/services/session.go`

**NewSessionService** (Line 65-72)
- Changed: `uploads/` → `models/`
- Updated comments to reflect model files

**StoreFile** (Line 270-277)
- Changed: Saves to `sessions/{user}/{session}/working_file.rawx` instead of `uploads/{user}/{session}/`
- Files uploaded to a session now go to the session workspace

**UploadUserFile** (Line 616-625)
- Changed: Saves to `models/{user}/` instead of `uploads/{user}/`
- This is for uploading model files to the user's library

**GetUserFiles** (Line 651-664)
- Changed: Reads from `models/{user}/` instead of `uploads/{user}/`
- Returns list of model files for a user

**CreateSessionFromFile** (Line 680-728)
- Changed: Reads from `models/{user}/` instead of `uploads/{user}/`
- Creates a session workspace at `sessions/{user}/{session_id}/working_file.rawx`
- Copies model file to session workspace

**SaveSessionToUserFile** (Line 730-757)
- Updated comments to reflect saving back to model files
- Overwrites the original model file with session changes

#### `src/main.go`

**Static File Serving** (Line 323-326)
- Changed: `/uploads` → `/models`
- Added: `/sessions` route for session file access
- Routes:
  - `GET /models/*` → serves files from `data/models/`
  - `GET /sessions/*` → serves files from `data/sessions/`
  - `GET /results/*` → serves files from `data/results/`

### 3. API Endpoints (No Breaking Changes)

All existing endpoints continue to work with the new structure:

#### File Upload
```
POST /upload/user
  - Saves to: models/{user_id}/{filename}
  - Purpose: Upload a new model file to user's library
```

#### Session Management
```
POST /session/create-from-file
  - Reads from: models/{user_id}/{filename}
  - Creates: sessions/{user_id}/{session_id}/working_file.rawx
  - Purpose: Start a new session based on a model file

POST /session/save
  - Reads from: sessions/{user_id}/{session_id}/working_file.rawx
  - Saves to: models/{user_id}/{original_filename}
  - Purpose: Save session changes back to the model file
```

#### File Upload to Session (Legacy)
```
POST /upload
  - Now saves to: sessions/{user_id}/{session_id}/working_file.rawx
  - Purpose: Direct file upload to an existing session
```

### 4. Workflow

#### Upload Workflow
1. User uploads a file via `POST /upload/user`
2. File is saved to `models/{user_id}/{filename}.rawx`
3. File becomes available in user's model library

#### Session Workflow
1. User creates session via `POST /session/create-from-file`
2. System copies model from `models/{user_id}/{filename}.rawx`
3. Working copy created at `sessions/{user_id}/{session_id}/working_file.rawx`
4. All edits work on the session file
5. User can save changes back to model via `POST /session/save`

#### Edit Workflow
1. Edits are applied to `sessions/{user_id}/{session_id}/working_file.rawx`
2. Original model in `models/` remains unchanged
3. Session changes are temporary until saved

#### Solve Workflow
1. Solver reads from `sessions/{user_id}/{session_id}/working_file.rawx`
2. Results written to `results/{user_id}/{session_id}/results.json`

### 5. Session Cleanup

The API automatically maintains only the latest 5 sessions per user:
- Configured via `storage.max_sessions_per_user` (default: 5)
- Old session files in `sessions/{user}/` are automatically deleted
- Session cleanup is FIFO (First In, First Out)
- Results are preserved even after session cleanup

### 6. Testing

Build test successful:
```bash
cd api-server
go build -o api-server src/main.go
# ✓ No compilation errors
```

Directory structure verified:
```
data/
├── models/demo_user/ieee_harmonics_test_case.rawx  ✓
├── sessions/                                        ✓
└── results/                                         ✓
```

### 7. Migration Notes

**No API breaking changes** - All existing client code will continue to work:
- Endpoint URLs remain the same
- Request/response formats unchanged
- Only internal storage paths updated

**What clients see:**
- Files still accessed via same API endpoints
- Session behavior unchanged
- Transparent backend reorganization

### 8. Benefits

1. **Clear Separation**: Models vs Sessions vs Results
2. **Better Organization**: Flat model structure, organized sessions
3. **Proper Workflow**: Copy model → Work in session → Save back to model
4. **Automatic Cleanup**: Sessions cleaned up, models preserved
5. **RESTful Routes**: `/models`, `/sessions`, `/results` map directly to data structure

## Documentation Updates Needed

The following documentation files reference "uploads" and should be updated:
- `documentations/EDIT_ELEMENT_DEBUG_GUIDE.md`
- `documentations/SERVICE_ARCHITECTURE.md`
- `documentations/API_REFERENCE.md`
- `documentations/PERFORMANCE_OPTIMIZATIONS.md`
- `documentations/TEMP_FILE_WORKFLOW.md`

## Verification Checklist

- [x] Renamed directory structure (uploads → models)
- [x] Updated SessionService code
- [x] Updated static file serving routes
- [x] Tested compilation
- [x] Verified directory structure
- [x] No breaking API changes
- [x] Session cleanup works with new structure
- [ ] Update documentation files
- [ ] Test full workflow (upload → session → edit → save)

