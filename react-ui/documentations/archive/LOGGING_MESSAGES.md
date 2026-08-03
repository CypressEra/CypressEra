# XFlow SDK - Contextual Log Messages

## Overview

The XFlow SDK now logs **meaningful, user-friendly messages** at the SDK action level instead of raw HTTP requests. This provides better context and understanding of what's happening in your application.

---

## 📁 File Operations

### Upload File
```javascript
PowerFlowApp.uploadUserFile(file);
```

**Logs:**
- `→ Uploading file: example.rawx` (info)
- `✓ Successfully uploaded file: example.rawx` (success)
- `✗ Failed to upload file: example.rawx` (error - on failure)

---

### Open File (Create Session from File)
```javascript
PowerFlowApp.createSessionFromFile('example.rawx');
```

**Logs:**
- `→ Opening file: example.rawx` (info)
- `✓ Successfully opened file: example.rawx` (success)
- `✗ Failed to open file: example.rawx` (error - on failure)

---

### Save File
```javascript
PowerFlowApp.saveSessionToUserFile();
```

**Logs:**
- `→ Saving file...` (info)
- `✓ File saved successfully` (success)
- `✗ Failed to save file` (error - on failure)

---

### Delete File
```javascript
PowerFlowApp.deleteUserFile('example.rawx');
```

**Logs:**
- `→ Deleting file: example.rawx` (info)
- `✓ Successfully deleted file: example.rawx` (success)
- `✗ Failed to delete file: example.rawx` (error - on failure)

---

## ⚡ Calculation Operations

### DC Power Flow
```javascript
PowerFlowApp.calculate('dc');
```

**Logs:**
- `→ Starting DC Power Flow calculation...` (info)
- `✓ DC Power Flow completed successfully (5 iterations)` (success - if converged)
- `⚠ DC Power Flow completed but did not converge (100 iterations)` (warning - if not converged)
- `✗ DC Power Flow calculation failed` (error - on failure)

---

### AC Power Flow
```javascript
PowerFlowApp.calculate('ac');
```

**Logs:**
- `→ Starting AC Power Flow calculation...` (info)
- `✓ AC Power Flow completed successfully (8 iterations)` (success - if converged)
- `⚠ AC Power Flow completed but did not converge (100 iterations)` (warning - if not converged)
- `✗ AC Power Flow calculation failed` (error - on failure)

---

### Fast Decoupled Power Flow
```javascript
PowerFlowApp.calculate('fast_decoupled');
```

**Logs:**
- `→ Starting Fast Decoupled Power Flow calculation...` (info)
- `✓ Fast Decoupled Power Flow completed successfully (3 iterations)` (success)
- `⚠ Fast Decoupled Power Flow completed but did not converge (100 iterations)` (warning)
- `✗ Fast Decoupled Power Flow calculation failed` (error - on failure)

---

### Batch Calculation
```javascript
PowerFlowApp.batchCalculate(['dc', 'ac']);
```

**Logs:**
- `→ Starting batch calculation with 2 methods...` (info)
- `✓ Batch calculation completed successfully` (success)
- `✗ Batch calculation failed` (error - on failure)

---

## 🌐 Network Operations

### Load Network Data
```javascript
PowerFlowApp.getNetwork();
```

**Logs:**
- `→ Loading network data...` (info)
- `✓ Network data loaded successfully` (success)
- `✗ Failed to load network data` (error - on failure)

---

## ✏️ Edit Operations

### Add Element
```javascript
PowerFlowApp.addElement('bus', busData);
```

**Logs:**
- `→ Adding bus...` (info)
- `✓ Successfully added bus` (success)
- `✗ Failed to add bus` (error - on failure)

---

### Modify Element
```javascript
PowerFlowApp.modifyElement('bus', busId, newData);
```

**Logs:**
- `→ Modifying bus...` (info)
- `✓ Successfully modified bus` (success)
- `✗ Failed to modify bus` (error - on failure)

---

### Delete Element
```javascript
PowerFlowApp.deleteElement('acline', lineId);
```

**Logs:**
- `→ Deleting acline...` (info)
- `✓ Successfully deleted acline` (success)
- `✗ Failed to delete acline` (error - on failure)

---

## 🔄 Session Operations

### Clear Session
```javascript
PowerFlowApp.clearSession();
```

**Logs:**
- `→ Clearing session...` (info)
- `✓ Session cleared` (success)

---

### Reset SDK
```javascript
PowerFlowApp.reset();
```

**Logs:**
- `→ Resetting SDK...` (info)
- `✓ SDK reset complete` (success)

---

## 🚀 Convenience Methods

### Upload and Calculate
```javascript
PowerFlowApp.uploadAndCalculate(file, 'dc');
```

**Logs:**
- `→ Starting complete workflow for example.rawx...` (info)
- `→ Uploading file: example.rawx` (info)
- `✓ Successfully uploaded file: example.rawx` (success)
- `→ Opening file: example.rawx` (info)
- `✓ Successfully opened file: example.rawx` (success)
- `→ Starting DC Power Flow calculation...` (info)
- `✓ DC Power Flow completed successfully (5 iterations)` (success)
- `✓ Workflow completed successfully for example.rawx` (success)
- `✗ Workflow failed for example.rawx` (error - on any failure)

---

## 🎬 System Events

### SDK Initialization
```javascript
PowerFlowApp.initialize({ userId: 'user123', apiBaseURL: 'http://localhost:8080' });
```

**Logs:**
- `✓ SDK initialized successfully` (success)
- `→ Connected to backend: http://localhost:8080` (info)

---

## 📝 Example Workflow

Here's what a typical workflow looks like in the logs:

```
✓ SDK initialized successfully
→ Connected to backend: http://localhost:8080
→ Uploading file: case9.rawx
✓ Successfully uploaded file: case9.rawx
→ Opening file: case9.rawx
✓ Successfully opened file: case9.rawx
→ Loading network data...
✓ Network data loaded successfully
→ Starting DC Power Flow calculation...
✓ DC Power Flow completed successfully (4 iterations)
→ Saving file...
✓ File saved successfully
```

---

## 🎨 Log Format

Each log entry includes:

| Field | Description | Example |
|-------|-------------|---------|
| **Timestamp** | When the log occurred | `14:30:45` |
| **Icon** | Visual indicator | `→` `✓` `⚠` `✗` |
| **Level** | info, success, warning, error | `info` |
| **Message** | Contextual description | `Successfully uploaded file: case9.rawx` |

---

## 💡 Custom Logging

You can also add your own custom logs:

```javascript
PowerFlowApp.log('Starting custom analysis...', 'info');
PowerFlowApp.log('Custom step 1 complete', 'success');
PowerFlowApp.log('Warning: High voltage detected', 'warning');
PowerFlowApp.log('Custom analysis failed', 'error');
```

---

## 🎯 Benefits

✅ **User-Friendly** - Clear, understandable messages  
✅ **Contextual** - Know exactly what action is happening  
✅ **Detailed** - Includes filenames, element types, iterations, etc.  
✅ **Status Aware** - Shows success, warnings, and errors  
✅ **Progress Tracking** - Follow multi-step workflows  
✅ **Professional** - Ready for production use  

---

## 📚 See Also

- **[LOGGING_QUICK_REFERENCE.md](./LOGGING_QUICK_REFERENCE.md)** - Quick reference
- **[LOGGING_GUIDE.md](./LOGGING_GUIDE.md)** - Complete guide
- **[LOGGING_IMPLEMENTATION.md](./LOGGING_IMPLEMENTATION.md)** - Technical details

---

**All logs are automatically displayed in the CommandLogger component in real-time!** 🎉

