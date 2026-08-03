/**
 * Render Controller
 * Orchestrates the rendering of the NetworkDiagram
 */

import { CanvasRenderer } from '../renderers/CanvasRenderer';
import { DiagramElement, Transform, Bounds, ACLine, PowerFlowResults } from '../types';

export interface RenderControllerOptions {
  renderer: CanvasRenderer | null;
  elements: Map<string, DiagramElement>;
  edgeBundles: Map<string, any>;
  selectedElements: Set<string>;
  selectionBounds: Bounds | null;
  isResizing: boolean;
  mouseWorldPos?: { x: number; y: number } | null;
  busVoltages?: Map<number, number>;
  /** Element id under cursor; used to show bus resize handle on hover */
  hoveredElementId?: string | null;
  /** Power flow results for displaying flow values on lines */
  powerFlowResults?: PowerFlowResults;
  /** Whether to show flow values on lines */
  showFlowValues?: boolean;
  /** Buses to highlight for graph analysis results */
  highlightedBuses?: Map<number, 'source' | 'path' | 'neighbour'> | null;
}

export class RenderController {
  private options: RenderControllerOptions;

  constructor(options: RenderControllerOptions) {
    this.options = options;
  }

  /**
   * Perform a full render of the diagram
   */
  render(transform: Transform, logRendering: boolean = false): void {
    const { renderer } = this.options;

    if (!renderer) {
      if (logRendering) {
        console.log('[NetworkDiagram] No renderer, skipping render');
      }
      return;
    }

    // Clear canvas
    renderer.clear();

    // Draw grid
    if (logRendering) {
      console.log('[NetworkDiagram] Drawing grid');
    }
    renderer.drawGrid(transform);

    // Draw AC lines
    this.renderACLines(transform, logRendering);

    // Draw transformers
    this.renderTransformers(transform, logRendering);

    // Draw buses
    this.renderBuses(transform, logRendering);

    // Draw loads
    this.renderLoads(transform, logRendering);

    // Draw generators
    this.renderGenerators(transform, logRendering);

    // Draw fixed shunts
    this.renderFixedShunts(transform, logRendering);

    // Draw switched shunts
    this.renderSwitchedShunts(transform, logRendering);

    // Draw highlight rings for graph analysis results
    this.renderHighlightRings(transform);

    // Draw line endpoint handles (for dragging)
    if (this.options.mouseWorldPos) {
      renderer.drawLineEndpointHandles(
        this.options.elements,
        this.options.mouseWorldPos,
        transform
      );
    }

    // Draw selection rectangle
    if (this.options.selectionBounds) {
      renderer.drawSelectionRect(this.options.selectionBounds, transform);
    }

    if (logRendering) {
      console.log('[NetworkDiagram] Render complete');
    }
  }

  private renderACLines(transform: Transform, logRendering: boolean): void {
    let aclineCount = 0;
    const { powerFlowResults, showFlowValues = true } = this.options;

    // Create a map of power flow results for quick lookup
    const powerFlowMap = new Map<string, any>();
    if (powerFlowResults?.aclineResults) {
      for (const flow of powerFlowResults.aclineResults) {
        const key = flow.ckt
          ? `${flow.ibus}_${flow.jbus}_${flow.ckt}`
          : `${flow.ibus}_${flow.jbus}`;
        powerFlowMap.set(key, flow);
      }
    }

    const twotermdcFlowMap = new Map<string, { p_flow: number; p_loss?: number }>();
    if (powerFlowResults?.twotermdcResults) {
      for (const flow of powerFlowResults.twotermdcResults) {
        twotermdcFlowMap.set(`${flow.ipi}_${flow.ipr}`, { p_flow: flow.p_flow, p_loss: flow.p_loss });
      }
    }

    const vscdcFlowMap = new Map<string, { p_converter1: number; p_converter2: number; p_loss?: number; q_converter1?: number; q_converter2?: number }>();
    if (powerFlowResults?.vscdcResults) {
      for (const flow of powerFlowResults.vscdcResults) {
        vscdcFlowMap.set(`${flow.ibus1}_${flow.ibus2}`, {
          p_converter1: flow.p_converter1,
          p_converter2: flow.p_converter2,
          p_loss: flow.p_loss,
          q_converter1: flow.q_converter1,
          q_converter2: flow.q_converter2,
        });
      }
    }

    this.options.elements.forEach(element => {
      if (element.type === 'acline') {
        aclineCount++;
        const toPos = (element as any).toPos;
        if (toPos) {
          const lineData = element.data as ACLine & { ipi?: number; ipr?: number; elementType?: string };

          // Find power flow data for this line
          let powerFlowData;
          // Try with circuit ID first
          if (lineData.ckt) {
            powerFlowData = powerFlowMap.get(`${lineData.ibus}_${lineData.jbus}_${lineData.ckt}`);
          }
          // Fallback to without circuit ID
          if (!powerFlowData) {
            powerFlowData = powerFlowMap.get(`${lineData.ibus}_${lineData.jbus}`);
          }

          const isTwotermdc = lineData?.elementType === 'twotermdc' ||
            (typeof lineData?.ipi === 'number' && typeof lineData?.ipr === 'number');
          const isVscdc = lineData?.elementType === 'vscdc';

          const twotermdcFlowData = isTwotermdc && lineData.ipi != null && lineData.ipr != null
            ? twotermdcFlowMap.get(`${lineData.ipi}_${lineData.ipr}`)
            : undefined;

          const vscdcFlowData = isVscdc
            ? vscdcFlowMap.get(`${lineData.ibus}_${lineData.jbus}`)
            : undefined;

          this.options.renderer?.drawACLine(
            element.position,
            toPos,
            element.data as any,
            transform,
            this.options.selectedElements.has(element.id),
            false,
            {
              busVoltages: this.options.busVoltages,
              powerFlowData,
              showFlowValues,
              elementType: isTwotermdc ? 'twotermdc' : (isVscdc ? 'vscdc' : undefined),
              twotermdcFlowData,
              vscdcFlowData,
              unmodeled: !!element.unmodeled,
            }
          );
        }
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${aclineCount} AC lines`);
    }
  }

  private renderTransformers(transform: Transform, logRendering: boolean): void {
    let transformerCount = 0;
    const { powerFlowResults, showFlowValues = true } = this.options;

    // Create a map of transformer power flow results for quick lookup
    const transformerFlowMap = new Map<string, any>();
    if (powerFlowResults?.transformerResults) {
      for (const flow of powerFlowResults.transformerResults) {
        const key = flow.ckt
          ? `${flow.ibus}_${flow.jbus}_${flow.ckt}`
          : `${flow.ibus}_${flow.jbus}`;
        transformerFlowMap.set(key, flow);
      }
    }

    this.options.elements.forEach(element => {
      if (element.type === 'transformer' || element.type === 'transformer3w') {
        transformerCount++;
        const jBusPosition = (element as any).toPos;
        const kBusPosition = (element as any).kBusPosition;
        if (jBusPosition) {
          const transformerData = element.data as any;

          // Find power flow data for this transformer
          let powerFlowData;
          // Try with circuit ID first
          if (transformerData.ckt) {
            powerFlowData = transformerFlowMap.get(`${transformerData.ibus}_${transformerData.jbus}_${transformerData.ckt}`);
          }
          // Fallback to without circuit ID
          if (!powerFlowData) {
            powerFlowData = transformerFlowMap.get(`${transformerData.ibus}_${transformerData.jbus}`);
          }

          // For three-winding transformers, also try swapping ibus/jbus
          // (the power flow result might have buses in different order)
          const isThreeWinding = transformerData.kbus && transformerData.kbus > 0;
          if (!powerFlowData && isThreeWinding) {
            if (transformerData.ckt) {
              powerFlowData = transformerFlowMap.get(`${transformerData.jbus}_${transformerData.ibus}_${transformerData.ckt}`);
            }
            if (!powerFlowData) {
              powerFlowData = transformerFlowMap.get(`${transformerData.jbus}_${transformerData.ibus}`);
            }
          }

          this.options.renderer?.drawTransformer(
            element.position,
            jBusPosition,
            element.data,
            transform,
            this.options.selectedElements.has(element.id),
            false,
            kBusPosition,
            this.options.busVoltages,
            { powerFlowData, showFlowValues, unmodeled: !!element.unmodeled }
          );
        }
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${transformerCount} transformers`);
    }
  }

  private renderBuses(transform: Transform, logRendering: boolean): void {
    let busesDrawn = 0;
    const hoveredId = this.options.hoveredElementId ?? null;
    const { powerFlowResults } = this.options;

    // Create a map of bus power flow results for quick lookup
    const busFlowMap = new Map<number, any>();
    if (powerFlowResults?.busResults) {
      for (const flow of powerFlowResults.busResults) {
        busFlowMap.set(flow.ibus, flow);
      }
    }

    this.options.elements.forEach(element => {
      if (element.type === 'bus') {
        busesDrawn++;

        // Find power flow data for this bus
        const busNumber = element.data?.ibus;
        const powerFlowData = busNumber ? busFlowMap.get(busNumber) : undefined;

        this.options.renderer?.drawBus(
          element,
          transform,
          this.options.selectedElements.has(element.id),
          hoveredId === element.id,
          { powerFlowData, unmodeled: !!element.unmodeled }
        );
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${busesDrawn} buses`);
    }
  }

  private renderLoads(transform: Transform, logRendering: boolean): void {
    let loadsDrawn = 0;
    this.options.elements.forEach(element => {
      if (element.type === 'load') {
        loadsDrawn++;
        const deviceElement = element as any;
        // Get bus number from data.ibus since 'bus' property may not be set
        const busNumber = deviceElement.bus || element.data?.ibus;
        const busVoltage = busNumber ? this.options.busVoltages?.get(busNumber) : undefined;
        this.options.renderer?.drawLoad(
          element.position,
          element.data,
          transform,
          this.options.selectedElements.has(element.id),
          false,
          {
            connectedBusPosition: deviceElement.connectedBusPosition,
            mirrored: deviceElement.mirrored || false,
            busVoltage,
            unmodeled: !!element.unmodeled,
          }
        );
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${loadsDrawn} loads`);
    }
  }

  private renderGenerators(transform: Transform, logRendering: boolean): void {
    let generatorsDrawn = 0;
    this.options.elements.forEach(element => {
      if (element.type === 'generator') {
        generatorsDrawn++;
        const deviceElement = element as any;
        // Get bus number from data.ibus since 'bus' property may not be set
        const busNumber = deviceElement.bus || element.data?.ibus;
        const busVoltage = busNumber ? this.options.busVoltages?.get(busNumber) : undefined;
        this.options.renderer?.drawGenerator(
          element.position,
          element.data,
          transform,
          this.options.selectedElements.has(element.id),
          false,
          {
            connectedBusPosition: deviceElement.connectedBusPosition,
            mirrored: deviceElement.mirrored || false,
            busVoltage,
            unmodeled: !!element.unmodeled,
          }
        );
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${generatorsDrawn} generators`);
    }
  }

  private renderFixedShunts(transform: Transform, logRendering: boolean): void {
    let shuntsDrawn = 0;
    this.options.elements.forEach(element => {
      if (element.type === 'fixed_shunt') {
        shuntsDrawn++;
        const deviceElement = element as any;
        const busNumber = deviceElement.bus || element.data?.ibus;
        const busVoltage = busNumber ? this.options.busVoltages?.get(busNumber) : undefined;
        this.options.renderer?.drawFixedShunt(
          element.position,
          element.data,
          transform,
          this.options.selectedElements.has(element.id),
          false,
          {
            connectedBusPosition: deviceElement.connectedBusPosition,
            mirrored: deviceElement.mirrored || false,
            busVoltage,
            unmodeled: !!element.unmodeled,
          }
        );
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${shuntsDrawn} fixed shunts`);
    }
  }

  private renderSwitchedShunts(transform: Transform, logRendering: boolean): void {
    let shuntsDrawn = 0;
    this.options.elements.forEach(element => {
      if (element.type === 'switched_shunt') {
        shuntsDrawn++;
        const deviceElement = element as any;
        const busNumber = deviceElement.bus || element.data?.ibus;
        const busVoltage = busNumber ? this.options.busVoltages?.get(busNumber) : undefined;
        this.options.renderer?.drawSwitchedShunt(
          element.position,
          element.data,
          transform,
          this.options.selectedElements.has(element.id),
          false,
          {
            connectedBusPosition: deviceElement.connectedBusPosition,
            mirrored: deviceElement.mirrored || false,
            busVoltage,
            unmodeled: !!element.unmodeled,
          }
        );
      }
    });

    if (logRendering) {
      console.log(`[NetworkDiagram] Drew ${shuntsDrawn} switched shunts`);
    }
  }

  private renderHighlightRings(transform: Transform): void {
    const { highlightedBuses, renderer } = this.options;
    if (!highlightedBuses || highlightedBuses.size === 0 || !renderer) return;

    // Build a map of busNumber → world position from currently rendered bus elements
    const busPositions = new Map<number, { x: number; y: number }>();
    this.options.elements.forEach((element) => {
      if (element.type === 'bus') {
        const busNum = (element.data as any)?.ibus as number | undefined;
        if (busNum !== undefined) {
          busPositions.set(busNum, element.position);
        }
      }
    });

    // Use a fixed bus half-height in world units (matches the default in bus renderer)
    const BUS_HALF_HEIGHT = 30;
    renderer.drawHighlightRings(busPositions, highlightedBuses, BUS_HALF_HEIGHT, transform);
  }

  /**
   * Update the controller's options
   */
  updateOptions(options: Partial<RenderControllerOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
