# SDK Usage Documentation

This directory contains documentation for the SDK functions available to the AI assistant.

## Overview

The MCP server provides access to a set of SDK functions that allow the AI to interact with the power flow analysis system. These functions are defined in `src/sdkFunctions.ts` and are converted to OpenAI tool definitions.

## Function Categories

### Session Management
- `createSessionFromFile` - Create a new session from an existing file
- `getSessionInfo` - Get information about the current session
- `saveSessionToUserFile` - Save session changes back to the user file
- `saveSessionAsUserFile` - Save session as a new file with a different name

### File Management
- `uploadUserFile` - Upload a power flow data file
- `getUserFiles` - Get list of available files for the user

### Network Operations
- `getNetwork` - Get network data (buses, loads, generators, lines, transformers)
- `addElement` - Add a new network element
- `modifyElement` - Modify an existing network element
- `deleteElement` - Delete a network element

### Analysis
- `solveFlow` - Solve power flow calculations (dc, fnsl, fdns) - returns status only
- `getPowerFlowData` - Get power flow calculation results (with optional filtering)
- `findShortestPath` - Find the path with the fewest buses between two buses in the in-service network
- `findNeighbourElements` - Find all in-service elements within N bus-levels of an origin bus

## Documentation Files

- `session-management.md` - Session and file management functions
- `network-operations.md` - Network element operations
- `analysis.md` - Power flow calculation functions
- `element-types.md` - Detailed information about element types and their fields

