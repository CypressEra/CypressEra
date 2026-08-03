/**
 * Element Schema for Power Flow Network Types
 *
 * PURPOSE: Single source of truth for element metadata in the frontend.
 * This file defines the structure of power network elements (bus, load, generator, etc.)
 * and is used for:
 *
 * 1. SDK Cache Merging (Xolution.js)
 *    - identifierKeys tell SDK how to match elements when updating partial network data
 *    - Example: load is uniquely identified by (ibus, loadid), not by pl or ql
 *
 * 2. UI Form Generation (Future)
 *    - dataKeys define which fields to show in add/edit forms
 *    - keyDescriptions provide user-friendly labels
 *    - defaultValues populate initial form state
 *    - exampleIdentifier/exampleData help users understand required format
 *
 * 3. Extensibility
 *    - Adding new element types (e.g., shunt, svc) only requires adding a schema entry
 *    - No changes needed in SDK or UI code
 *
 * WHY KEEP THIS FILE:
 * - Single source of truth: one definition, multiple consumers
 * - Industry best practice: schema-driven UI (Retool, Airtable, Salesforce pattern)
 * - Maintainability: element structure changes only require updating this file
 *
 * NOTE: mcp-server has its own ELEMENT_SCHEMAS (toolExecutor.ts) for server-side
 * tool execution. They are intentionally separate - frontend schema for UI/SDK,
 * server schema for API validation.
 */

/** @typedef {{ identifierKeys: string[], dataKeys: string[], description?: string, keyDescriptions?: Record<string, string>, exampleIdentifier?: object, exampleData?: object, defaultValues?: object }} SchemaEntry */

/** @type {Record<string, SchemaEntry>} */
const ELEMENT_SCHEMAS = {
  bus: {
    identifierKeys: ['ibus'],
    dataKeys: ['name', 'baskv', 'ide', 'area', 'zone', 'owner', 'nvhi', 'nvlo', 'evhi', 'evlo', 'va', 'vm'],
    description: 'Bus (node) in the power network. Identified by bus number (ibus). Base voltage and type (ide) define the bus.',
    keyDescriptions: {
      ibus: 'Bus number (integer). Required for identifier.',
      name: 'Bus name/label.',
      baskv: 'Base voltage in kV.',
      ide: 'Bus type: 1=PQ, 2=PV, 3=slack, 4=isolated.',
      area: 'Area number.',
      zone: 'Zone number.',
      vm: 'Voltage magnitude (pu).',
      va: 'Voltage angle (degrees).',
    },
    exampleIdentifier: { ibus: 1 },
    exampleData: { name: 'Main Bus 1', baskv: 230, ide: 2, vm: 1.02 },
    defaultValues: { ide: 1, vm: 1.0, va: 0.0, area: 1, zone: 1, owner: 1, nvhi: 1.1, nvlo: 0.9, evhi: 1.1, evlo: 0.9 },
  },
  load: {
    identifierKeys: ['ibus', 'loadid'],
    dataKeys: ['area', 'dgenm', 'dgenp', 'dgenq', 'intrpt', 'ip', 'iq', 'loadtype', 'owner', 'pl', 'ql', 'scale', 'stat', 'yp', 'yq', 'zone'],
    description: 'Load at a bus. Identified by bus number (ibus) and load id (loadid). Active (pl) and reactive (ql) power in MW/Mvar. NOTE: loadid is OPTIONAL - will be auto-generated if not provided.',
    keyDescriptions: {
      ibus: 'Bus number. Required for identifier.',
      loadid: 'Load identifier string (e.g. "1", "A"). OPTIONAL - auto-generated if not provided.',
      pl: 'Active power demand (MW).',
      ql: 'Reactive power demand (Mvar).',
      stat: 'Status: 0=in-service, 1=out.',
      loadtype: 'Load type code (string, e.g. "1").',
      scale: 'Scaling factor.',
    },
    exampleIdentifier: { ibus: 2, loadid: '1' },
    exampleData: { pl: 100, ql: 50, stat: 1 },
    defaultValues: { pl: 0, ql: 0, stat: 1, scale: 1.0, loadtype: '1', intrpt: 0, ip: 0, iq: 0, yp: 0, yq: 0, dgenm: 0, dgenp: 0, dgenq: 0 },
  },
  generator: {
    identifierKeys: ['ibus', 'machid'],
    dataKeys: ['baslod', 'droopname', 'gtap', 'ireg', 'mbase', 'nreg', 'o1', 'o2', 'o3', 'o4', 'pb', 'pg', 'pt', 'qb', 'qg', 'qt', 'rmpct', 'rt', 'stat', 'vs', 'xt', 'zr', 'zx', 'f1', 'f2', 'f3', 'f4'],
    description: 'Generator at a bus. Identified by bus number (ibus) and machine id (machid). PG/QG are scheduled real/reactive; VS is voltage setpoint. NOTE: machid is OPTIONAL - will be auto-generated if not provided.',
    keyDescriptions: {
      ibus: 'Bus number. Required for identifier.',
      machid: 'Generator/machine id string. OPTIONAL - auto-generated if not provided.',
      pg: 'Scheduled real power output (MW).',
      qg: 'Scheduled reactive power (Mvar).',
      qb: 'Reactive power minimum (Mvar).',
      qt: 'Reactive power maximum (Mvar).',
      vs: 'Voltage setpoint (pu).',
      mbase: 'Machine base MVA.',
      stat: 'Status: 0=in-service, 1=out.',
    },
    exampleIdentifier: { ibus: 1, machid: '1' },
    exampleData: { pg: 200, qg: 50, vs: 1.05, stat: 1 },
    defaultValues: { pg: 0, qg: 0, vs: 1.0, stat: 1, mbase: 100, baslod: 0, gtap: 1.0, ireg: 0, nreg: 0, pb: 0, pt: 0, qb: -9999, qt: 9999, rmpct: 100, rt: 0, xt: 0, zr: 0, zx: 0 },
  },
  acline: {
    identifierKeys: ['ibus', 'jbus', 'ckt'],
    dataKeys: ['rpu', 'xpu', 'bpu', 'rate1', 'rate2', 'rate3', 'rate4', 'rate5', 'rate6', 'rate7', 'rate8', 'rate9', 'rate10', 'rate11', 'rate12', 'bi', 'bj', 'gi', 'gj', 'len', 'met', 'name', 'stat', 'f1', 'f2', 'f3', 'f4', 'o1', 'o2', 'o3', 'o4'],
    description: 'AC transmission line between two buses. Identified by from-bus (ibus), to-bus (jbus), and circuit id (ckt). Series R/X and shunt B are in per-unit; rate1–rate12 are thermal limits (MVA). NOTE: ckt is OPTIONAL - will be auto-generated if not provided.',
    keyDescriptions: {
      ibus: 'From bus number. Required for identifier.',
      jbus: 'To bus number. Required for identifier.',
      ckt: 'Circuit id string (e.g. "1"). OPTIONAL - auto-generated if not provided.',
      rpu: 'Series resistance (pu).',
      xpu: 'Series reactance (pu).',
      bpu: 'Total line charging susceptance (pu).',
      rate1: 'Thermal rating (MVA) — first rating.',
      rate2: 'Thermal rating (MVA) — second rating.',
      stat: 'Status: 0=in-service, 1=out.',
      name: 'Line name.',
    },
    exampleIdentifier: { ibus: 1, jbus: 2, ckt: '1' },
    exampleData: { rpu: 0.01, xpu: 0.1, bpu: 0.02, rate1: 200, stat: 1 },
    defaultValues: { rpu: 0, xpu: 0.01, bpu: 0, rate1: 100, stat: 1, bi: 0, bj: 0, gi: 0, gj: 0, len: 0, met: 1 },
  },
  transformer: {
    identifierKeys: ['ibus', 'jbus', 'kbus', 'ckt'],
    dataKeys: ['r1_2', 'x1_2', 'sbase1_2', 'r2_3', 'x2_3', 'sbase2_3', 'r3_1', 'x3_1', 'sbase3_1', 'stat', 'cw', 'cz', 'cm', 'windv1', 'windv2', 'windv3', 'nomv1', 'nomv2', 'nomv3', 'ang1', 'ang2', 'ang3', 'mag1', 'mag2', 'nmet', 'name', 'vecgrp', 'zcod', 'o1', 'o2', 'o3', 'o4', 'f1', 'f2', 'f3', 'f4', 'wdg1rate1', 'wdg1rate2', 'wdg1rate3', 'wdg1rate4', 'wdg1rate5', 'wdg1rate6', 'wdg1rate7', 'wdg1rate8', 'wdg1rate9', 'wdg1rate10', 'wdg1rate11', 'wdg1rate12', 'wdg2rate1', 'wdg2rate2', 'wdg2rate3', 'wdg2rate4', 'wdg2rate5', 'wdg2rate6', 'wdg2rate7', 'wdg2rate8', 'wdg2rate9', 'wdg2rate10', 'wdg2rate11', 'wdg2rate12', 'wdg3rate1', 'wdg3rate2', 'wdg3rate3', 'wdg3rate4', 'wdg3rate5', 'wdg3rate6', 'wdg3rate7', 'wdg3rate8', 'wdg3rate9', 'wdg3rate10', 'wdg3rate11', 'wdg3rate12', 'rma1', 'rmi1', 'vma1', 'vmi1', 'rma2', 'rmi2', 'vma2', 'vmi2', 'rma3', 'rmi3', 'vma3', 'vmi3', 'ntp1', 'ntp2', 'ntp3', 'tab1', 'tab2', 'tab3', 'cod1', 'cod2', 'cod3', 'cont1', 'cont2', 'cont3', 'node1', 'node2', 'node3', 'cr1', 'cr2', 'cr3', 'cx1', 'cx2', 'cx3', 'cnxa1', 'cnxa2', 'cnxa3'],
    description: 'Transformer between two or three windings. Identified by bus numbers (ibus, jbus, kbus for 3-winding; kbus=0 for 2-winding) and circuit id (ckt). R/X and tap/settings define the model. NOTE: ckt is OPTIONAL - will be auto-generated if not provided.',
    keyDescriptions: {
      ibus: 'Winding 1 bus. Required for identifier.',
      jbus: 'Winding 2 bus. Required for identifier.',
      kbus: 'Winding 3 bus (0 if 2-winding). Required for identifier.',
      ckt: 'Circuit id. OPTIONAL - auto-generated if not provided.',
      r1_2: 'Resistance winding 1–2 (pu).',
      x1_2: 'Reactance winding 1–2 (pu).',
      sbase1_2: 'Base MVA winding 1–2.',
      r2_3: 'Resistance winding 2–3 (pu); used for 3-winding only.',
      x2_3: 'Reactance winding 2–3 (pu); used for 3-winding only.',
      sbase2_3: 'Base MVA winding 2–3; used for 3-winding only.',
      r3_1: 'Resistance winding 3–1 (pu); used for 3-winding only.',
      x3_1: 'Reactance winding 3–1 (pu); used for 3-winding only.',
      sbase3_1: 'Base MVA winding 3–1; used for 3-winding only.',
      windv1: 'Tap position winding 1.',
      windv2: 'Tap position winding 2.',
      windv3: 'Tap position winding 3; used for 3-winding only.',
      nomv1: 'Nominal voltage winding 1 (kV).',
      nomv2: 'Nominal voltage winding 2 (kV).',
      nomv3: 'Nominal voltage winding 3 (kV); used for 3-winding only.',
      ang1: 'Angle winding 1 (degrees).',
      ang2: 'Angle winding 2 (degrees).',
      ang3: 'Angle winding 3 (degrees); used for 3-winding only.',
      mag1: 'Magnitude winding 1.',
      mag2: 'Magnitude winding 2.',
      wdg1rate1: 'Winding 1 thermal rating 1 (MVA); wdg1rate2–wdg1rate12 are additional ratings.',
      wdg2rate1: 'Winding 2 thermal rating 1 (MVA); wdg2rate2–wdg2rate12 are additional ratings.',
      wdg3rate1: 'Winding 3 thermal rating 1 (MVA); wdg3rate2–wdg3rate12 are additional ratings; used for 3-winding only.',
      stat: 'Status: 0=in-service, 1=out.',
    },
    exampleIdentifier: { ibus: 1, jbus: 2, kbus: 0, ckt: '1' },
    exampleData: { r1_2: 0.0, x1_2: 0.1, windv1: 1.0, windv2: 1.0, stat: 1 },
    defaultValues: { r1_2: 0, x1_2: 0.1, sbase1_2: 100, windv1: 1.0, windv2: 1.0, windv3: 1.0, ang1: 0, ang2: 0, ang3: 0, stat: 1, cw: 1, cz: 1, cm: 1 },
  },
  fixshunt: {
    identifierKeys: ['ibus', 'shntid'],
    dataKeys: ['stat', 'gl', 'bl'],
    description: 'Fixed shunt capacitor/reactor at a bus. Identified by bus number (ibus) and shunt id (shntid). GL is conductance (MW at 1.0 pu voltage), BL is susceptance (Mvar at 1.0 pu voltage). Positive BL = capacitor, negative BL = reactor.',
    keyDescriptions: {
      ibus: 'Bus number. Required for identifier.',
      shntid: 'Shunt identifier string (e.g. "1"). OPTIONAL - defaults to "1".',
      stat: 'Status: 1=in-service, 0=out.',
      gl: 'Conductance (MW at 1.0 pu voltage).',
      bl: 'Susceptance (Mvar at 1.0 pu voltage). Positive = capacitor, negative = reactor.',
    },
    exampleIdentifier: { ibus: 106, shntid: '1' },
    exampleData: { stat: 1, gl: 0, bl: -40 },
    defaultValues: { stat: 1, gl: 0, bl: 0 },
  },
  swshunt: {
    identifierKeys: ['ibus', 'shntid'],
    dataKeys: ['modsw', 'adjm', 'stat', 'vswhi', 'vswlo', 'swreg', 'nreg', 'rmpct', 'rmidnt', 'binit', 's1', 'n1', 'b1', 's2', 'n2', 'b2', 's3', 'n3', 'b3', 's4', 'n4', 'b4', 's5', 'n5', 'b5', 's6', 'n6', 'b6', 's7', 'n7', 'b7', 's8', 'n8', 'b8'],
    description: 'Switched shunt for voltage control. Identified by bus number (ibus) and shunt id (shntid). Control mode (modsw) determines operation: 0=locked, 1=discrete, 2=continuous. Up to 8 blocks with status (s1-s8), steps (n1-n8), and susceptance (b1-b8).',
    keyDescriptions: {
      ibus: 'Bus number. Required for identifier.',
      shntid: 'Shunt identifier string (e.g. "1"). OPTIONAL - defaults to "1".',
      modsw: 'Control mode: 0=locked, 1=discrete, 2=continuous.',
      adjm: 'Adjustment method: 0=sequential, 1=next-best.',
      stat: 'Status: 1=in-service, 0=out.',
      vswhi: 'Upper voltage/reactive limit (pu or Mvar).',
      vswlo: 'Lower voltage/reactive limit (pu or Mvar).',
      swreg: 'Regulated bus number (0 = same as ibus).',
      nreg: 'Regulated bus node.',
      rmpct: 'Mvar contribution percentage (%).',
      rmidnt: 'Remote device name.',
      binit: 'Initial admittance (Mvar at 1.0 pu voltage).',
      s1: 'Block 1 status (0/1).',
      n1: 'Block 1 number of steps.',
      b1: 'Block 1 susceptance per step (Mvar).',
      s2: 'Block 2 status (0/1).',
      n2: 'Block 2 number of steps.',
      b2: 'Block 2 susceptance per step (Mvar).',
      s3: 'Block 3 status (0/1).',
      n3: 'Block 3 number of steps.',
      b3: 'Block 3 susceptance per step (Mvar).',
      s4: 'Block 4 status (0/1).',
      n4: 'Block 4 number of steps.',
      b4: 'Block 4 susceptance per step (Mvar).',
      s5: 'Block 5 status (0/1).',
      n5: 'Block 5 number of steps.',
      b5: 'Block 5 susceptance per step (Mvar).',
      s6: 'Block 6 status (0/1).',
      n6: 'Block 6 number of steps.',
      b6: 'Block 6 susceptance per step (Mvar).',
      s7: 'Block 7 status (0/1).',
      n7: 'Block 7 number of steps.',
      b7: 'Block 7 susceptance per step (Mvar).',
      s8: 'Block 8 status (0/1).',
      n8: 'Block 8 number of steps.',
      b8: 'Block 8 susceptance per step (Mvar).',
    },
    exampleIdentifier: { ibus: 106, shntid: '1' },
    exampleData: { modsw: 2, adjm: 0, stat: 1, vswhi: 1.0381, vswlo: 1.0381, swreg: 106, nreg: 0, rmpct: 100, binit: 0, s1: 1, n1: 5, b1: 100 },
    defaultValues: { modsw: 1, adjm: 0, stat: 1, vswhi: 1.05, vswlo: 0.95, swreg: 0, nreg: 0, rmpct: 100, rmidnt: '', binit: 0 },
  },
};

const SUPPORTED_ELEMENT_TYPES = Object.keys(ELEMENT_SCHEMAS);

/**
 * Get the schema for an element type: identifier keys, data keys, descriptions, and examples.
 * Use before getNetwork(elementType, identifier), modifyElement(elementType, identifier, data), or addElement(elementType, data).
 *
 * @param {string} elementType - One of: bus, load, generator, acline, transformer
 * @returns {{ elementType: string, identifierKeys: string[], dataKeys: string[], description?: string, keyDescriptions?: Record<string, string>, exampleIdentifier?: object, exampleData?: object, defaultValues?: object } | null}
 */
export function getElementSchema(elementType) {
  const normalized = String(elementType || '').toLowerCase().trim();
  const schema = ELEMENT_SCHEMAS[normalized];
  if (!schema) {
    return null;
  }
  return {
    elementType: normalized,
    identifierKeys: [...schema.identifierKeys],
    dataKeys: [...schema.dataKeys],
    ...(schema.description != null && { description: schema.description }),
    ...(schema.keyDescriptions != null && { keyDescriptions: { ...schema.keyDescriptions } }),
    ...(schema.exampleIdentifier != null && { exampleIdentifier: { ...schema.exampleIdentifier } }),
    ...(schema.exampleData != null && { exampleData: { ...schema.exampleData } }),
    ...(schema.defaultValues != null && { defaultValues: { ...schema.defaultValues } }),
  };
}

/**
 * Get list of supported element types.
 * @returns {string[]}
 */
export function getSupportedElementTypes() {
  return [...SUPPORTED_ELEMENT_TYPES];
}
