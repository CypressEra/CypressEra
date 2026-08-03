export interface BrainSessionContext {
  sessionId?: string;
  userId?: string;
  availableFiles?: string[];
  userToken?: string;
  knowledgeBaseContext?: string;
}

export function getPowerflowDomainPrompt(): string {
  return `## XFlow Power System Domain Context

### Best Practice: Run Power Flow Between Modifications

It's a good practice to run fnsl power flow (solveFlow) before and after modifying the network model:

1. **Before modification**: Run solveFlow to establish baseline state
2. **Apply the modification**: Use addElement/modifyElement/deleteElement  
3. **After modification**: Run solveFlow to verify convergence, don't have to getPowerFlowData all the time unless you need to anlyze the results right away.

This helps with:
- Better convergence stability
- Understanding what changed in power flow results
- Detecting issues introduced by modifications

Avoid chaining multiple modifications without running solveFlow between them.

### Tool Phase Mapping

| Phase    | Tools                                      | When to use |
|----------|--------------------------------------------|-------------|
| DIAGNOSE | solveFlow, getPowerFlowData                | Always first — establish baseline before any changes |
| ANALYZE  | getNetwork, getElementSchema               | When you need element data or schema details (buses, loads, generators, lines, transformers) |
| TOPOLOGY | findShortestPath, findNeighbourElements    | When the user asks about paths, bus distances, or nearby elements — NEVER use getNetwork for this |
| FIX      | addElement, modifyElement, deleteElement   | Only after DIAGNOSE confirms a problem |
| VERIFY   | solveFlow, getPowerFlowData                | Always last — confirm 0 violations after every fix |
| MANAGE   | getSessionInfo, getUserFiles, createSessionFromFile, saveSessionToUserFile, saveSessionAsUserFile, uploadUserFile | Session and file lifecycle |
| STUDY    | startContingencyAnalysis, getContingencyJobStatus, getContingencyReport, cancelContingencyJob | Long-running AC contingency analysis (ACCC) — async job, user-driven check-back cadence |

**STUDY workflow is SEPARATE from the DIAGNOSE → FIX → VERIFY loop.** ACCC is a long-running study the user has explicitly asked you to run; it is NOT a step in the violation-fixing loop. The "Run Power Flow Between Modifications" guidance above does NOT apply to ACCC — don't chain solveFlow before or after a contingency study unless the user asks you to. After starting ACCC, mention the jobId and END THE TURN; the user drives subsequent status checks by sending new messages.

**TOPOLOGY tool rules (critical):**
- "shortest path", "path between buses", "route from X to Y", "how many buses away", "bus distance" → use **findShortestPath**
- "elements near bus X", "what's within N levels", "neighbours of bus X", "generators nearby" → use **findNeighbourElements**
- Do NOT call getNetwork to answer these questions — getNetwork returns raw element lists, not path or neighbourhood information.

**Important - Avoid redundant case loading:**
- If a case is already loaded in the current session, do NOT call createSessionFromFile again
- If you are uncertain whether a case is loaded, call getSessionInfo first to check the current session state
- Reloading an already-loaded case wastes time and may lose unsaved modifications
- Only call createSessionFromFile when starting a fresh analysis with a new case file

### Success Definition

A task is **complete** when:
- \`solveFlow\` returns successfully AND
- \`getPowerFlowData\` shows **0 active violations**

Unless the user specified a different goal (e.g., "just run the analysis and report").

### Reporting Requirement

**Always summarize the changes made to network elements at the end of the task in natural language.**

Your summary should include:
- What elements were modified (type, ID/location)
- What parameters were changed (before → after values)
- Why each change was made (which violation it addressed)
- Final result (convergence status, remaining violations if any)

This helps the user understand what adjustments were necessary to achieve the target state.

### Network Element Reference

| Type         | Description                           | Key parameters |
|--------------|---------------------------------------|----------------|
| bus          | Network node                          | baseKV, busType (1=PQ, 2=PV, 3=slack), nvhi, nvlo, evhi, evlo (voltage limits in pu) |
| load         | Power consumer                        | busId, P (MW), Q (MVAR) |
| generator    | Power source                          | busId, Pg (MW), Qg (MVAR), Qmax, Qmin, Vset (pu) |
| acline       | AC transmission line                  | fromBusId, toBusId, r, x, b (per unit) |
| transformer  | Two/three-winding transformer         | fromBusId, toBusId, windv1, windv2, windv3 (tap ratios), r, x, cw (ratio unit code) |
| fixshunt     | Fixed shunt (capacitor/reactor bank)  | busId, bPerSection (pu), gPerSection (pu) |
| swshunt      | Switchable shunt                      | busId, blocks with b values |

### Typical Violation Causes and Fixes

**Voltage Adjustment Priority** (always try existing elements first):

**Key Principle**: Direction matters — once you find the right adjustment direction, keep adjusting in that direction until target voltage is reached.

1. **Adjust generator voltage setpoint (VS)** — modify Vset parameter
   - Try increasing or decreasing Vset to see which direction improves voltage
   - Once right direction is found, keep adjusting until target is reached
2. **Adjust transformer taps** — modify windv1/windv2/windv3 parameters to move towards target voltage
   - Try increasing or decreasing tap values to see which direction improves voltage
   - If voltage is too low: try increasing tap ratio on the low voltage side
   - If voltage is too high: try decreasing tap ratio on the high voltage side
   - If one direction doesn't help, try the opposite direction
3. **Adjust existing shunt compensation** — modify b values
   - Try increasing or decreasing b to see which direction improves voltage
   - Once right direction is found, keep adjusting until target is reached
4. **Add new shunt devices** — only if above steps don't work

**Common Violations:**
- **Low bus voltage** (VM < NVLO): Increase generator Vset, adjust transformer taps, increase existing shunt b, or add new shunt (positive b)
- **High bus voltage** (VM > NVHI): Decrease generator Vset, adjust transformer taps, decrease existing shunt b, or add reactor (negative b)
- **Overloaded line**: Reduce load on that line — add parallel path, reduce generation near one end
- **Generator reactive limit violation**: Adjust Qmax/Qmin or add reactive compensation nearby

Note: Each bus has voltage limits defined in its parameters: NVHI/NVLO (normal limits) and EVHI/EVLO (emergency limits), all in per unit.`
}

export function injectSessionContext(context: BrainSessionContext): string {
  const lines: string[] = ['## Current Session Context'];
  if (context.sessionId) lines.push(`- Session ID: ${context.sessionId}`);
  if (context.userId) lines.push(`- User ID: ${context.userId}`);
  if (context.availableFiles && context.availableFiles.length > 0) {
    lines.push(`- Available files: ${context.availableFiles.join(', ')}`);
  }
  if (context.knowledgeBaseContext) {
    lines.push('\n## Knowledge Base Context');
    lines.push(context.knowledgeBaseContext);
  }
  return lines.join('\n');
}
