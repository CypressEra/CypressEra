import React, { createContext, useCallback, useContext, useState } from 'react';

// --- Settings type definitions ---

export interface ACSettings {
  /**
   * Newton-Raphson convergence tolerance. Optional: when undefined (the
   * default), the frontend does not send it, so the solver falls back to the
   * RAWX NEWTON `toln`, then its own default (1e-3, PSS/E TOLN parity).
   */
  tolerance?: number;
  max_iterations: number;
  flat_start: boolean;
  max_outerloop_iterations: number;
  control_tolerance: number;
  tap_adjustment: 'locked' | 'stepping' | 'direct';
  phase_shift_adjustment: boolean;
  dc_tap_adjustment: boolean;
  switched_shunt_adjustment: 'lock_all' | 'enable_all' | 'continuous_only';
  area_interchange_adjustment: 'disabled' | 'tie_lines_only' | 'tie_lines_and_loads';
}

export const AC_SETTINGS_DEFAULTS: ACSettings = {
  // tolerance intentionally omitted (undefined) → solver uses RAWX/default.
  max_iterations: 100,
  flat_start: false,
  max_outerloop_iterations: 50,
  control_tolerance: 0.1,
  tap_adjustment: 'stepping',
  phase_shift_adjustment: true,
  dc_tap_adjustment: true,
  switched_shunt_adjustment: 'enable_all',
  area_interchange_adjustment: 'disabled',
};

// --- Persistence ---
// Top-level key holds all app settings, namespaced by section.
// Future sections (e.g. ui, display, dc_solver) can be added without migration.

const STORAGE_KEY = 'cypressera:app-settings';

interface StoredSettings {
  solver?: {
    ac?: Partial<ACSettings>;
  };
  // Future sections:
  // ui?: { ... };
  // display?: { ... };
}

function loadACSettings(): ACSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...AC_SETTINGS_DEFAULTS };
    const stored: StoredSettings = JSON.parse(raw);
    return { ...AC_SETTINGS_DEFAULTS, ...stored.solver?.ac };
  } catch {
    return { ...AC_SETTINGS_DEFAULTS };
  }
}

function saveACSettings(ac: ACSettings): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored: StoredSettings = raw ? JSON.parse(raw) : {};
    stored.solver = { ...stored.solver, ac };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // localStorage unavailable or full — silently ignore
  }
}

// --- Context ---

interface SolverSettingsContextValue {
  acSettings: ACSettings;
  updateACSettings: (updates: Partial<ACSettings>) => void;
  resetACSettings: () => void;
}

const SolverSettingsContext = createContext<SolverSettingsContextValue | undefined>(undefined);

export const SolverSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [acSettings, setACSettings] = useState<ACSettings>(loadACSettings);

  const updateACSettings = useCallback((updates: Partial<ACSettings>) => {
    setACSettings(prev => {
      const next = { ...prev, ...updates };
      saveACSettings(next);
      return next;
    });
  }, []);

  const resetACSettings = useCallback(() => {
    const defaults = { ...AC_SETTINGS_DEFAULTS };
    saveACSettings(defaults);
    setACSettings(defaults);
  }, []);

  return (
    <SolverSettingsContext.Provider value={{ acSettings, updateACSettings, resetACSettings }}>
      {children}
    </SolverSettingsContext.Provider>
  );
};

export const useSolverSettings = (): SolverSettingsContextValue => {
  const context = useContext(SolverSettingsContext);
  if (!context) {
    throw new Error('useSolverSettings must be used within a SolverSettingsProvider');
  }
  return context;
};
