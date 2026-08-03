/**
 * SDK Function Definitions for OpenAI Function Calling
 * 
 * These functions represent the available SDK methods that can be called
 * from the frontend. OpenAI will use these definitions to determine when
 * and how to call SDK functions.
 */

import { SDKFunction } from '../core/types/index.js';

export const sdkFunctions: SDKFunction[] = [
  {
    name: 'getNetwork',
    description: `Get element data from the network (buses, loads, generators, lines, transformers). elementType is required—always pass it; do NOT fetch the whole network.

⚠️ Do NOT use this for path or topology queries:
- "shortest path between buses" → use findShortestPath
- "elements near a bus" / "neighbours" / "within N buses" → use findNeighbourElements

For one specific element also pass identifier (keys from getElementSchema(elementType).identifierKeys). Without identifier you get all elements of that type. Call getElementSchema(elementType) first for identifier keys.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        },
        elementType: {
          type: 'string',
          enum: ['bus', 'load', 'generator', 'acline', 'transformer'],
          description: 'Required. Element type to get (bus, load, generator, acline, transformer). Always pass this—do not get the whole network without a type.'
        },
        identifier: {
          type: 'object',
          description: 'Required when querying one specific element. Keys come from getElementSchema(elementType).identifierKeys.'
        }
      },
      required: ['elementType'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'getElementSchema',
    description: `Get the schema for an element type. Returns:
- identifierKeys: keys needed to identify an element (for getNetwork/modifyElement/deleteElement)
- dataKeys: keys for element data (for modifyElement/addElement)
- defaultValues: sensible default values for creating new elements (use these for addElement)
- description, keyDescriptions, exampleIdentifier, exampleData

ALWAYS call this BEFORE addElement, modifyElement, deleteElement, or getNetwork (with identifier).`,
    parameters: {
      type: 'object',
      properties: {
        elementType: {
          type: 'string',
          enum: ['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'],
          description: 'The element type to get the schema for.'
        }
      },
      required: ['elementType'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'solveFlow',
    description: 'Solve power flow calculation using the dc, fnsl, or fdns method. Returns only success status (success, converged, method, session_id, message). Does NOT return full results. Use getPowerFlowData() to retrieve the actual calculation results.',
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['dc', 'fnsl', 'fdns'],
          description: 'Power flow method: "dc" (linear DC), "fnsl" (full Newton), or "fdns" (fast-decoupled Newton). Default: "fnsl".'
        },
        area_interchange_adjustment: {
          type: 'string',
          enum: ['disabled', 'tie_lines_only', 'tie_lines_and_loads'],
          description: 'Optional. AC area-interchange control mode: adjusts each area\'s swing generator to meet its scheduled net interchange. Omit to use the server default ("disabled"). Only applies to non-DC methods ("fnsl", "fdns").'
        }
      },
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'getPowerFlowData',
    description: `Get power flow calculation results. Must call solveFlow() first.

Returns:
- bus_results: Voltage magnitude (vm in pu), voltage angle (va in degrees), net injections for each bus
- generator_results: Active (pg) and reactive (qg) power generation for each generator
- acline_results: Power flows (p_flow, q_flow), losses (p_loss, q_loss), loading for each AC line
- transformer_results: Power flows and losses for each transformer
- system_summary: Total generation, load, losses, convergence status

Voltage information is in bus_results:
- vm: Voltage magnitude in per-unit (pu). For DC power flow, this is always 1.0
- va: Voltage angle in degrees

Can optionally filter by bus numbers or branches.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        },
        busNumbers: {
          type: 'array',
          items: {
            type: 'number'
          },
          description: 'Optional array of bus numbers to filter results. If empty or omitted, returns all buses.'
        },
        branches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from_bus: {
                type: 'number',
                description: 'From bus number'
              },
              to_bus: {
                type: 'number',
                description: 'To bus number'
              },
              id: {
                type: 'string',
                description: 'Optional branch ID. If provided, must match exactly. If omitted, matches by bus pair only (order doesn\'t matter).'
              }
            },
            required: ['from_bus', 'to_bus'],
            additionalProperties: false
          },
          description: 'Optional array of branch filters. Each filter specifies from_bus, to_bus, and optionally id. If empty or omitted, returns all branches.'
        }
      },
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'getSessionInfo',
    description: 'Get detailed information about the current session, including session ID, user ID, status, file path, creation timestamp, and other session metadata.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        }
      },
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'createSessionFromFile',
    description: 'Create a new session from an existing user file. Opens a power flow data file (e.g., .rawx files) and creates a session.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Name of the file to open (e.g., "test.rawx", "network_case2.rawx"). MUST be a file with file type "model" (power flow data files). Files with file type "knowledge" are NOT supported.'
        }
      },
      required: ['fileName'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'uploadUserFile',
    description: 'Upload a power flow data file to the user folder. The file will be stored in the specified folder type and can be used to create sessions. Note: This function is typically called from the frontend with a File object. For MCP usage, file upload may need to be handled differently.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Name of the file being uploaded'
        },
        fileContent: {
          type: 'string',
          description: 'Base64 encoded file content or file path'
        },
        fileType: {
          type: 'string',
          enum: ['model', 'knowledge', 'sub', 'mon', 'con'],
          description: 'Type of folder to upload to. "model" for power flow data files (.rawx), "knowledge" for documentation (.pdf), "sub"/"mon"/"con" for PSS/E study files. Default is "model".'
        }
      },
      required: ['fileName'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'getUserFiles',
    description: `Get the list of files available for the current user, filtered by file type.

File type vocabulary:
- "model" — network case files (e.g. .rawx). Used with createSessionFromFile.
- "knowledge" — documentation files (e.g. .pdf). Used by the knowledge base.
- "sub" — PSS/E subsystem definition files (.sub).
- "mon" — PSS/E monitored-elements files (.mon).
- "con" — PSS/E contingency definition files (.con). REQUIRED for ACCC.

Call only when the user explicitly asks to list files, OR when you need to find a study file (e.g. a .con before starting ACCC). Do not call repeatedly as a routine pre-step.`,
    parameters: {
      type: 'object',
      properties: {
        fileType: {
          type: 'string',
          enum: ['model', 'knowledge', 'sub', 'mon', 'con'],
          description: 'Type of files to retrieve. Defaults to "model".'
        }
      },
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'deleteUserFile',
    description: 'Delete a file from the user library. Use only when the user explicitly asks to delete a file. Works across all file-type folders (model, knowledge, sub, mon, con). The file is removed from disk; there is no undo.',
    parameters: {
      type: 'object',
      properties: {
        fileType: {
          type: 'string',
          enum: ['model', 'knowledge', 'sub', 'mon', 'con'],
          description: 'Which folder the file lives in.'
        },
        fileName: {
          type: 'string',
          description: 'Exact file name to delete (e.g. "scenario1.con").'
        }
      },
      required: ['fileType', 'fileName'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'loadStudyFile',
    description: `Load a PSS/E study file (.sub / .mon / .con) from the user's library into the current session. This must be done before starting ACCC if the session's contingency / monitor / subsystem slot is empty.

Returns the api-server's validation diagnostics inline — check the response for has_files / has_model / errors / warnings to confirm the file is usable.

Typical workflow when ACCC fails with "contingency_not_ready":
1. Call getUserFiles(fileType: 'con') to list available .con files.
2. If exactly one is appropriate, call loadStudyFile(fileType: 'con', fileName: '...').
3. Retry startContingencyAnalysis.
4. If multiple .con files exist, ask the user which one to load — don't guess.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        },
        fileType: {
          type: 'string',
          enum: ['sub', 'mon', 'con'],
          description: 'Which study-file slot to load: "sub" subsystem, "mon" monitored elements, "con" contingencies.'
        },
        fileName: {
          type: 'string',
          description: 'Name of the file from the user library (e.g. "scenario1.con").'
        }
      },
      required: ['fileType', 'fileName'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'validateStudyFiles',
    description: 'Parse and validate the study files (.sub / .mon / .con) currently loaded into the session. Returns diagnostics with has_files / has_model / errors / warnings. Call this if a previous load reported warnings, or if you want to confirm the session is ready for ACCC. loadStudyFile already runs validation inline, so calling this immediately after a load is usually redundant.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        }
      },
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'addElement',
    description: `Add a NEW network element.

⚠️ CRITICAL: The 'data' parameter is REQUIRED. Without it, the call will FAIL.

⚠️ Use this ONLY for elements that DO NOT EXIST in the network.
⚠️ Use modifyElement() for elements that ALREADY EXIST.

📝 AUTO-GENERATED IDs: The following ID fields are OPTIONAL and will be auto-generated if not provided:
- load: loadid (auto-assigned as next available number on the bus)
- generator: machid (auto-assigned as next available number on the bus)
- acline: ckt (auto-assigned as next available number for the bus pair)
- transformer: ckt (auto-assigned as next available number for the bus set)
- fixshunt: shntid (auto-assigned as next available number on the bus)
- swshunt: shntid (auto-assigned as next available number on the bus)

You can omit these ID fields and the system will automatically assign an available ID.

NEVER call addElement with only elementType. The data parameter is MANDATORY.`,
    parameters: {
      type: 'object',
      properties: {
        elementType: {
          type: 'string',
          enum: ['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'],
          description: 'Type of element to add.'
        },
        data: {
          type: 'object',
          description: `MANDATORY - This parameter is REQUIRED and cannot be omitted.
Contains identifier keys from getElementSchema(elementType).identifierKeys plus any data keys.

NOTE: ID fields like loadid, machid, ckt, shntid are OPTIONAL - they will be auto-generated if omitted.

Examples:
- acline: { "ibus": 107, "jbus": 215, "rpu": 0.01, "xpu": 0.1, "stat": 1 }  // ckt auto-generated
- load: { "ibus": 101, "pl": 100, "ql": 50, "stat": 1 }  // loadid auto-generated
- generator: { "ibus": 101, "pg": 200, "qg": 50, "stat": 1 }  // machid auto-generated
- bus: { "ibus": 999, "baskv": 230, "ide": 1 }`
        }
      },
      required: ['elementType', 'data'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'modifyElement',
    description: `Modify an EXISTING network element.

⚠️ CRITICAL: You MUST call getElementSchema(elementType) FIRST to get identifierKeys and dataKeys.

⚠️ Use this ONLY for elements that ALREADY EXIST in the network.
⚠️ Use addElement() for NEW elements that don't exist yet.

⚠️ IMPORTANT: ALL identifier fields are REQUIRED for modify operations.
Unlike addElement, ID fields (loadid, machid, ckt, shntid) CANNOT be auto-generated.
You MUST provide the complete identifier to specify which element to modify.

WHEN TO USE:
- modifyElement: Element already exists, you want to change some values (e.g., change load's pl from 100 to 150)
- addElement: Element does NOT exist, you want to create it (e.g., add a new load to a bus)

WORKFLOW:
1. Call getElementSchema(elementType) to get identifierKeys and dataKeys
2. Verify the element exists using getNetwork(elementType, identifier)
3. Pass elementType, identifier (ALL keys from identifierKeys), and data (only keys to change)

Example: Change existing load's power from 100MW to 150MW
1. getElementSchema('load') → identifierKeys: ['ibus', 'loadid']
2. getNetwork('load', {ibus: 107, loadid: '1'}) → verify it exists
3. modifyElement(elementType='load', identifier={ibus: 107, loadid: '1'}, data={pl: 150})`,
    parameters: {
      type: 'object',
      properties: {
        elementType: {
          type: 'string',
          enum: ['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'],
          description: 'Type of element to modify.'
        },
        identifier: {
          type: 'object',
          description: `Identifier object with ALL keys from getElementSchema(elementType).identifierKeys.
⚠️ ALL identifier fields are REQUIRED - including loadid, machid, ckt, shntid.`
        },
        data: {
          type: 'object',
          description: 'Only the keys to change. Keys from getElementSchema(elementType).dataKeys.'
        }
      },
      required: ['elementType', 'identifier', 'data'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'deleteElement',
    description: `Delete an EXISTING network element.

⚠️ CRITICAL: You MUST call getElementSchema(elementType) FIRST to get identifierKeys.

⚠️ Use this ONLY for elements that ALREADY EXIST in the network.

⚠️ IMPORTANT: ALL identifier fields are REQUIRED for delete operations.
Unlike addElement, ID fields (loadid, machid, ckt, shntid) CANNOT be auto-generated.
You MUST provide the complete identifier to specify which element to delete.

WORKFLOW:
1. Call getElementSchema(elementType) to get identifierKeys
2. Verify the element exists using getNetwork(elementType, identifier)
3. Pass elementType and identifier (ALL keys from identifierKeys)

Example: Delete a load
1. getElementSchema('load') → identifierKeys: ['ibus', 'loadid']
2. getNetwork('load', {ibus: 107, loadid: '1'}) → verify it exists
3. deleteElement(elementType='load', identifier={ibus: 107, loadid: '1'})`,
    parameters: {
      type: 'object',
      properties: {
        elementType: {
          type: 'string',
          enum: ['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'],
          description: 'Type of element to delete.'
        },
        identifier: {
          type: 'object',
          description: `Identifier object with ALL keys from getElementSchema(elementType).identifierKeys.
⚠️ ALL identifier fields are REQUIRED - including loadid, machid, ckt, shntid.`
        }
      },
      required: ['elementType', 'identifier'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'findShortestPath',
    description: `Find the shortest path (fewest buses away) between two buses in the in-service network topology.

⚡ Use this tool whenever the user asks about:
- "shortest path between bus X and bus Y"
- "route from bus X to bus Y"
- "how many buses away is X from Y" or "bus distance"
- "path through the network"

Do NOT use getNetwork for this — getNetwork returns raw element lists, not paths.

Returns { found: true, path: [busId, ...] } with both endpoints included in order, or { found: false } when buses are in disconnected islands.`,
    parameters: {
      type: 'object',
      properties: {
        fromBus: {
          type: 'number',
          description: 'Starting bus number (integer).'
        },
        toBus: {
          type: 'number',
          description: 'Target bus number (integer).'
        },
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        }
      },
      required: ['fromBus', 'toBus'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'findNeighbourElements',
    description: `Find all in-service network elements within N buses of an origin bus.

Returns an array of elements, each annotated with:
- type: element type string (Bus, AcLine, Transformer, Generator, Load, FixShunt, SwitchedShunt, TwoTermDc, VscDc)
- buses_away: number of buses away the closest terminal bus is from the origin
- closest_terminal_bus: the terminal bus ID used for the buses_away calculation
- all element data fields (e.g. ibus, jbus, pg, pl, stat, etc.)

Branch elements (AcLine, Transformer, TwoTermDc, VscDc) are included if any terminal bus is within n buses of the origin.
The origin bus itself (0 buses away) and all its attached elements are always included.

Use this for neighbourhood analysis: "what generators are within 2 buses of bus 101?".`,
    parameters: {
      type: 'object',
      properties: {
        originBus: {
          type: 'number',
          description: 'Origin bus number (integer).'
        },
        n: {
          type: 'number',
          description: 'Number of bus-levels to search (integer, 1–99).'
        },
        elementTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['Bus', 'AcLine', 'Transformer', 'Generator', 'Load', 'FixShunt', 'SwitchedShunt', 'TwoTermDc', 'VscDc']
          },
          description: 'Optional filter. When omitted or empty, all nine element types are returned.'
        },
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        }
      },
      required: ['originBus', 'n'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'saveSessionToUserFile',
    description: 'Save the current session working file back to the original user file in the model folder. Persists any changes made to the network data (additions, modifications, deletions) to the file from which the session was created.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        }
      },
      required: [],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'saveSessionAsUserFile',
    description: 'Save the current session working file as a new user file with a different name. Creates a new file in the model folder, copies the session temp file to the new location, renames the session temp file to match the new name, and updates the session mapping. This is useful when you want to save changes without overwriting the original file.',
    parameters: {
      type: 'object',
      properties: {
        newFileName: {
          type: 'string',
          description: 'Name for the new file (e.g., "modified_network.rawx", "backup_case.rawx"). Must include the file extension.'
        },
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        }
      },
      required: ['newFileName'],
      additionalProperties: false
    },
    strict: true
  },

  // ===========================================
  // CONTINGENCY ANALYSIS (async / long-running)
  // ===========================================

  {
    name: 'startContingencyAnalysis',
    description: `Start an AC Contingency Calculation (ACCC) run. Returns IMMEDIATELY with a jobId — the actual run takes minutes and proceeds in the background.

⚠️ ASYNC SEMANTICS — read carefully:
- This returns within milliseconds. The "result" is just a jobId and starting state.
- After calling this, call getContingencyJobStatus EXACTLY ONCE to read the initial state. This single follow-up check catches the case where a small ACCC finishes during the chat round, and gives the user a useful first progress reading.
- Then branch based on the status result:
  • state == "completed" → call getContingencyReport, summarize for the user, end the turn.
  • state == "failed" or "cancelled" → tell the user what happened, end the turn.
  • state == "running" or "queued" → tell the user the jobId and current progress fraction (e.g. "Started ACCC — job abc-123, currently at 0%. Message me again to check progress."), then END THE TURN. Do NOT poll again in this turn — the brain will refuse a second status call with errorCode "already_polled_this_turn".

Required:
- The session must have a network model loaded AND all three study files (.sub, .mon, .con) loaded into their respective slots. ACCC will not start if any of those slots is empty.

Common error responses (surfaced in data.errorCode):
- "analysis_in_progress" (409) — a job is already running for this session. Ask the user whether to cancel the running one first.
- "study_files_missing" (400) — one or more of .sub / .mon / .con is NOT loaded. The error message (in the tool result's "error" field) contains a substring of the form "Missing: <kinds>." where <kinds> is a comma-separated list drawn from {sub, mon, con} in canonical order. For each named kind: call getUserFiles(fileType: <kind>) to list candidates, then loadStudyFile(fileType: <kind>, fileName: ...) — asking the user if multiple files are available for the same kind. After all missing kinds are loaded, retry startContingencyAnalysis.
- "contingency_not_ready" (400) — the prerequisites OTHER than missing files are not met: typically the .con file is loaded but defines no contingencies, or no network model is loaded. The recovery here is different: tell the user the file/state is bad and offer to upload a different file. Do NOT confuse this with "study_files_missing" — that one means slots are empty; this one means the loaded content is unusable.

Pass-through args:
- settings: object — ACCC settings forwarded to the api-server (e.g. parallel workers, output options). Optional; omit to use server defaults.
- configOverrides: object — power-flow config overrides (tolerance, max_iterations, etc.). Optional.`,
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID. If not provided, uses the current active session.'
        },
        settings: {
          type: 'object',
          description: 'Optional ACCC settings object, passed through to the api-server.',
        },
        configOverrides: {
          type: 'object',
          description: 'Optional power-flow config overrides for the ACCC sub-solves.',
        }
      },
      required: [],
      additionalProperties: true
    },
    strict: false
  },

  {
    name: 'getContingencyJobStatus',
    description: `Check the current state and progress of an ACCC job.

Returns: { jobId, state, progress: { done, total, fraction, violations, detail }, elapsedSeconds, studyResultId? }

State values:
- "queued" / "running": job is still in flight
- "completed": job finished successfully; studyResultId is set and you can call getContingencyReport
- "failed" / "cancelled": job ended without a usable report

⚠️ ONE CALL PER TURN PER JOB:
- If state is "running" or "queued", DO NOT call this tool again in the same turn. Report the progress fraction to the user in plain text (e.g. "Still running — 47% complete (118 of 250 contingencies)") and END THE TURN.
- The brain enforces this: a second call to getContingencyJobStatus for the same jobId in the same turn is intercepted and returns { error: "already_polled_this_turn" } without contacting the server. The user should drive subsequent checks by sending a new message.

Where to find the jobId:
- The jobId came from your earlier startContingencyAnalysis tool result, and you also mentioned it in your reply to the user. Look in the message history.
- If you cannot find the jobId, ask the user to remind you which job to check.`,
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job id returned by startContingencyAnalysis.'
        }
      },
      required: ['jobId'],
      additionalProperties: false
    },
    strict: true
  },

  {
    name: 'getContingencyReport',
    description: `Fetch the full ACCC report for a completed job.

ONLY call this when getContingencyJobStatus has shown state "completed". If you call it earlier the api-server returns 409 with errorCode "job_not_ready"; check status first if unsure.

Returns the parsed report JSON, or a summarized form when the raw report exceeds ~64 KB (with truncated: true and a topContingencies list). When summarized, do not pretend you have details you don't — say so to the user and offer to look up specific contingencies via the study results UI.

After calling this, write a short user-facing summary (e.g. "ACCC finished — job abc-123. 3 of 250 contingencies caused convergence issues, the worst was line 12-15 trip.") rather than dumping the JSON.`,
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job id whose report you want.'
        }
      },
      required: ['jobId'],
      additionalProperties: false
    },
    strict: true
  },

  {
    name: 'cancelContingencyJob',
    description: `Cancel a running ACCC job by id.

Returns { success: true, state: "cancelled" } on a successful cancel. If the job has already finished (completed/failed/cancelled) the tool returns { success: true, alreadyTerminal: true } — that still satisfies the user's intent that the job no longer be running, so just confirm to the user (e.g. "The ACCC was already done — nothing to cancel.").

Call this without first checking status; the api-server handles the terminal-state race for you.`,
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'The job id to cancel.'
        }
      },
      required: ['jobId'],
      additionalProperties: false
    },
    strict: true
  }
];

/**
 * Convert SDK functions to OpenAI tools format
 * OpenAI expects: { type: 'function', function: { name, description, parameters } }
 */
export function getOpenAITools() {
  return sdkFunctions.map(fn => ({
    type: 'function' as const,
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters
    },
    strict: fn.strict
  }));
}

