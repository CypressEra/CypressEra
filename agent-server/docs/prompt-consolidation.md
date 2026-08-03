# Prompt Consolidation - Architecture Improvement

## Overview

This document describes the consolidation of system prompts from `src/features/chat/prompts/system.ts` into the Brain module (`src/modules/brain/prompts/coordinator.ts`), following commercial-grade product practices.

## Problem Statement

The project had two separate prompt systems:
1. **Brain module** (`coordinator.ts` + `powerflow.ts`) - Advanced orchestration with execution flow
2. **MCP Server fallback** (`system.ts`) - Basic prompt with detailed anti-patterns

This led to:
- **Duplication**: Similar guidance scattered across multiple files
- **Inconsistency**: Brain module (primary path) lacked detailed efficiency rules
- **Maintenance burden**: Updates needed in multiple places
- **Confusion**: Which prompt is actually used?

## Architecture Analysis

### Current Execution Flow

```
ChatController
├─ Brain ENABLED (production) → BrainEngine
│   └─ buildBrainSystemPrompt()
│       ├─ coordinator.ts (execution flow, anti-patterns, error handling)
│       └─ powerflow.ts (domain knowledge, violation fixes)
│
└─ Brain DISABLED (fallback) → buildSystemPrompt()
    └─ system.ts (minimal fallback prompt)
```

### Key Insight

- **Brain is the primary execution path** - All production requests route through BrainEngine
- **system.ts is fallback only** - Only used when Brain module is disabled
- **Detailed guidance should be in Brain** - Where it's actually used

## Changes Made

### 1. Enhanced `coordinator.ts` (Primary Prompt)

#### Section 1: Your Role
- ✅ Added "Communication Style" subsection
- ✅ Included paragraph formatting guidance
- ✅ Emphasized user-friendly explanations

#### Section 3: Execution Model
- ✅ Added "Anti-Patterns and Efficiency Rules" subsection
- ✅ Integrated 5 critical anti-repetition rules:
  1. No repeated getNetwork calls
  2. No repeated getUserFiles/createSessionFromFile
  3. **Avoid redundant case loading** (new requirement)
  4. No repeated solveFlow/getPowerFlowData
  5. No repeated confirmation requests
- ✅ Added "Tool Workflow Patterns" with concrete examples
- ✅ Included getNetwork + modifyElement workflow

#### Section 4: Task Workflow
- ✅ Enhanced "Handling Tool Failures" with error handling protocol
- ✅ Added "Tool Result Signals" subsection
- ✅ Clarified when to stop vs continue tool execution

### 2. Simplified `system.ts` (Fallback Prompt)

- ✅ Marked as **DEPRECATED** with clear documentation
- ✅ Removed detailed guidance (now in coordinator.ts)
- ✅ Kept minimal fallback functionality
- ✅ Added note recommending Brain module for production

### 3. Updated `powerflow.ts` (Domain Knowledge)

- ✅ Added "Avoid redundant case loading" tip
- ✅ Maintained domain-specific guidance

## Benefits

### 1. **Single Source of Truth**
- All execution guidance centralized in Brain module
- No more scattered rules across multiple files

### 2. **Better Production Quality**
- Primary execution path (Brain) now has complete guidance
- Anti-patterns prevent common AI mistakes
- Error handling ensures robustness

### 3. **Easier Maintenance**
- Update once in coordinator.ts → affects all production requests
- Clear separation: Brain (production) vs fallback (emergency)

### 4. **Commercial-Grade Structure**
```
Production Path (99% of requests)
└─ Brain Module
    ├─ coordinator.ts: Execution flow, anti-patterns, error handling
    └─ powerflow.ts: Domain knowledge, violation fixes

Fallback Path (Brain disabled)
└─ system.ts: Minimal prompt for basic functionality
```

## Anti-Patterns Integrated

### Critical Rule: Avoid Redundant Case Loading

**Problem:** AI sometimes reloads already-loaded cases, wasting time and losing modifications.

**Solution:** 
```typescript
// Before calling createSessionFromFile
if (uncertain whether case is loaded) {
  call getSessionInfo first to check
}
if (case already loaded) {
  do NOT reload
}
```

**Added to:**
- ✅ `coordinator.ts` Section 3 (Anti-Patterns rule #3)
- ✅ `powerflow.ts` Tool Phase Mapping table
- ✅ `system.ts` (before deprecation)

### Other Anti-Patterns

1. **No repeated getNetwork** - Call once, use result immediately
2. **No repeated getUserFiles/createSessionFromFile** - Use context when available
3. **No repeated solveFlow/getPowerFlowData** - Respond with summary after success
4. **No repeated confirmations** - Proceed unless ambiguous

## Testing Recommendations

### 1. Verify Brain Path
```bash
# Enable Brain module
# Test that AI checks session state before loading cases
# Test that AI doesn't reload already-loaded cases
```

### 2. Verify Fallback Path
```bash
# Disable Brain module
# Verify basic functionality still works
# Verify deprecation warning is clear
```

### 3. Integration Tests
```typescript
// Test case loading behavior
describe('Case Loading', () => {
  it('should check session state before loading', async () => {
    // AI should call getSessionInfo first
  });
  
  it('should not reload already-loaded case', async () => {
    // AI should skip createSessionFromFile if case exists
  });
});
```

## Migration Guide

### For Developers

**Before:**
- Guidance scattered across `system.ts` and `coordinator.ts`
- Unclear which prompt is used
- Updates needed in multiple places

**After:**
- **Update `coordinator.ts`** for execution guidance
- **Update `powerflow.ts`** for domain knowledge
- **Keep `system.ts` minimal** as fallback only

### For Deployment

**Production:**
```typescript
// Ensure Brain module is enabled
const brain = new BrainEngine(llmClient, config);
const chatController = new ChatController(openaiClient, retrievalService, config, brain);
```

**Development/Fallback:**
```typescript
// Brain disabled - uses system.ts fallback
const chatController = new ChatController(openaiClient, retrievalService, config);
```

## Future Improvements

1. **Metrics**: Track Brain vs fallback usage
2. **Monitoring**: Alert if fallback is used in production
3. **Documentation**: Add architecture decision record (ADR)
4. **Testing**: Add integration tests for prompt behavior

## Conclusion

This consolidation follows commercial-grade practices:
- ✅ **Single source of truth** for production prompts
- ✅ **Clear separation** between production and fallback
- ✅ **Comprehensive guidance** in the primary execution path
- ✅ **Minimal maintenance burden** with centralized updates
- ✅ **Professional documentation** for team alignment

The result is a more maintainable, reliable, and production-ready prompt system.
