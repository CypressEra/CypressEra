# Temporary File Workflow

This document describes the new temporary file workflow that provides better file management and editing capabilities.

## 🔄 **Workflow Overview**

### **1. File Upload**
- User uploads a RAW file
- API server automatically creates a **temporary working copy**
- Original file remains untouched
- Response includes both `file_path` and `temp_file_id`

### **2. File Modification**
- All modifications happen on the **temporary file**
- Original file is never modified directly
- Multiple modifications can be made safely
- Each modification updates the `is_modified` flag

### **3. File Saving**
- User chooses when to save changes
- Two save options:
  - **Overwrite**: Replace original file with temp file
  - **Save As**: Create new file with different name
- Temp file is automatically cleaned up after saving

## 📁 **File Structure**

```
uploads/
├── user_123/
│   └── session_abc/
│       ├── input.raw          ← Original uploaded file
│       └── modified_2bus.raw  ← New file (if "save as")
temp/
├── session_abc_uuid1.raw      ← Temporary working copy
└── session_abc_uuid2.raw      ← Another temp copy
results/
└── user_123/
    └── session_abc/
        └── results.json       ← Calculation results
```

## 🚀 **API Endpoints**

### **Upload File** (Creates Temp File Automatically)
```bash
POST /upload?session_id={session_id}
# Response includes temp_file_id
```

### **Modify File** (Works on Temp File)
```bash
POST /modify
{
  "session_id": "abc-123",
  "temp_file_id": "uuid-456",
  "bus": 2,
  "load": "150,75"
}
```

### **Save File** (Choose Save Action)
```bash
POST /save
{
  "session_id": "abc-123",
  "temp_file_id": "uuid-456",
  "action": "overwrite"  # or "save_as"
}
```

```bash
POST /save
{
  "session_id": "abc-123",
  "temp_file_id": "uuid-456",
  "action": "save_as",
  "new_name": "modified_system.raw"
}
```

### **Calculate Power Flow** (Optional Temp File Usage)
```bash
POST /calculate
{
  "session_id": "abc-123",
  "temp_file_id": "uuid-456",  # Optional: use temp file
  "method": "gauss-seidel"
}
```

## 💡 **Benefits**

✅ **Safe Editing**: Original files are never modified until explicitly saved  
✅ **Multiple Versions**: Can create multiple temp files for different experiments  
✅ **Undo Capability**: Can discard changes by not saving temp files  
✅ **Flexible Saving**: Choose to overwrite or create new files  
✅ **Session Isolation**: Each session has its own temp files  
✅ **Automatic Cleanup**: Temp files are removed after saving or session expiry  

## 🔧 **Implementation Details**

### **Temp File Creation**
- Automatically created after successful file upload
- Unique ID format: `{session_id}_{uuid}.raw`
- Stored in `temp/` directory
- In-memory metadata tracking

### **Modification Process**
- All changes applied to temp file
- Original file path remains unchanged
- Session metadata updated with modification timestamp

### **Save Operations**
- **Overwrite**: `copy(temp_file, original_file)`
- **Save As**: `copy(temp_file, new_path)`
- Temp file cleanup after successful save
- Session status updated appropriately

## 📝 **Example User Workflow**

```
1. Upload file → Get temp_file_id
2. Modify temp file → Change load on bus 2
3. Modify temp file → Change generation on bus 1
4. Run power flow → Use temp file for calculation
5. Save changes → Choose "overwrite" or "save_as"
6. Temp file cleaned up automatically
```

## 🧪 **Testing**

Use the updated `test_api.sh` script to test the complete workflow:

```bash
./test_api.sh
```

This will test:
- File upload with temp file creation
- File modification on temp files
- Power flow calculation with temp files
- Save as new file
- Overwrite original file
- Session management

## 🔒 **Security & Cleanup**

- Temp files are isolated by session
- Automatic cleanup after save operations
- Session expiry triggers temp file cleanup
- File size limits apply to temp files
- Path validation prevents directory traversal 