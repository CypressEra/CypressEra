import { ParameterCategory } from '../components/common';

/**
 * Parameter configuration for different network element types
 * Organized by element type with categorized fields
 */

/** Condition to show category only for 3-winding transformers (kbus is non-zero) */
const isThreeWinding = (values: Record<string, any>): boolean => {
  const kbus = values.kbus;
  return kbus !== undefined && kbus !== null && kbus !== 0 && kbus !== '';
};

// Define identifier fields for each element type (fields that uniquely identify an element)
export const ELEMENT_IDENTIFIERS: Record<string, string[]> = {
  bus: ['ibus'],
  load: ['ibus', 'loadid'],
  generator: ['ibus', 'machid'],
  acline: ['ibus', 'jbus', 'ckt'],
  transformer: ['ibus', 'jbus', 'kbus', 'ckt'],
  fixshunt: ['ibus', 'shntid'],
  swshunt: ['ibus', 'shntid'],
  twotermdc: ['name', 'ipi', 'ipr'],
  vscdc: ['name', 'ibus1', 'ibus2'],
};

// Parameter categories for BUS elements
const BUS_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'Bus Number', type: 'int', disabled: true }
    ]
  },
  {
    name: 'Basic Information',
    fields: [
      { name: 'name', label: 'Bus Name', type: 'text' },
      { name: 'baskv', label: 'Base Voltage', type: 'float', unit: 'kV' },
      { 
        name: 'ide', 
        label: 'Bus Type', 
        type: 'select',
        options: [
          { value: 1, label: 'Load Bus' },
          { value: 2, label: 'Generator Bus' },
          { value: 3, label: 'Swing Bus' },
          { value: 4, label: 'Disconnected Bus' }
        ]
      }
    ]
  },
  {
    name: 'Location',
    fields: [
      { name: 'area', label: 'Area', type: 'int', min: 0 },
      { name: 'zone', label: 'Zone', type: 'int', min: 0 },
      { name: 'owner', label: 'Owner', type: 'int', min: 0 }
    ]
  },
  {
    name: 'Voltage Limits',
    fields: [
      { name: 'nvhi', label: 'Normal Voltage High', type: 'float', unit: 'pu', min: 0.9, max: 1.1, step: 0.01 },
      { name: 'nvlo', label: 'Normal Voltage Low', type: 'float', unit: 'pu', min: 0.9, max: 1.1, step: 0.01 },
      { name: 'evhi', label: 'Emergency Voltage High', type: 'float', unit: 'pu', min: 0.8, max: 1.2, step: 0.01 },
      { name: 'evlo', label: 'Emergency Voltage Low', type: 'float', unit: 'pu', min: 0.8, max: 1.2, step: 0.01 }
    ]
  }
];

// Parameter categories for GENERATOR elements
const GENERATOR_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'Bus Number', type: 'int', disabled: true },
      { name: 'machid', label: 'Machine ID', type: 'text', disabled: true }
    ]
  },
  {
    name: 'Power Output',
    fields: [
      { name: 'pg', label: 'Real Power', type: 'float', unit: 'MW', min: 0, max: 1000 },
      { name: 'qg', label: 'Reactive Power', type: 'float', unit: 'MVar', min: -500, max: 500 },
      { name: 'qt', label: 'Q Max', type: 'float', unit: 'MVar', min: 0 },
      { name: 'qb', label: 'Q Min', type: 'float', unit: 'MVar', max: 0 }
    ]
  },
  {
    name: 'Control',
    fields: [
      { name: 'vs', label: 'Voltage Setpoint', type: 'float', unit: 'pu', min: 0.9, max: 1.1, step: 0.01 },
      { name: 'ireg', label: 'Regulated Bus', type: 'int' },
      { 
        name: 'stat', 
        label: 'Status', 
        type: 'select',
        options: [
          { value: 0, label: 'Off' },
          { value: 1, label: 'On' }
        ]
      }
    ]
  },
  {
    name: 'Machine Data',
    fields: [
      { name: 'mbase', label: 'Machine Base MVA', type: 'float', unit: 'MVA' },
      { name: 'rmpct', label: 'Pmax Base', type: 'float', unit: '%' },
      { name: 'pt', label: 'Pmax', type: 'float', unit: 'MW' },
      { name: 'pb', label: 'Pmin', type: 'float', unit: 'MW' }
    ]
  }
];

// Parameter categories for LOAD elements
const LOAD_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'Bus Number', type: 'int', disabled: true },
      { name: 'loadid', label: 'Load ID', type: 'text', disabled: true }
    ]
  },
  {
    name: 'Load Information',
    fields: [
      { 
        name: 'stat', 
        label: 'Status', 
        type: 'select',
        options: [
          { value: 0, label: 'Off' },
          { value: 1, label: 'On' }
        ]
      },
      { name: 'pl', label: 'Real Power', type: 'float', unit: 'MW', min: 0 },
      { name: 'ql', label: 'Reactive Power', type: 'float', unit: 'MVar' },
      { name: 'scale', label: 'Scale Factor', type: 'float', min: 0, max: 10, step: 0.1 }
    ]
  },
  {
    name: 'Load Model',
    fields: [
      { name: 'ip', label: 'Constant Current (Real)', type: 'float', unit: 'MW' },
      { name: 'iq', label: 'Constant Current (Reactive)', type: 'float', unit: 'MVar' },
      { name: 'yp', label: 'Constant Admittance (Real)', type: 'float', unit: 'pu' },
      { name: 'yq', label: 'Constant Admittance (Reactive)', type: 'float', unit: 'pu' }
    ]
  }
];

// Parameter categories for ACLINE elements
const ACLINE_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'From Bus', type: 'int', disabled: true },
      { name: 'jbus', label: 'To Bus', type: 'int', disabled: true },
      { name: 'ckt', label: 'Circuit ID', type: 'text', disabled: true }
    ]
  },
  {
    name: 'Impedance',
    fields: [
      { name: 'rpu', label: 'Resistance', type: 'float', unit: 'pu' },
      { name: 'xpu', label: 'Reactance', type: 'float', unit: 'pu' },
      { name: 'bpu', label: 'Susceptance', type: 'float', unit: 'pu' }
    ]
  },
  {
    name: 'Ratings',
    fields: [
      { name: 'rate1', label: 'Rating 1', type: 'float', unit: 'MVA' },
      { name: 'rate2', label: 'Rating 2', type: 'float', unit: 'MVA' },
      { name: 'rate3', label: 'Rating 3', type: 'float', unit: 'MVA' },
      { name: 'len', label: 'Length', type: 'float', unit: 'miles' }
    ]
  },
  {
    name: 'Operational',
    fields: [
      { 
        name: 'stat', 
        label: 'Status', 
        type: 'select',
        options: [
          { value: 0, label: 'Off' },
          { value: 1, label: 'On' }
        ]
      },
      { 
        name: 'met', 
        label: 'Metering End', 
        type: 'select',
        options: [
          { value: 1, label: 'Bus I' },
          { value: 2, label: 'Bus J' }
        ]
      },
      { name: 'gi', label: 'G at Bus I', type: 'float', unit: 'pu' },
      { name: 'bi', label: 'B at Bus I', type: 'float', unit: 'pu' },
      { name: 'gj', label: 'G at Bus J', type: 'float', unit: 'pu' },
      { name: 'bj', label: 'B at Bus J', type: 'float', unit: 'pu' }
    ]
  }
];

// Parameter categories for TRANSFORMER elements
const TRANSFORMER_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'Winding 1 Bus (I)', type: 'int', disabled: true },
      { name: 'jbus', label: 'Winding 2 Bus (J)', type: 'int', disabled: true },
      { name: 'kbus', label: 'Winding 3 Bus (K)', type: 'int', disabled: true },
      { name: 'ckt', label: 'Circuit ID', type: 'text', disabled: true },
      { name: 'name', label: 'Transformer Name', type: 'text' }
    ]
  },
  {
    name: 'Data I/O Codes',
    fields: [
      { 
        name: 'cw', 
        label: 'Winding Data I/O Code', 
        type: 'select',
        options: [
          { value: 1, label: 'Off-nominal turns ratio (pu of bus voltage)' },
          { value: 2, label: 'Winding voltage (kV)' },
          { value: 3, label: 'Off-nominal ratio (pu of nominal voltage)' }
        ]
      },
      { 
        name: 'cz', 
        label: 'Impedance Data I/O Code', 
        type: 'select',
        options: [
          { value: 1, label: 'R/X on system MVA base' },
          { value: 2, label: 'R/X on specified MVA base' },
          { value: 3, label: 'Load loss (W) / Impedance (pu)' }
        ]
      },
      { 
        name: 'cm', 
        label: 'Magnetizing Admittance I/O Code', 
        type: 'select',
        options: [
          { value: 1, label: 'Complex admittance (pu)' },
          { value: 2, label: 'No load loss (W) / Exciting current (pu)' }
        ]
      }
    ]
  },
  {
    name: 'Magnetizing Admittance',
    fields: [
      { name: 'mag1', label: 'MAG1 (G or No-load Loss)', type: 'float', unit: 'pu/W' },
      { name: 'mag2', label: 'MAG2 (B or Exciting Current)', type: 'float', unit: 'pu' }
    ]
  },
  {
    name: 'Impedance (Winding 1-2)',
    fields: [
      { name: 'r1_2', label: 'Resistance 1-2', type: 'float', unit: 'pu' },
      { name: 'x1_2', label: 'Reactance 1-2', type: 'float', unit: 'pu' },
      { name: 'sbase1_2', label: 'Base MVA 1-2', type: 'float', unit: 'MVA' }
    ]
  },
  {
    name: 'Impedance (Winding 2-3)',
    condition: isThreeWinding,
    fields: [
      { name: 'r2_3', label: 'Resistance 2-3', type: 'float', unit: 'pu' },
      { name: 'x2_3', label: 'Reactance 2-3', type: 'float', unit: 'pu' },
      { name: 'sbase2_3', label: 'Base MVA 2-3', type: 'float', unit: 'MVA' }
    ]
  },
  {
    name: 'Impedance (Winding 3-1)',
    condition: isThreeWinding,
    fields: [
      { name: 'r3_1', label: 'Resistance 3-1', type: 'float', unit: 'pu' },
      { name: 'x3_1', label: 'Reactance 3-1', type: 'float', unit: 'pu' },
      { name: 'sbase3_1', label: 'Base MVA 3-1', type: 'float', unit: 'MVA' }
    ]
  },
  {
    name: 'Star Point (3-Winding)',
    condition: isThreeWinding,
    fields: [
      { name: 'vmstar', label: 'Star Point Voltage', type: 'float', unit: 'pu' },
      { name: 'anstar', label: 'Star Point Angle', type: 'float', unit: 'deg' }
    ]
  },
  {
    name: 'Winding 1 Settings',
    fields: [
      { name: 'windv1', label: 'Winding 1 Voltage/Tap', type: 'float', unit: 'pu/kV' },
      { name: 'nomv1', label: 'Nominal Voltage 1', type: 'float', unit: 'kV' },
      { name: 'ang1', label: 'Phase Shift Angle 1', type: 'float', unit: 'deg', min: -180, max: 180 },
      { name: 'wdg1rate1', label: 'Rating 1', type: 'float', unit: 'MVA' },
      { name: 'wdg1rate2', label: 'Rating 2', type: 'float', unit: 'MVA' },
      { name: 'wdg1rate3', label: 'Rating 3', type: 'float', unit: 'MVA' }
    ]
  },
  {
    name: 'Winding 1 Control',
    fields: [
      { 
        name: 'cod1', 
        label: 'Control Mode 1', 
        type: 'select',
        options: [
          { value: 0, label: 'Fixed tap and phase shift' },
          { value: 1, label: 'Voltage control' },
          { value: 2, label: 'Reactive power flow control' },
          { value: 3, label: 'Active power flow control' },
          { value: 5, label: 'Asymmetric active power control' }
        ]
      },
      { name: 'cont1', label: 'Controlled Bus', type: 'int' },
      { name: 'node1', label: 'Controlled Node', type: 'int' },
      { name: 'rma1', label: 'Tap/Angle Upper Limit', type: 'float' },
      { name: 'rmi1', label: 'Tap/Angle Lower Limit', type: 'float' },
      { name: 'vma1', label: 'Controlled Value Upper Limit', type: 'float', unit: 'pu/MW/MVar' },
      { name: 'vmi1', label: 'Controlled Value Lower Limit', type: 'float', unit: 'pu/MW/MVar' },
      { name: 'ntp1', label: 'Number of Tap Positions', type: 'int', min: 2, max: 9999 },
      { name: 'tab1', label: 'Impedance Correction Table', type: 'int' },
      { name: 'cr1', label: 'Load Drop Comp. R', type: 'float', unit: 'pu' },
      { name: 'cx1', label: 'Load Drop Comp. X', type: 'float', unit: 'pu' },
      { name: 'cnxa1', label: 'Winding Connection Angle', type: 'float', unit: 'deg' }
    ]
  },
  {
    name: 'Winding 2 Settings',
    fields: [
      { name: 'windv2', label: 'Winding 2 Voltage/Tap', type: 'float', unit: 'pu/kV' },
      { name: 'nomv2', label: 'Nominal Voltage 2', type: 'float', unit: 'kV' },
      { name: 'ang2', label: 'Phase Shift Angle 2', type: 'float', unit: 'deg', min: -180, max: 180 },
      { name: 'wdg2rate1', label: 'Rating 1', type: 'float', unit: 'MVA' },
      { name: 'wdg2rate2', label: 'Rating 2', type: 'float', unit: 'MVA' },
      { name: 'wdg2rate3', label: 'Rating 3', type: 'float', unit: 'MVA' }
    ]
  },
  {
    name: 'Winding 2 Control',
    fields: [
      { 
        name: 'cod2', 
        label: 'Control Mode 2', 
        type: 'select',
        options: [
          { value: 0, label: 'Fixed tap and phase shift' },
          { value: 1, label: 'Voltage control' },
          { value: 2, label: 'Reactive power flow control' },
          { value: 3, label: 'Active power flow control' },
          { value: 5, label: 'Asymmetric active power control' }
        ]
      },
      { name: 'cont2', label: 'Controlled Bus', type: 'int' },
      { name: 'node2', label: 'Controlled Node', type: 'int' },
      { name: 'rma2', label: 'Tap/Angle Upper Limit', type: 'float' },
      { name: 'rmi2', label: 'Tap/Angle Lower Limit', type: 'float' },
      { name: 'vma2', label: 'Controlled Value Upper Limit', type: 'float', unit: 'pu/MW/MVar' },
      { name: 'vmi2', label: 'Controlled Value Lower Limit', type: 'float', unit: 'pu/MW/MVar' },
      { name: 'ntp2', label: 'Number of Tap Positions', type: 'int', min: 2, max: 9999 },
      { name: 'tab2', label: 'Impedance Correction Table', type: 'int' },
      { name: 'cr2', label: 'Load Drop Comp. R', type: 'float', unit: 'pu' },
      { name: 'cx2', label: 'Load Drop Comp. X', type: 'float', unit: 'pu' },
      { name: 'cnxa2', label: 'Winding Connection Angle', type: 'float', unit: 'deg' }
    ]
  },
  {
    name: 'Winding 3 Settings (3-Winding)',
    condition: isThreeWinding,
    fields: [
      { name: 'windv3', label: 'Winding 3 Voltage/Tap', type: 'float', unit: 'pu/kV' },
      { name: 'nomv3', label: 'Nominal Voltage 3', type: 'float', unit: 'kV' },
      { name: 'ang3', label: 'Phase Shift Angle 3', type: 'float', unit: 'deg', min: -180, max: 180 },
      { name: 'wdg3rate1', label: 'Rating 1', type: 'float', unit: 'MVA' },
      { name: 'wdg3rate2', label: 'Rating 2', type: 'float', unit: 'MVA' },
      { name: 'wdg3rate3', label: 'Rating 3', type: 'float', unit: 'MVA' }
    ]
  },
  {
    name: 'Winding 3 Control (3-Winding)',
    condition: isThreeWinding,
    fields: [
      { 
        name: 'cod3', 
        label: 'Control Mode 3', 
        type: 'select',
        options: [
          { value: 0, label: 'Fixed tap and phase shift' },
          { value: 1, label: 'Voltage control' },
          { value: 2, label: 'Reactive power flow control' },
          { value: 3, label: 'Active power flow control' },
          { value: 5, label: 'Asymmetric active power control' }
        ]
      },
      { name: 'cont3', label: 'Controlled Bus', type: 'int' },
      { name: 'node3', label: 'Controlled Node', type: 'int' },
      { name: 'rma3', label: 'Tap/Angle Upper Limit', type: 'float' },
      { name: 'rmi3', label: 'Tap/Angle Lower Limit', type: 'float' },
      { name: 'vma3', label: 'Controlled Value Upper Limit', type: 'float', unit: 'pu/MW/MVar' },
      { name: 'vmi3', label: 'Controlled Value Lower Limit', type: 'float', unit: 'pu/MW/MVar' },
      { name: 'ntp3', label: 'Number of Tap Positions', type: 'int', min: 2, max: 9999 },
      { name: 'tab3', label: 'Impedance Correction Table', type: 'int' },
      { name: 'cr3', label: 'Load Drop Comp. R', type: 'float', unit: 'pu' },
      { name: 'cx3', label: 'Load Drop Comp. X', type: 'float', unit: 'pu' },
      { name: 'cnxa3', label: 'Winding Connection Angle', type: 'float', unit: 'deg' }
    ]
  },
  {
    name: 'Operational',
    fields: [
      { 
        name: 'stat', 
        label: 'Status', 
        type: 'select',
        options: [
          { value: 0, label: 'Out-of-service' },
          { value: 1, label: 'In-service' },
          { value: 2, label: 'Winding 2 out-of-service' },
          { value: 3, label: 'Winding 3 out-of-service' },
          { value: 4, label: 'Winding 1 out-of-service' }
        ]
      },
      { 
        name: 'nmet', 
        label: 'Metering End', 
        type: 'select',
        options: [
          { value: 1, label: 'Winding 1 Bus' },
          { value: 2, label: 'Winding 2 Bus' },
          { value: 3, label: 'Winding 3 Bus' }
        ]
      },
      { name: 'vecgrp', label: 'Vector Group', type: 'text' },
      { 
        name: 'zcod', 
        label: 'Impedance Correction Method', 
        type: 'select',
        options: [
          { value: 0, label: 'Apply to winding impedances (Z1, Z2, Z3)' },
          { value: 1, label: 'Apply to bus-to-bus impedances (Z12, Z23, Z31)' }
        ]
      }
    ]
  },
  {
    name: 'Ownership',
    fields: [
      { name: 'o1', label: 'Owner 1', type: 'int', min: 1, max: 9999 },
      { name: 'f1', label: 'Fraction 1', type: 'float', unit: '%', min: 0 },
      { name: 'o2', label: 'Owner 2', type: 'int', min: 1, max: 9999 },
      { name: 'f2', label: 'Fraction 2', type: 'float', unit: '%', min: 0 },
      { name: 'o3', label: 'Owner 3', type: 'int', min: 1, max: 9999 },
      { name: 'f3', label: 'Fraction 3', type: 'float', unit: '%', min: 0 },
      { name: 'o4', label: 'Owner 4', type: 'int', min: 1, max: 9999 },
      { name: 'f4', label: 'Fraction 4', type: 'float', unit: '%', min: 0 }
    ]
  }
];

// Parameter categories for FIXSHUNT elements
const FIXSHUNT_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'Bus Number', type: 'int', disabled: true },
      { name: 'shntid', label: 'Shunt ID', type: 'text', disabled: true }
    ]
  },
  {
    name: 'Shunt Information',
    fields: [
      { 
        name: 'stat', 
        label: 'Status', 
        type: 'select',
        options: [
          { value: 0, label: 'Off' },
          { value: 1, label: 'On' }
        ]
      },
      { name: 'gl', label: 'Active Component of Shunt Admittance', type: 'float', unit: 'MW' },
      { name: 'bl', label: 'Reactive Component of Shunt Admittance', type: 'float', unit: 'MVar' }
    ]
  }
];

// Parameter categories for SWSHUNT elements
const SWSHUNT_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'ibus', label: 'Bus Number', type: 'int', disabled: true },
      { name: 'shntid', label: 'Shunt ID', type: 'text', disabled: true }
    ]
  },
  {
    name: 'Control',
    fields: [
      {
        name: 'modsw',
        label: 'Control Mode',
        type: 'select',
        options: [
          { value: 0, label: 'Locked' },
          { value: 1, label: 'Discrete — Voltage Control' },
          { value: 2, label: 'Continuous — Voltage Control' },
          { value: 3, label: 'Discrete — Plant Reactive Power' },
          { value: 4, label: 'Discrete — VSC DC Reactive Power' },
          { value: 5, label: 'Discrete — Remote Shunt Admittance' },
          { value: 6, label: 'Discrete — FACTS Shunt Reactive Power' }
        ]
      },
      {
        name: 'adjm',
        label: 'Adjustment Method',
        type: 'select',
        options: [
          { value: 0, label: 'Ordered (input order on, reverse off)' },
          { value: 1, label: 'Optimal (next highest/lowest admittance)' }
        ]
      },
      {
        name: 'stat',
        label: 'Status',
        type: 'select',
        options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'vswhi', label: 'Upper Limit', type: 'float', unit: 'pu' },
      { name: 'vswlo', label: 'Lower Limit', type: 'float', unit: 'pu' },
      { name: 'swreg', label: 'Regulated Bus', type: 'int' },
      { name: 'nreg', label: 'Regulated Bus Node', type: 'int' },
      { name: 'rmpct', label: 'Mvar Contribution', type: 'float', unit: '%' },
      { name: 'rmidnt', label: 'Remote Device Name', type: 'text' },
      { name: 'binit', label: 'Initial Admittance', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 1',
    fields: [
      { name: 's1', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n1', label: 'Number of Steps', type: 'int' },
      { name: 'b1', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 2',
    fields: [
      { name: 's2', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n2', label: 'Number of Steps', type: 'int' },
      { name: 'b2', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 3',
    fields: [
      { name: 's3', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n3', label: 'Number of Steps', type: 'int' },
      { name: 'b3', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 4',
    fields: [
      { name: 's4', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n4', label: 'Number of Steps', type: 'int' },
      { name: 'b4', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 5',
    fields: [
      { name: 's5', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n5', label: 'Number of Steps', type: 'int' },
      { name: 'b5', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 6',
    fields: [
      { name: 's6', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n6', label: 'Number of Steps', type: 'int' },
      { name: 'b6', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 7',
    fields: [
      { name: 's7', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n7', label: 'Number of Steps', type: 'int' },
      { name: 'b7', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  },
  {
    name: 'Block 8',
    fields: [
      { name: 's8', label: 'Status', type: 'select', options: [
          { value: 0, label: 'Out-of-Service' },
          { value: 1, label: 'In-Service' }
        ]
      },
      { name: 'n8', label: 'Number of Steps', type: 'int' },
      { name: 'b8', label: 'Admittance Increment per Step', type: 'float', unit: 'MVar' }
    ]
  }
];

// Parameter categories for TWOTERMDC elements
const TWOTERMDC_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'name', label: 'Name', type: 'text', disabled: true },
      { name: 'ipi', label: 'IP I', type: 'int', disabled: true },
      { name: 'ipr', label: 'IP R', type: 'int', disabled: true }
    ]
  },
  {
    name: 'DC Line',
    fields: [
      { name: 'mdc', label: 'Multi-terminal DC Code', type: 'int' },
      { name: 'rdc', label: 'DC Resistance', type: 'float', unit: 'pu' },
      { name: 'setvl', label: 'DC Setpoint', type: 'float', unit: 'kV' },
      { name: 'p_flow', label: 'DC Power Flow', type: 'float', unit: 'MW', disabled: true },
      { name: 'p_loss', label: 'DC Line Loss', type: 'float', unit: 'MW', disabled: true }
    ]
  },
  {
    name: 'Converter 1',
    fields: [
      { name: 'vschd', label: 'VSC Mode', type: 'int' },
      { name: 'vcmod', label: 'Converter Control', type: 'int' },
      { name: 'rcomp', label: 'Compensating Resistance', type: 'float', unit: 'pu' },
      { name: 'delti', label: 'Commutation Angle', type: 'float', unit: 'deg' },
      { name: 'met', label: 'Metering End', type: 'select', options: [
          { value: 1, label: 'Bus I' },
          { value: 2, label: 'Bus J' }
        ]
      },
      { name: 'dcvmin', label: 'Min DC Voltage', type: 'float', unit: 'kV' },
      { name: 'cccitmx', label: 'Max Iterations', type: 'int' },
      { name: 'cccacc', label: 'Acceleration Factor', type: 'float' }
    ]
  },
  {
    name: 'Rectifier',
    fields: [
      { name: 'nbr', label: 'Number of Bridges', type: 'int' },
      { name: 'anmxr', label: 'Max Firing Angle', type: 'float', unit: 'deg' },
      { name: 'anmnr', label: 'Min Firing Angle', type: 'float', unit: 'deg' },
      { name: 'rcr', label: 'Commutating Resistance', type: 'float', unit: 'pu' },
      { name: 'xcr', label: 'Commutating Reactance', type: 'float', unit: 'pu' },
      { name: 'ebasr', label: 'Base AC Voltage', type: 'float', unit: 'kV' },
      { name: 'trr', label: 'Transformer Ratio', type: 'float' },
      { name: 'tapr', label: 'Tap Position', type: 'float' },
      { name: 'tmxr', label: 'Max Tap', type: 'float' },
      { name: 'tmnr', label: 'Min Tap', type: 'float' },
      { name: 'stpr', label: 'Tap Step', type: 'float' }
    ]
  },
  {
    name: 'Inverter',
    fields: [
      { name: 'icr', label: 'Current Margin', type: 'float', unit: 'pu' },
      { name: 'ndr', label: 'Number of Bridges', type: 'int' },
      { name: 'ifr', label: 'Max Firing Angle', type: 'float', unit: 'deg' },
      { name: 'itr', label: 'Max Gamma Angle', type: 'float', unit: 'deg' },
      { name: 'idr', label: 'Min Gamma Angle', type: 'float', unit: 'deg' },
      { name: 'xcapr', label: 'Compensating Reactance', type: 'float', unit: 'pu' }
    ]
  }
];

// Parameter categories for VSCDC elements
const VSCDC_CATEGORIES: ParameterCategory[] = [
  {
    name: 'Identifiers',
    fields: [
      { name: 'name', label: 'Name', type: 'text', disabled: true },
      { name: 'ibus1', label: 'ibus1', type: 'int', disabled: true },
      { name: 'ibus2', label: 'ibus2', type: 'int', disabled: true }
    ]
  },
  {
    name: 'DC Line',
    fields: [
      { name: 'mdc', label: 'mdc', type: 'int' },
      { name: 'rdc', label: 'rdc', type: 'float', unit: 'pu' }
    ]
  },
  {
    name: 'Owner',
    fields: [
      { name: 'o1', label: 'o1', type: 'int' },
      { name: 'f1', label: 'f1', type: 'float', unit: 'pu' },
      { name: 'o2', label: 'o2', type: 'int' },
      { name: 'f2', label: 'f2', type: 'float', unit: 'pu' },
      { name: 'o3', label: 'o3', type: 'int' },
      { name: 'f3', label: 'f3', type: 'float', unit: 'pu' },
      { name: 'o4', label: 'o4', type: 'int' },
      { name: 'f4', label: 'f4', type: 'float', unit: 'pu' }
    ]
  },
  {
    name: 'Converter 1',
    fields: [
      { name: 'type1', label: 'type1', type: 'int' },
      { name: 'mode1', label: 'mode1', type: 'int' },
      { name: 'dcset1', label: 'dcset1', type: 'float', unit: 'kV' },
      { name: 'acset1', label: 'acset1', type: 'float', unit: 'kV' },
      { name: 'aloss1', label: 'aloss1', type: 'float' },
      { name: 'bloss1', label: 'bloss1', type: 'float' },
      { name: 'minloss1', label: 'minloss1', type: 'float', unit: 'MW' },
      { name: 'smax1', label: 'smax1', type: 'float', unit: 'MVA' },
      { name: 'imax1', label: 'imax1', type: 'float', unit: 'kA' },
      { name: 'pwf1', label: 'pwf1', type: 'float' },
      { name: 'maxq1', label: 'maxq1', type: 'float', unit: 'MVar' },
      { name: 'minq1', label: 'minq1', type: 'float', unit: 'MVar' },
      { name: 'vsreg1', label: 'vsreg1', type: 'int' },
      { name: 'nreg1', label: 'nreg1', type: 'int' },
      { name: 'rmpct1', label: 'rmpct1', type: 'float', unit: '%' }
    ]
  },
  {
    name: 'Converter 2',
    fields: [
      { name: 'type2', label: 'type2', type: 'int' },
      { name: 'mode2', label: 'mode2', type: 'int' },
      { name: 'dcset2', label: 'dcset2', type: 'float', unit: 'kV' },
      { name: 'acset2', label: 'acset2', type: 'float', unit: 'kV' },
      { name: 'aloss2', label: 'aloss2', type: 'float' },
      { name: 'bloss2', label: 'bloss2', type: 'float' },
      { name: 'minloss2', label: 'minloss2', type: 'float', unit: 'MW' },
      { name: 'smax2', label: 'smax2', type: 'float', unit: 'MVA' },
      { name: 'imax2', label: 'imax2', type: 'float', unit: 'kA' },
      { name: 'pwf2', label: 'pwf2', type: 'float' },
      { name: 'maxq2', label: 'maxq2', type: 'float', unit: 'MVar' },
      { name: 'minq2', label: 'minq2', type: 'float', unit: 'MVar' },
      { name: 'vsreg2', label: 'vsreg2', type: 'int' },
      { name: 'nreg2', label: 'nreg2', type: 'int' },
      { name: 'rmpct2', label: 'rmpct2', type: 'float', unit: '%' }
    ]
  },
  {
    name: 'Power Flow',
    fields: [
      { name: 'p_converter1', label: 'Converter 1 P (MW)', type: 'float', unit: 'MW', disabled: true },
      { name: 'q_converter1', label: 'Converter 1 Q (MVar)', type: 'float', unit: 'MVar', disabled: true },
      { name: 'p_converter2', label: 'Converter 2 P (MW)', type: 'float', unit: 'MW', disabled: true },
      { name: 'q_converter2', label: 'Converter 2 Q (MVar)', type: 'float', unit: 'MVar', disabled: true },
      { name: 'p_loss', label: 'DC Line Loss (MW)', type: 'float', unit: 'MW', disabled: true }
    ]
  }
];

// Map of element types to their parameter categories
export const ELEMENT_PARAMETER_CATEGORIES: Record<string, ParameterCategory[]> = {
  bus: BUS_CATEGORIES,
  generator: GENERATOR_CATEGORIES,
  load: LOAD_CATEGORIES,
  acline: ACLINE_CATEGORIES,
  transformer: TRANSFORMER_CATEGORIES,
  fixshunt: FIXSHUNT_CATEGORIES,
  swshunt: SWSHUNT_CATEGORIES,
  twotermdc: TWOTERMDC_CATEGORIES,
  vscdc: VSCDC_CATEGORIES,
};

/**
 * Get parameter categories for a specific element type
 * @param elementType - The type of network element
 * @param rowData - The data row to generate generic categories for if element type not found
 * @param options - Optional configuration for parameter categories
 * @returns Array of parameter categories
 */
export function getParameterCategories(
  elementType: string,
  rowData?: any,
  options?: { mode?: 'modify' | 'add'; preSetValues?: Record<string, any> }
): ParameterCategory[] {
  // Check if we have predefined categories for this element type
  if (ELEMENT_PARAMETER_CATEGORIES[elementType]) {
    const categories = ELEMENT_PARAMETER_CATEGORIES[elementType];

    // If in add mode, enable identifier fields for input
    if (options?.mode === 'add') {
      const identifierFields = ELEMENT_IDENTIFIERS[elementType] || [];
      
      return categories.map(category => ({
        ...category,
        fields: category.fields.map(field => {
          const fieldName = field.name;
          const isPreSet = options.preSetValues?.[fieldName] !== undefined;

          if (isPreSet) {
            // Pre-set fields (like ibus when adding load to a specific bus) should be disabled
            return { ...field, disabled: true };
          } else if (identifierFields.includes(fieldName)) {
            // Identifier fields should be enabled and required in add mode
            return { ...field, disabled: false, required: true };
          }

          return field;
        })
      }));
    }

    return categories;
  }

  // Generic fallback - show all non-identifier fields
  const identifierFields = ELEMENT_IDENTIFIERS[elementType] || [];
  const allFields = Object.keys(rowData || {});
  const editableFields = allFields.filter(f => !identifierFields.includes(f));

  return [{
    name: 'Parameters',
    fields: editableFields.map(f => ({
      name: f,
      label: f,
      type: typeof rowData[f] === 'number' ? (Number.isInteger(rowData[f]) ? 'int' : 'float') : 'text'
    }))
  }];
}

