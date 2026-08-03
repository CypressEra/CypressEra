/**
 * Element Factory
 * Creates diagram elements from PSSE data
 */

import {
  Point,
  DiagramElement,
  Bus,
  ACLine,
  Transformer,
  TwoTerminalDC,
  Vscdc,
  Load,
  Generator,
  FixedShunt,
  SwitchedShunt,
} from '../types';

import {
  createBusElement,
  createLineElement,
  createTransformerElement,
  createLoadElement,
  createGeneratorElement,
  createFixedShuntElement,
  createSwitchedShuntElement,
} from '../renderers/elements';
import {
  calculateAutoGrowBusHeight,
  calculateBusBounds,
} from '../renderers/elements/bus';
import {
  createBusConnectionInfo,
  addConnectionToBus,
  recalculateBusConnectionPoints,
  getConnectionPointCoordinates,
  BusConnectionInfo,
  getConnectionPointWithDynamicY,
} from '../utils/busConnectionPoints';

export interface ElementFactoryOptions {
  // Bus options
  busHeight?: number;
  busWidth?: number;
  busHitboxPadding?: number;

  // Line options
  lineWidth?: number;
  lineLabelRadius?: number;

  // Transformer options
  transformerSize?: number;

  // Load options
  loadSize?: number;

  // Generator options
  generatorSize?: number;

  // Shunt options
  shuntSize?: number;

  // Device positioning
  deviceDistance: number;
  deviceStartAngle: number;
}

/**
 * Factory class for creating diagram elements
 */
export class ElementFactory {
  private options: ElementFactoryOptions;
  private busConnectionInfos: Map<string, BusConnectionInfo> = new Map();

  private static readonly DEFAULT_OPTIONS: ElementFactoryOptions = {
    busHeight: 90,  // Must match the bus renderer's busHeight
    busWidth: 6,    // Must match the bus renderer's busWidth
    busHitboxPadding: 5,
    lineWidth: 3,
    lineLabelRadius: 10,
    transformerSize: 20,
    loadSize: 20,
    generatorSize: 24,
    shuntSize: 20,
    deviceDistance: 40,
    deviceStartAngle: 135, // Starting angle for generators (top-left)
  };

  constructor(options: Partial<ElementFactoryOptions> = {}) {
    this.options = {
      ...ElementFactory.DEFAULT_OPTIONS,
      ...options,
    };
  }

  /**
   * Create a bus element
   */
  createBus(bus: Bus, position: Point): DiagramElement {
    return createBusElement(bus, position, {
      busHeight: this.options.busHeight,
      busWidth: this.options.busWidth,
      hitboxPadding: this.options.busHitboxPadding,
    });
  }

  /**
   * Create a line element (AC or DC / twotermdc)
   */
  createLine(line: ACLine, iBusPos: Point, jBusPos: Point, index: number, options?: { elementType?: string }): DiagramElement {
    return createLineElement(line, iBusPos, jBusPos, index, {
      lineWidth: this.options.lineWidth,
      labelRadius: this.options.lineLabelRadius,
      ...options,
    });
  }

  /**
   * Create a transformer element
   */
  createTransformer(xfm: Transformer, iBusPos: Point, jBusPos: Point, index: number, kBusPosition?: Point): DiagramElement {
    return createTransformerElement(xfm, iBusPos, jBusPos, index, {
      size: this.options.transformerSize,
      kBusPosition,
    });
  }

  /**
   * Create a load element positioned near a bus
   */
  createLoad(load: Load, busPosition: Point, index: number): DiagramElement {
    const angle = (index * 45 + 225) * (Math.PI / 180); // Start from bottom-left
    const distance = this.options.deviceDistance;
    const position = {
      x: busPosition.x + distance * Math.cos(angle),
      y: busPosition.y + distance * Math.sin(angle),
    };

    const element = createLoadElement(load, position, {
      size: this.options.loadSize,
    });
    // Store the connected bus position for drawing connection line
    (element as any).connectedBusPosition = { ...busPosition };
    // Set mirrored property if the element is on the right side of the bus
    (element as any).mirrored = position.x > busPosition.x;
    return element;
  }

  /**
   * Create a generator element positioned near a bus
   */
  createGenerator(gen: Generator, busPosition: Point, index: number): DiagramElement {
    const angle = (index * 45 + this.options.deviceStartAngle) * (Math.PI / 180);
    const distance = this.options.deviceDistance;
    const position = {
      x: busPosition.x + distance * Math.cos(angle),
      y: busPosition.y + distance * Math.sin(angle),
    };

    const element = createGeneratorElement(gen, position, {
      size: this.options.generatorSize,
    });
    // Store the connected bus position for drawing connection line
    (element as any).connectedBusPosition = { ...busPosition };
    // Set mirrored property if the element is on the right side of the bus
    (element as any).mirrored = position.x > busPosition.x;
    return element;
  }

  /**
   * Create a fixed shunt element positioned near a bus
   */
  createFixedShunt(shunt: FixedShunt, busPosition: Point, index: number): DiagramElement {
    // Use 315° (bottom-right) as start angle to avoid overlapping loads (225°) and generators (135°)
    const angle = (index * 45 + 315) * (Math.PI / 180);
    const distance = this.options.deviceDistance;
    const position = {
      x: busPosition.x + distance * Math.cos(angle),
      y: busPosition.y + distance * Math.sin(angle),
    };

    const element = createFixedShuntElement(shunt, position, {
      size: this.options.shuntSize,
    });
    (element as any).connectedBusPosition = { ...busPosition };
    (element as any).mirrored = position.x > busPosition.x;
    return element;
  }

  /**
   * Create a switched shunt element positioned near a bus
   */
  createSwitchedShunt(shunt: SwitchedShunt, busPosition: Point, index: number): DiagramElement {
    // Use 45° (top-right) as start angle to avoid overlapping loads (225°), generators (135°), and fixed shunts (315°)
    const angle = (index * 45 + 45) * (Math.PI / 180);
    const distance = this.options.deviceDistance;
    const position = {
      x: busPosition.x + distance * Math.cos(angle),
      y: busPosition.y + distance * Math.sin(angle),
    };

    const element = createSwitchedShuntElement(shunt, position, {
      size: this.options.shuntSize,
    });
    (element as any).connectedBusPosition = { ...busPosition };
    (element as any).mirrored = position.x > busPosition.x;
    return element;
  }

  /**
   * Create multiple bus elements
   */
  createBuses(buses: Bus[], positions: Map<number, Point>): Map<string, DiagramElement> {
    const elements = new Map<string, DiagramElement>();

    buses.forEach(bus => {
      const position = positions.get(bus.ibus);
      if (position) {
        const element = this.createBus(bus, position);
        elements.set(element.id, element);
      }
    });

    return elements;
  }

  /**
   * Create multiple line elements (AC or DC)
   */
  createLines(lines: ACLine[], positions: Map<number, Point>): Map<string, DiagramElement> {
    const elements = new Map<string, DiagramElement>();

    lines.forEach((line, index) => {
      // Include offline elements (stat === 0) in the plot with different styling
      const iBusPos = positions.get(line.ibus);
      const jBusPos = positions.get(line.jbus);
      if (!iBusPos || !jBusPos) return;

      const element = this.createLine(line, iBusPos, jBusPos, index);
      elements.set(element.id, element);
    });

    return elements;
  }

  /**
   * Create multiple transformer elements
   */
  createTransformers(transformers: Transformer[], positions: Map<number, Point>): Map<string, DiagramElement> {
    const elements = new Map<string, DiagramElement>();

    transformers.forEach((xfm, index) => {
      // Include offline elements (stat === 0) in the plot with different styling
      const iBusPos = positions.get(xfm.ibus);
      const jBusPos = positions.get(xfm.jbus);
      if (!iBusPos || !jBusPos) return;

      // For three-winding transformers, get the k bus position
      const kBusPosition = xfm.kbus && xfm.kbus > 0 ? positions.get(xfm.kbus) : undefined;

      const element = this.createTransformer(xfm, iBusPos, jBusPos, index, kBusPosition);
      elements.set(element.id, element);
    });

    return elements;
  }

  /**
   * Create multiple load elements
   */
  createLoads(loads: Load[], positions: Map<number, Point>): Map<string, DiagramElement> {
    const elements = new Map<string, DiagramElement>();
    const loadsByBus = new Map<number, Load[]>();

    // Group loads by bus
    loads?.forEach(load => {
      const busLoads = loadsByBus.get(load.ibus) || [];
      busLoads.push(load);
      loadsByBus.set(load.ibus, busLoads);
    });

    // Create elements
    loadsByBus.forEach((busLoads, busId) => {
      const busPosition = positions.get(busId);
      if (!busPosition) return;

      busLoads.forEach((load, index) => {
        const element = this.createLoad(load, busPosition, index);
        elements.set(element.id, element);
      });
    });

    return elements;
  }

  /**
   * Create multiple generator elements
   */
  createGenerators(generators: Generator[], positions: Map<number, Point>): Map<string, DiagramElement> {
    const elements = new Map<string, DiagramElement>();
    const generatorsByBus = new Map<number, Generator[]>();

    // Group generators by bus
    generators?.forEach(gen => {
      const busGens = generatorsByBus.get(gen.ibus) || [];
      busGens.push(gen);
      generatorsByBus.set(gen.ibus, busGens);
    });

    // Create elements
    generatorsByBus.forEach((busGens, busId) => {
      const busPosition = positions.get(busId);
      if (!busPosition) return;

      busGens.forEach((gen, index) => {
        const element = this.createGenerator(gen, busPosition, index);
        elements.set(element.id, element);
      });
    });

    return elements;
  }

  /**
   * Count connections for each bus
   * @param plottedBusNumbers - Optional set of bus numbers to include. If null, all buses are included.
   */
  private countBusConnections(
    buses: Bus[],
    aclines: ACLine[],
    transformers: Transformer[],
    loads?: Load[],
    generators?: Generator[],
    fixedShunts?: FixedShunt[],
    switchedShunts?: SwitchedShunt[],
    plottedBusNumbers?: Set<number> | null,
    twotermdc?: TwoTerminalDC[],
    vscdc?: Vscdc[]
  ): Map<number, number> {
    const connectionCounts = new Map<number, number>();

    // Initialize all buses with 0 connections
    buses.forEach(bus => {
      connectionCounts.set(bus.ibus, 0);
    });

    // Count AC line connections (each line connects to 2 buses)
    // Count a connection for a bus if that bus is plotted, regardless of whether the connected bus is plotted
    // Include offline elements (stat === 0) in connection counts
    aclines.forEach(line => {
      const iBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ibus);
      const jBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.jbus);
      // Count for each bus individually if it is plotted
      if (iBusPlotted) {
        connectionCounts.set(line.ibus, (connectionCounts.get(line.ibus) || 0) + 1);
      }
      if (jBusPlotted) {
        connectionCounts.set(line.jbus, (connectionCounts.get(line.jbus) || 0) + 1);
      }
    });

    // Count twotermdc connections (ipi, ipr)
    // Include offline elements (stat === 0) in connection counts
    (twotermdc || []).forEach(line => {
      const ipiPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ipi);
      const iprPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ipr);
      if (ipiPlotted) connectionCounts.set(line.ipi, (connectionCounts.get(line.ipi) || 0) + 1);
      if (iprPlotted) connectionCounts.set(line.ipr, (connectionCounts.get(line.ipr) || 0) + 1);
    });

    // Count VSC DC connections (ibus1, ibus2)
    // Include offline elements (stat === 0) in connection counts
    (vscdc || []).forEach(device => {
      const b1Plotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(device.ibus1);
      const b2Plotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(device.ibus2);
      if (b1Plotted) connectionCounts.set(device.ibus1, (connectionCounts.get(device.ibus1) || 0) + 1);
      if (b2Plotted) connectionCounts.set(device.ibus2, (connectionCounts.get(device.ibus2) || 0) + 1);
    });

    // Count transformer connections (each transformer connects to 2-3 buses)
    // Count a connection for a bus if that bus is plotted, regardless of whether the connected buses are plotted
    // Include offline elements (stat === 0) in connection counts
    transformers.forEach(xfm => {
      const iBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.ibus);
      const jBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.jbus);
      const kBusPlotted = xfm.kbus && xfm.kbus > 0 ? (plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.kbus)) : true;
      // Count for each bus individually if it is plotted
      if (iBusPlotted) {
        connectionCounts.set(xfm.ibus, (connectionCounts.get(xfm.ibus) || 0) + 1);
      }
      if (jBusPlotted) {
        connectionCounts.set(xfm.jbus, (connectionCounts.get(xfm.jbus) || 0) + 1);
      }
      if (xfm.kbus && xfm.kbus > 0 && kBusPlotted) {
        connectionCounts.set(xfm.kbus, (connectionCounts.get(xfm.kbus) || 0) + 1);
      }
    });

    // Count load connections (only if connected to plotted buses)
    // Include offline elements (status === 0) in connection counts
    loads?.forEach(load => {
      const busPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(load.ibus);
      if (busPlotted) {
        connectionCounts.set(load.ibus, (connectionCounts.get(load.ibus) || 0) + 1);
      }
    });

    // Count generator connections (only if connected to plotted buses)
    // Include offline elements (stat === 0) in connection counts
    generators?.forEach(gen => {
      const busPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(gen.ibus);
      if (busPlotted) {
        connectionCounts.set(gen.ibus, (connectionCounts.get(gen.ibus) || 0) + 1);
      }
    });

    // Count fixed shunt connections (only if connected to plotted buses)
    fixedShunts?.forEach(shunt => {
      const busPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(shunt.ibus);
      if (busPlotted) {
        connectionCounts.set(shunt.ibus, (connectionCounts.get(shunt.ibus) || 0) + 1);
      }
    });

    // Count switched shunt connections (only if connected to plotted buses)
    switchedShunts?.forEach(shunt => {
      const busPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(shunt.ibus);
      if (busPlotted) {
        connectionCounts.set(shunt.ibus, (connectionCounts.get(shunt.ibus) || 0) + 1);
      }
    });

    return connectionCounts;
  }

  /**
   * Create all elements from network data
   * @param plottedBusNumbers - Optional set of bus numbers to include. If null, all buses are included.
   */
  createAllElements(
    buses: Bus[],
    aclines: ACLine[],
    transformers: Transformer[],
    loads?: Load[],
    generators?: Generator[],
    positions?: Map<number, Point>,
    plottedBusNumbers?: Set<number> | null,
    twotermdc?: TwoTerminalDC[],
    vscdc?: Vscdc[],
    fixedShunts?: FixedShunt[],
    switchedShunts?: SwitchedShunt[]
  ): Map<string, DiagramElement> {
    const allElements = new Map<string, DiagramElement>();

    if (positions) {
      // Clear previous connection info
      this.busConnectionInfos.clear();

      // If a DC element exists between two buses (twotermdc or vscdc), prefer showing the DC representation only.
      // Build a set of unordered bus pairs that have DC, and filter out matching AC lines.
      const dcPairs = new Set<string>();
      (twotermdc || []).forEach(line => {
        const a = Math.min(line.ipi, line.ipr);
        const b = Math.max(line.ipi, line.ipr);
        dcPairs.add(`${a}_${b}`);
      });
      (vscdc || []).forEach(device => {
        const a = Math.min(device.ibus1, device.ibus2);
        const b = Math.max(device.ibus1, device.ibus2);
        dcPairs.add(`${a}_${b}`);
      });
      const aclinesForView = aclines.filter(line => {
        const a = Math.min(line.ibus, line.jbus);
        const b = Math.max(line.ibus, line.jbus);
        return !dcPairs.has(`${a}_${b}`);
      });

      // Count connections for each bus to determine auto-grow height
      const connectionCounts = this.countBusConnections(buses, aclinesForView, transformers, loads, generators, fixedShunts, switchedShunts, plottedBusNumbers, twotermdc, vscdc);

      // Create buses and initialize connection info with auto-grow height
      buses.forEach(bus => {
        const position = positions.get(bus.ibus);
        if (position) {
          // Calculate bus height based on connection count
          const connectionCount = connectionCounts.get(bus.ibus) || 0;
          const busHeight = calculateAutoGrowBusHeight(connectionCount);

          const element = this.createBus(bus, position);
          // Set the auto-calculated height on the element
          element.busHeight = busHeight;
          // Update bounds to match the new height
          element.bounds = calculateBusBounds(position, {
            busHeight,
            busWidth: this.options.busWidth,
            hitboxPadding: this.options.busHitboxPadding,
          });
          allElements.set(element.id, element);

          // Initialize connection info for this bus with the auto-calculated height
          const busInfo = createBusConnectionInfo(
            element.id,
            position,
            busHeight,
            this.options.busWidth
          );
          this.busConnectionInfos.set(element.id, busInfo);
        }
      });

      // First pass: add all connections to bus info
      // Only add connections that will be visible (both buses plotted)
      // Include offline elements (stat === 0) in the plot
      aclinesForView.forEach((line) => {
        // Only add connection points if both buses are plotted (line will be visible)
        const iBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ibus);
        const jBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.jbus);
        if (!iBusPlotted || !jBusPlotted) return;

        const fromBusId = `bus_${line.ibus}`;
        const toBusId = `bus_${line.jbus}`;
        const iBusPos = positions.get(line.ibus);
        const jBusPos = positions.get(line.jbus);
        if (!iBusPos || !jBusPos) return;

        const fromBusInfo = this.busConnectionInfos.get(fromBusId);
        const toBusInfo = this.busConnectionInfos.get(toBusId);
        if (fromBusInfo && toBusInfo) {
          addConnectionToBus(fromBusInfo, `acline_${line.ibus}_${line.jbus}_${line.ckt || 0}`, jBusPos);
          addConnectionToBus(toBusInfo, `acline_${line.ibus}_${line.jbus}_${line.ckt || 0}`, iBusPos);
        }
      });

      // Add twotermdc connections (ipi → ipr)
      // Include offline elements (stat === 0) in the plot
      (twotermdc || []).forEach((line, index) => {
        const ipiPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ipi);
        const iprPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ipr);
        if (!ipiPlotted || !iprPlotted) return;

        const fromBusId = `bus_${line.ipi}`;
        const toBusId = `bus_${line.ipr}`;
        const ipiPos = positions.get(line.ipi);
        const iprPos = positions.get(line.ipr);
        if (!ipiPos || !iprPos) return;

        const fromBusInfo = this.busConnectionInfos.get(fromBusId);
        const toBusInfo = this.busConnectionInfos.get(toBusId);
        const elementId = `twotermdc_${line.ipi}_${line.ipr}_${line.ckt ?? index}`;
        if (fromBusInfo && toBusInfo) {
          addConnectionToBus(fromBusInfo, elementId, iprPos);
          addConnectionToBus(toBusInfo, elementId, ipiPos);
        }
      });

      transformers.forEach((xfm) => {
        // Include offline elements (stat === 0) in the plot
        // Only add connection points if all buses are plotted (transformer will be visible)
        const iBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.ibus);
        const jBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.jbus);
        const kBusPlotted = xfm.kbus && xfm.kbus > 0 ? (plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.kbus)) : true;
        if (!iBusPlotted || !jBusPlotted || !kBusPlotted) return;

        const fromBusId = `bus_${xfm.ibus}`;
        const toBusId = `bus_${xfm.jbus}`;
        const kBusId = xfm.kbus && xfm.kbus > 0 ? `bus_${xfm.kbus}` : null;
        const iBusPos = positions.get(xfm.ibus);
        const jBusPos = positions.get(xfm.jbus);
        const kBusPos = xfm.kbus && xfm.kbus > 0 ? positions.get(xfm.kbus) : null;
        if (!iBusPos || !jBusPos) return;

        const fromBusInfo = this.busConnectionInfos.get(fromBusId);
        const toBusInfo = this.busConnectionInfos.get(toBusId);
        if (fromBusInfo && toBusInfo) {
          addConnectionToBus(fromBusInfo, `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || 0}`, jBusPos);
          addConnectionToBus(toBusInfo, `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || 0}`, iBusPos);
        }
        // Add connection for k bus if it exists
        if (xfm.kbus && xfm.kbus > 0 && kBusPos) {
          const kBusInfo = this.busConnectionInfos.get(kBusId!);
          if (kBusInfo) {
            addConnectionToBus(kBusInfo, `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || 0}`, iBusPos);
          }
        }
      });

      // Recalculate all connection points to distribute them evenly
      this.busConnectionInfos.forEach((busInfo) => {
        recalculateBusConnectionPoints(busInfo);
      });

      // Second pass: create line elements using calculated connection points
      // Include offline elements (stat === 0) in the plot
      aclinesForView.forEach((line, index) => {
        // Only create line elements if both buses are plotted
        const iBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ibus);
        const jBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.jbus);
        if (!iBusPlotted || !jBusPlotted) return;

        const fromBusId = `bus_${line.ibus}`;
        const toBusId = `bus_${line.jbus}`;
        const iBusPos = positions.get(line.ibus);
        const jBusPos = positions.get(line.jbus);
        if (!iBusPos || !jBusPos) return;

        const elementId = `acline_${line.ibus}_${line.jbus}_${line.ckt || index}`;

        // Get connection points
        const iBusConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(fromBusId)!,
          elementId
        );
        const jBusConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(toBusId)!,
          elementId
        );

        const element = this.createLine(
          line,
          iBusConnectionPoint || iBusPos,
          jBusConnectionPoint || jBusPos,
          index
        );
        allElements.set(element.id, element);
      });

      // Create twotermdc line elements (ipi → ipr, with thyristor symbols)
      // Include offline elements (stat === 0) in the plot
      (twotermdc || []).forEach((line, index) => {
        const ipiPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ipi);
        const iprPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(line.ipr);
        if (!ipiPlotted || !iprPlotted) return;

        const fromBusId = `bus_${line.ipi}`;
        const toBusId = `bus_${line.ipr}`;
        const ipiPos = positions.get(line.ipi);
        const iprPos = positions.get(line.ipr);
        if (!ipiPos || !iprPos) return;

        const elementId = `twotermdc_${line.ipi}_${line.ipr}_${line.ckt ?? index}`;
        const ipiConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(fromBusId)!,
          elementId
        );
        const iprConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(toBusId)!,
          elementId
        );

        // For twotermdc, duplicate ipi/ipr onto ibus/jbus so existing
        // line-handling (dragging, hit-testing, etc.) works consistently.
        const lineData = {
          ...(line as any),
          ibus: line.ipi,
          jbus: line.ipr,
          elementType: 'twotermdc',
        } as ACLine & { ipi: number; ipr: number; elementType: string };
        const element = this.createLine(
          lineData,
          ipiConnectionPoint || ipiPos,
          iprConnectionPoint || iprPos,
          index,
          { elementType: 'twotermdc' }
        );
        allElements.set(element.id, element);
      });

      // Create VSC DC line elements (ibus1 ↔ ibus2, with VSC converter symbols)
      // Include offline elements (stat === 0) in the plot
      (vscdc || []).forEach((device, index) => {
        const b1Plotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(device.ibus1);
        const b2Plotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(device.ibus2);
        if (!b1Plotted || !b2Plotted) return;

        const fromBusId = `bus_${device.ibus1}`;
        const toBusId = `bus_${device.ibus2}`;
        const b1Pos = positions.get(device.ibus1);
        const b2Pos = positions.get(device.ibus2);
        if (!b1Pos || !b2Pos) return;

        const elementId = `vscdc_${device.ibus1}_${device.ibus2}_${device.name ?? index}`;
        const b1ConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(fromBusId)!,
          elementId
        );
        const b2ConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(toBusId)!,
          elementId
        );

        // Map to ACLine-like data for renderer, plus elementType flag
        const lineData = {
          ...device,
          ibus: device.ibus1,
          jbus: device.ibus2,
          elementType: 'vscdc',
        } as ACLine & { elementType: string };

        const element = this.createLine(
          lineData,
          b1ConnectionPoint || b1Pos,
          b2ConnectionPoint || b2Pos,
          index,
          { elementType: 'vscdc' }
        );
        allElements.set(element.id, element);
      });

      transformers.forEach((xfm, index) => {
        // Include offline elements (stat === 0) in the plot
        // Only create transformer elements if all connected buses are plotted
        const iBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.ibus);
        const jBusPlotted = plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.jbus);
        const kBusPlotted = xfm.kbus && xfm.kbus > 0 ? (plottedBusNumbers === null || plottedBusNumbers === undefined || plottedBusNumbers.has(xfm.kbus)) : true;
        if (!iBusPlotted || !jBusPlotted || !kBusPlotted) return;

        const fromBusId = `bus_${xfm.ibus}`;
        const toBusId = `bus_${xfm.jbus}`;
        const iBusPos = positions.get(xfm.ibus);
        const jBusPos = positions.get(xfm.jbus);
        if (!iBusPos || !jBusPos) return;

        // For three-winding transformers, get the k bus position
        const kBusPosition = xfm.kbus && xfm.kbus > 0 ? positions.get(xfm.kbus) : undefined;
        const elementId = `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || index}`;

        // Get connection points
        const iBusConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(fromBusId)!,
          elementId
        );
        const jBusConnectionPoint = getConnectionPointCoordinates(
          this.busConnectionInfos.get(toBusId)!,
          elementId
        );

        const element = this.createTransformer(
          xfm,
          iBusConnectionPoint || iBusPos,
          jBusConnectionPoint || jBusPos,
          index,
          kBusPosition
        );
        allElements.set(element.id, element);
      });

      // Third pass: add loads and generators to connection tracking
      // Include offline elements (status === 0 / stat === 0) in the plot
      if (loads) {
        const loadsByBus = new Map<number, Load[]>();
        loads.forEach(load => {
          const busLoads = loadsByBus.get(load.ibus) || [];
          busLoads.push(load);
          loadsByBus.set(load.ibus, busLoads);
        });

        loadsByBus.forEach((busLoads, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);
          if (!busInfo) return;

          busLoads.forEach((load, index) => {
            // Calculate the actual load position to determine connection side
            const angle = (index * 45 + 225) * (Math.PI / 180);
            const distance = this.options.deviceDistance;
            const loadPos = {
              x: busPosition.x + distance * Math.cos(angle),
              y: busPosition.y + distance * Math.sin(angle),
            };
            addConnectionToBus(busInfo, `load_${load.ibus}_${load.loadid || 0}`, loadPos);
          });
        });
      }

      if (generators) {
        const generatorsByBus = new Map<number, Generator[]>();
        generators.forEach(gen => {
          const busGens = generatorsByBus.get(gen.ibus) || [];
          busGens.push(gen);
          generatorsByBus.set(gen.ibus, busGens);
        });

        generatorsByBus.forEach((busGens, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);
          if (!busInfo) return;

          busGens.forEach((gen, index) => {
            // Calculate the actual generator position to determine connection side
            const angle = (index * 45 + this.options.deviceStartAngle) * (Math.PI / 180);
            const distance = this.options.deviceDistance;
            const genPos = {
              x: busPosition.x + distance * Math.cos(angle),
              y: busPosition.y + distance * Math.sin(angle),
            };
            addConnectionToBus(busInfo, `gen_${gen.ibus}_${gen.machid || 0}`, genPos);
          });
        });
      }

      if (fixedShunts) {
        const shuntsByBus = new Map<number, FixedShunt[]>();
        fixedShunts.forEach(shunt => {
          const busShunts = shuntsByBus.get(shunt.ibus) || [];
          busShunts.push(shunt);
          shuntsByBus.set(shunt.ibus, busShunts);
        });

        shuntsByBus.forEach((busShunts, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);
          if (!busInfo) return;

          busShunts.forEach((shunt, index) => {
            const angle = (index * 45 + 315) * (Math.PI / 180);
            const distance = this.options.deviceDistance;
            const shuntPos = {
              x: busPosition.x + distance * Math.cos(angle),
              y: busPosition.y + distance * Math.sin(angle),
            };
            addConnectionToBus(busInfo, `fixed_shunt_${shunt.ibus}_${shunt.shntid || 0}`, shuntPos);
          });
        });
      }

      if (switchedShunts) {
        const shuntsByBus = new Map<number, SwitchedShunt[]>();
        switchedShunts.forEach(shunt => {
          const busShunts = shuntsByBus.get(shunt.ibus) || [];
          busShunts.push(shunt);
          shuntsByBus.set(shunt.ibus, busShunts);
        });

        shuntsByBus.forEach((busShunts, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);
          if (!busInfo) return;

          busShunts.forEach((shunt, index) => {
            const angle = (index * 45 + 45) * (Math.PI / 180);
            const distance = this.options.deviceDistance;
            const shuntPos = {
              x: busPosition.x + distance * Math.cos(angle),
              y: busPosition.y + distance * Math.sin(angle),
            };
            addConnectionToBus(busInfo, `switched_shunt_${shunt.ibus}_${shunt.swid || 0}`, shuntPos);
          });
        });
      }

      // Recalculate all connection points again to include devices
      this.busConnectionInfos.forEach((busInfo) => {
        recalculateBusConnectionPoints(busInfo);
      });

      // Fourth pass: create loads with connection points
      // Include offline elements (status === 0) in the plot
      if (loads) {
        const loadsByBus = new Map<number, Load[]>();
        loads.forEach(load => {
          const busLoads = loadsByBus.get(load.ibus) || [];
          busLoads.push(load);
          loadsByBus.set(load.ibus, busLoads);
        });

        loadsByBus.forEach((busLoads, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);

          busLoads.forEach((load, index) => {
            const loadId = `load_${load.ibus}_${load.loadid || 0}`;

            // Get the pre-calculated connection point for this load
            const connectionPoint = getConnectionPointCoordinates(busInfo!, loadId);

            if (connectionPoint) {
              // Position the load based on its connection point
              // Place it at a distance from the bus, at the same Y level as its connection point
              const side = connectionPoint.x < busPosition.x ? -1 : 1;
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + side * distance,
                y: connectionPoint.y, // Match the Y position of the connection point
              };

              const element = createLoadElement(load, position, {
                size: this.options.loadSize,
              });

              (element as any).connectedBusPosition = { ...connectionPoint };
              (element as any).mirrored = side > 0;

              allElements.set(element.id, element);
            } else {
              // Fallback to original positioning if connection point not found
              const angle = (index * 45 + 225) * (Math.PI / 180);
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + distance * Math.cos(angle),
                y: busPosition.y + distance * Math.sin(angle),
              };

              const element = createLoadElement(load, position, {
                size: this.options.loadSize,
              });

              if (busInfo) {
                const fallbackConnectionPoint = getConnectionPointWithDynamicY(
                  busInfo,
                  loadId,
                  busPosition,
                  position
                );
                (element as any).connectedBusPosition = fallbackConnectionPoint || busPosition;
              } else {
                (element as any).connectedBusPosition = busPosition;
              }

              (element as any).mirrored = position.x > busPosition.x;
              allElements.set(element.id, element);
            }
          });
        });
      }

      // Fifth pass: create generators with connection points
      // Include offline elements (stat === 0) in the plot
      if (generators) {
        const generatorsByBus = new Map<number, Generator[]>();
        generators.forEach(gen => {
          const busGens = generatorsByBus.get(gen.ibus) || [];
          busGens.push(gen);
          generatorsByBus.set(gen.ibus, busGens);
        });

        generatorsByBus.forEach((busGens, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);

          busGens.forEach((gen, index) => {
            const genId = `gen_${gen.ibus}_${gen.machid || 0}`;

            // Get the pre-calculated connection point for this generator
            const connectionPoint = getConnectionPointCoordinates(busInfo!, genId);

            if (connectionPoint) {
              // Position the generator based on its connection point
              // Place it at a distance from the bus, at the same Y level as its connection point
              const side = connectionPoint.x < busPosition.x ? -1 : 1;
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + side * distance,
                y: connectionPoint.y, // Match the Y position of the connection point
              };

              const element = createGeneratorElement(gen, position, {
                size: this.options.generatorSize,
              });

              (element as any).connectedBusPosition = { ...connectionPoint };
              (element as any).mirrored = side > 0;

              allElements.set(element.id, element);
            } else {
              // Fallback to original positioning if connection point not found
              const angle = (index * 45 + this.options.deviceStartAngle) * (Math.PI / 180);
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + distance * Math.cos(angle),
                y: busPosition.y + distance * Math.sin(angle),
              };

              const element = createGeneratorElement(gen, position, {
                size: this.options.generatorSize,
              });

              if (busInfo) {
                const fallbackConnectionPoint = getConnectionPointWithDynamicY(
                  busInfo,
                  genId,
                  busPosition,
                  position
                );
                (element as any).connectedBusPosition = fallbackConnectionPoint || busPosition;
              } else {
                (element as any).connectedBusPosition = busPosition;
              }

              (element as any).mirrored = position.x > busPosition.x;
              allElements.set(element.id, element);
            }
          });
        });
      }

      // Sixth pass: create fixed shunts with connection points
      // Include offline elements (stat === 0) in the plot
      if (fixedShunts) {
        const shuntsByBus = new Map<number, FixedShunt[]>();
        fixedShunts.forEach(shunt => {
          const busShunts = shuntsByBus.get(shunt.ibus) || [];
          busShunts.push(shunt);
          shuntsByBus.set(shunt.ibus, busShunts);
        });

        shuntsByBus.forEach((busShunts, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);

          busShunts.forEach((shunt, index) => {
            const shuntId = `fixed_shunt_${shunt.ibus}_${shunt.shntid || 0}`;
            const connectionPoint = getConnectionPointCoordinates(busInfo!, shuntId);

            if (connectionPoint) {
              const side = connectionPoint.x < busPosition.x ? -1 : 1;
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + side * distance,
                y: connectionPoint.y,
              };

              const element = createFixedShuntElement(shunt, position, {
                size: this.options.shuntSize,
              });

              (element as any).connectedBusPosition = { ...connectionPoint };
              (element as any).mirrored = side > 0;
              allElements.set(element.id, element);
            } else {
              const angle = (index * 45 + 315) * (Math.PI / 180);
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + distance * Math.cos(angle),
                y: busPosition.y + distance * Math.sin(angle),
              };

              const element = createFixedShuntElement(shunt, position, {
                size: this.options.shuntSize,
              });

              if (busInfo) {
                const fallbackConnectionPoint = getConnectionPointWithDynamicY(
                  busInfo,
                  shuntId,
                  busPosition,
                  position
                );
                (element as any).connectedBusPosition = fallbackConnectionPoint || busPosition;
              } else {
                (element as any).connectedBusPosition = busPosition;
              }

              (element as any).mirrored = position.x > busPosition.x;
              allElements.set(element.id, element);
            }
          });
        });
      }

      // Seventh pass: create switched shunts with connection points
      // Include offline elements (stat === 0) in the plot
      if (switchedShunts) {
        const shuntsByBus = new Map<number, SwitchedShunt[]>();
        switchedShunts.forEach(shunt => {
          const busShunts = shuntsByBus.get(shunt.ibus) || [];
          busShunts.push(shunt);
          shuntsByBus.set(shunt.ibus, busShunts);
        });

        shuntsByBus.forEach((busShunts, busId) => {
          const busPosition = positions.get(busId);
          if (!busPosition) return;

          const busInfo = this.busConnectionInfos.get(`bus_${busId}`);

          busShunts.forEach((shunt, index) => {
            const shuntId = `switched_shunt_${shunt.ibus}_${shunt.swid || 0}`;
            const connectionPoint = getConnectionPointCoordinates(busInfo!, shuntId);

            if (connectionPoint) {
              const side = connectionPoint.x < busPosition.x ? -1 : 1;
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + side * distance,
                y: connectionPoint.y,
              };

              const element = createSwitchedShuntElement(shunt, position, {
                size: this.options.shuntSize,
              });

              (element as any).connectedBusPosition = { ...connectionPoint };
              (element as any).mirrored = side > 0;
              allElements.set(element.id, element);
            } else {
              const angle = (index * 45 + 45) * (Math.PI / 180);
              const distance = this.options.deviceDistance;
              const position = {
                x: busPosition.x + distance * Math.cos(angle),
                y: busPosition.y + distance * Math.sin(angle),
              };

              const element = createSwitchedShuntElement(shunt, position, {
                size: this.options.shuntSize,
              });

              if (busInfo) {
                const fallbackConnectionPoint = getConnectionPointWithDynamicY(
                  busInfo,
                  shuntId,
                  busPosition,
                  position
                );
                (element as any).connectedBusPosition = fallbackConnectionPoint || busPosition;
              } else {
                (element as any).connectedBusPosition = busPosition;
              }

              (element as any).mirrored = position.x > busPosition.x;
              allElements.set(element.id, element);
            }
          });
        });
      }
    }

    return allElements;
  }

  /**
   * Get the bus connection infos (for use by NetworkDiagram during dragging)
   */
  getBusConnectionInfos(): Map<string, BusConnectionInfo> {
    return this.busConnectionInfos;
  }
}
