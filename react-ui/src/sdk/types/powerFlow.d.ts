/**
 * TypeScript type definitions for Power Flow Analysis (flow-solver aligned)
 */

/** Bus result (RAWX field names: ibus, vm, va, net_p_injection, net_q_injection) */
export interface BusResult {
  ibus: number;
  name?: string;
  baskv?: number;
  ide?: number;
  vm: number;
  va: number;
  net_p_injection: number;
  net_q_injection: number;
}

/** Generator result (RAWX: ibus, machid, pg, qg) */
export interface GeneratorResult {
  ibus: number;
  machid?: string;
  pg: number;
  qg: number;
}

/** AC line branch flow (RAWX id: ibus, jbus, ckt + flows/losses) */
export interface AcLineBranchResult {
  ibus: number;
  jbus: number;
  ckt?: string;
  p_flow: number;
  q_flow: number;
  s_flow: number;
  p_loss: number;
  q_loss: number;
  s_loss: number;
}

/** Transformer branch flow (RAWX id: ibus, jbus, kbus, ckt + flows/losses). Winding flows/losses: _1 (ibus), _2 (jbus), _3 (kbus, 3W only). */
export interface TransformerBranchResult {
  ibus: number;
  jbus: number;
  kbus?: number;
  ckt?: string;
  p_flow_1: number;
  p_flow_2?: number;
  p_flow_3?: number;
  q_flow_1: number;
  q_flow_2?: number;
  q_flow_3?: number;
  s_flow_1: number;
  s_flow_2?: number;
  s_flow_3?: number;
  p_loss_1: number;
  p_loss_2?: number;
  p_loss_3?: number;
  q_loss_1: number;
  q_loss_2?: number;
  q_loss_3?: number;
  s_loss_1: number;
  s_loss_2?: number;
  s_loss_3?: number;
}

/** Two-terminal DC line result (RAWX id: ipi, ipr + flows/losses) */
export interface TwoTerminalDCLineResult {
  ipi: number;
  ipr: number;
  p_flow: number;
  p_loss: number;
}

/** VSC DC link result (identified by ibus1, ibus2 + converter flows/losses) */
export interface VscdcResult {
  ibus1: number;
  ibus2: number;
  p_converter1: number;
  p_converter2: number;
  p_loss: number;
  q_converter1?: number;
  q_converter2?: number;
}

export interface SystemSummary {
  total_load_mw: number;
  total_generation_mw: number;
  total_losses_mw: number;
  efficiency_percent: number;
}

export interface PowerFlowResult {
  power_flow_method?: string;
  /** True when an fdns request completed via the automatic full-Newton
   *  fallback (`surface-solve-telemetry`; success-path note). */
  fdns_fallback?: boolean;
  /** KLU factorization counters for the solve (kernel-reuse observability). */
  kernel_reuse?: {
    symbolic: number;
    full_factor: number;
    refactor: number;
    reused_solve: number;
  };
  converged: boolean;
  iterations?: number;
  max_mismatch?: number;
  solution_time_ms: number;
  bus_results: BusResult[];
  generator_results?: GeneratorResult[];
  acline_results?: AcLineBranchResult[];
  transformer_results?: TransformerBranchResult[];
  twotermdc_results?: TwoTerminalDCLineResult[];
  vscdc_results?: VscdcResult[];
  system_summary: SystemSummary;
  message?: string;
}

export type AnalysisMethod = 'dc' | 'fnsl' | 'fdns';

export interface PowerFlowConfig {
  userId?: string;
  apiBaseURL?: string;
  logLevel?: string;
  persistSession?: boolean;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  autoReconnect?: boolean;
}

export interface SolveOptions {
  sessionId?: string;
  /** Solver configuration (tolerance, max_iterations, lossless_network, etc.) */
  config?: {
    tolerance?: number;
    max_iterations?: number;
    /** If true, assume lossless network (default: false). */
    lossless_network?: boolean;
    [key: string]: unknown;
  };
}

export interface HealthStatus {
  status: string;
  timestamp?: string;
  error?: string;
}