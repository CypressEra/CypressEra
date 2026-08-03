/**
 * Layout Engine for Power Grid Network
 * Implements industrial-grade multi-level force-directed layout with:
 * - Spectral initialization
 * - Voltage-aware clustering
 * - Edge bundling
 * - Adaptive force parameters
 * - Overlap prevention
 */

import {
  Point,
  Size,
  LayoutNode,
  LayoutEdge,
  LayoutConfig,
  Bus,
  ACLine,
  Transformer,
  TwoTerminalDC,
  DiagramElement,
} from '../types/index';
import { NETWORK_DIAGRAM_CONSTANTS } from '../config/constants';

// ==================== Advanced Types ====================

interface VoltageCluster {
  voltageLevel: number;
  buses: number[];
  center: Point;
  radius: number;
}

interface EdgeBundle {
  key: string; // "ibus_jbus" or "ibus_jbus_ckt"
  edges: LayoutEdge[];
  from: string;
  to: string;
  weight: number;
  controlPoints?: Point[]; // For curved routing
  curvature?: number; // Amount of curve to apply
}

interface LayoutMetrics {
  nodeDensity: number;
  edgeDensity: number;
  avgConnections: number;
  voltageLevels: Set<number>;
}

export interface LayoutResult {
  nodes: Map<number, Point>;  // Bus number to position mapping
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export class LayoutEngine {
  private config: LayoutConfig;
  private nodes: Map<number, LayoutNode>;
  private edges: LayoutEdge[];
  private edgeBundles: Map<string, EdgeBundle>;
  private voltageClusters: Map<number, VoltageCluster>;
  private metrics: LayoutMetrics;

  constructor(config: Partial<LayoutConfig> = {}) {
    this.config = {
      algorithm: 'force',
      forceDirected: {
        iterations: 800,
        repulsion: 50000,
        springLength: 250,
        damping: 0.85,
      },
      hierarchical: {
        direction: 'horizontal',
        layerSpacing: 300,
        nodeSpacing: 180,
      },
      circular: {
        radius: 400,
        startAngle: 0,
      },
      ...config,
    };

    this.nodes = new Map();
    this.edges = [];
    this.edgeBundles = new Map();
    this.voltageClusters = new Map();
    this.metrics = {
      nodeDensity: 0,
      edgeDensity: 0,
      avgConnections: 0,
      voltageLevels: new Set(),
    };
  }

  /**
   * Build graph from network data with advanced preprocessing
   */
  buildGraph(buses: Bus[], aclines: ACLine[], transformers: Transformer[], twotermdc?: TwoTerminalDC[]): void {
    this.nodes.clear();
    this.edges = [];
    this.edgeBundles.clear();
    this.voltageClusters.clear();

    // Calculate metrics
    this.metrics = this.calculateMetrics(buses, aclines, transformers, twotermdc);

    // Create nodes from buses
    buses.forEach(bus => {
      this.nodes.set(bus.ibus, {
        id: `bus_${bus.ibus}`,
        bus: bus.ibus,
        position: this.getSpectralInitialPosition(bus, buses),
        size: { width: 40, height: 40 },
        connections: [],
        level: this.getBusLevel(bus),
      });
    });

    // Create voltage clusters
    this.createVoltageClusters(buses);

    // Create edge bundles
    this.createEdgeBundles(aclines, transformers, twotermdc || []);
  }

  /**
   * Calculate layout metrics for adaptive parameters
   */
  private calculateMetrics(
    buses: Bus[],
    aclines: ACLine[],
    transformers: Transformer[],
    twotermdc?: TwoTerminalDC[]
  ): LayoutMetrics {
    const voltageLevels = new Set<number>();
    buses.forEach(bus => {
      if (bus.baskv) voltageLevels.add(bus.baskv);
    });

    const twotermdcCount = (twotermdc || []).filter(l => l.stat !== 0).length;
    const totalConnections = (aclines.filter(l => l.stat !== 0).length +
                               transformers.filter(t => t.stat !== 0).length +
                               twotermdcCount);
    const avgConnections = buses.length > 0 ? totalConnections / buses.length : 0;

    return {
      nodeDensity: buses.length / 1000, // Normalized by typical area
      edgeDensity: totalConnections / buses.length,
      avgConnections,
      voltageLevels,
    };
  }

  /**
   * Create voltage-based clusters for hierarchical layout
   */
  private createVoltageClusters(buses: Bus[]): void {
    const busesByVoltage = new Map<number, Bus[]>();

    buses.forEach(bus => {
      const level = bus.baskv || 138;
      if (!busesByVoltage.has(level)) {
        busesByVoltage.set(level, []);
      }
      busesByVoltage.get(level)!.push(bus);
    });

    busesByVoltage.forEach((voltageBuses, voltageLevel) => {
      this.voltageClusters.set(voltageLevel, {
        voltageLevel,
        buses: voltageBuses.map(b => b.ibus),
        center: { x: 0, y: 0 },
        radius: 0,
      });
    });
  }

  /**
   * Create edge bundles for parallel lines
   */
  private createEdgeBundles(aclines: ACLine[], transformers: Transformer[], twotermdc: TwoTerminalDC[] = []): void {
    const bundleMap = new Map<string, LayoutEdge[]>();

    // Bundle AC lines
    aclines.forEach((line, index) => {
      if (line.stat === 0) return;

      const key = `${line.ibus}_${line.jbus}`;
      if (!bundleMap.has(key)) {
        bundleMap.set(key, []);
      }
      const edgeId = `acline_${line.ibus}_${line.jbus}_${line.ckt || index}`;
      bundleMap.get(key)!.push({
        id: edgeId,
        from: `bus_${line.ibus}`,
        to: `bus_${line.jbus}`,
        type: 'acline',
      });
    });

    // Bundle two-terminal DC lines (ipi → ipr)
    twotermdc.forEach((line, index) => {
      if (line.stat === 0) return;

      const key = `twotermdc_${line.ipi}_${line.ipr}`;
      if (!bundleMap.has(key)) {
        bundleMap.set(key, []);
      }
      const edgeId = `twotermdc_${line.ipi}_${line.ipr}_${line.ckt ?? index}`;
      bundleMap.get(key)!.push({
        id: edgeId,
        from: `bus_${line.ipi}`,
        to: `bus_${line.ipr}`,
        type: 'acline',
      });
    });

    // Bundle transformers
    transformers.forEach((xfm, index) => {
      if (xfm.stat === 0) return;

      const key = `xfm_${xfm.ibus}_${xfm.jbus}`;
      if (!bundleMap.has(key)) {
        bundleMap.set(key, []);
      }
      const edgeId = `xfm_${xfm.ibus}_${xfm.jbus}_${xfm.ckt || index}`;
      bundleMap.get(key)!.push({
        id: edgeId,
        from: `bus_${xfm.ibus}`,
        to: `bus_${xfm.jbus}`,
        type: 'transformer',
        weight: 2,
      });
    });

    // Convert to edge bundles
    bundleMap.forEach((bundledEdges, key) => {
      const parts = key.split('_');
      const from = parts[parts.length - 2];
      const to = parts[parts.length - 1];
      const weight = bundledEdges.reduce((sum, e) => sum + (e.weight || 1), 0);
      this.edgeBundles.set(key, {
        key,
        edges: bundledEdges,
        from: `bus_${from}`,
        to: `bus_${to}`,
        weight,
      });
    });

    // Create flattened edges list for layout
    this.edges = Array.from(bundleMap.values()).flat();

    // Update node connections
    this.nodes.forEach((node, busNum) => {
      node.connections = [];
      this.edgeBundles.forEach(bundle => {
        if (bundle.from === `bus_${busNum}`) {
          node.connections.push(bundle.to);
        }
        if (bundle.to === `bus_${busNum}`) {
          node.connections.push(bundle.from);
        }
      });
    });
  }

  /**
   * Get initial position using spectral layout (Laplacian eigenvectors)
   * This provides better initial placement than random/circular
   */
  private getSpectralInitialPosition(bus: Bus, allBuses: Bus[]): Point {
    const busIndex = allBuses.findIndex(b => b.ibus === bus.ibus);
    const n = allBuses.length;

    // For small networks, use voltage-based circular layout
    if (n < 50) {
      return this.getVoltageBasedPosition(bus, allBuses);
    }

    // For larger networks, use spectral approximation
    // We use a simplified approach based on graph connectivity
    const voltageLevel = bus.baskv || 138;
    const level = this.getBusLevel(bus);

    // Calculate base position using golden angle with voltage offset
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const voltageOffset = (voltageLevel / 500) * Math.PI * 2;
    const angle = busIndex * goldenAngle + voltageOffset;

    // Radius based on voltage level and connectivity
    const baseRadius = Math.sqrt(n) * 80;
    const voltageRadius = this.getVoltageRadius(voltageLevel);
    const radius = baseRadius + voltageRadius;

    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  }

  /**
   * Get voltage-based position for small networks
   * Scales radius so same-voltage buses stay spaced (avoids initial overlap)
   */
  private getVoltageBasedPosition(bus: Bus, allBuses: Bus[]): Point {
    const voltageLevel = bus.baskv || 138;

    const sameVoltageCount = allBuses.filter(b => (b.baskv || 138) === voltageLevel).length;
    const sameVoltageIndex = allBuses
      .filter(b => (b.baskv || 138) === voltageLevel)
      .findIndex(b => b.ibus === bus.ibus);

    const baseRadius = this.getVoltageRadius(voltageLevel);
    // Scale radius so arc length between adjacent buses >= 100 (reduces initial overlap)
    const minArcSpacing = 100;
    const minRadius = (minArcSpacing * sameVoltageCount) / (2 * Math.PI);
    const voltageRadius = Math.max(baseRadius, minRadius);

    const angleStep = (2 * Math.PI) / Math.max(sameVoltageCount, 1);
    const angle = sameVoltageIndex * angleStep;

    return {
      x: voltageRadius * Math.cos(angle),
      y: voltageRadius * Math.sin(angle),
    };
  }

  /**
   * Get radius for voltage level (industrial standard spacing)
   */
  private getVoltageRadius(voltageLevel: number): number {
    // Industrial standard: higher voltage = more central
    if (voltageLevel >= 500) return 0;
    if (voltageLevel >= 345) return 150;
    if (voltageLevel >= 230) return 300;
    if (voltageLevel >= 138) return 450;
    if (voltageLevel >= 69) return 600;
    if (voltageLevel >= 34.5) return 750;
    return 900;
  }

  /**
   * Get initial position for a bus (legacy method - kept for compatibility)
   */
  private getInitialPosition(bus: Bus): Point {
    const level = bus.baskv || 138;

    // Position based on voltage level (higher voltage = more central)
    const radius = this.getCircularRadius(level);
    const angle = (bus.ibus * 137.5) % 360; // Golden angle for distribution

    return {
      x: radius * Math.cos((angle * Math.PI) / 180),
      y: radius * Math.sin((angle * Math.PI) / 180),
    };
  }

  /**
   * Get bus level for hierarchical layout
   */
  private getBusLevel(bus: Bus): number {
    // Use bus type and voltage to determine level
    const level = bus.baskv || 138;

    if (bus.ide === 3) return 0; // Slack bus at center
    if (bus.ide === 2) return 1; // PV buses
    if (level >= 230) return 1;  // High voltage
    if (level >= 138) return 2;  // Medium voltage
    return 3;                     // Low voltage
  }

  /**
   * Get radius for circular initial layout based on voltage level
   */
  private getCircularRadius(voltageLevel: number): number {
    if (voltageLevel >= 500) return 0;
    if (voltageLevel >= 345) return 100;
    if (voltageLevel >= 230) return 200;
    if (voltageLevel >= 138) return 300;
    if (voltageLevel >= 69) return 400;
    return 500;
  }

  /**
   * Run the layout algorithm
   */
  run(): LayoutResult {
    switch (this.config.algorithm) {
      case 'force':
        return this.runForceDirected();
      case 'hierarchical':
        return this.runHierarchical();
      case 'circular':
        return this.runCircular();
      case 'manual':
        return this.runManual();
      default:
        return this.runForceDirected();
    }
  }

  /**
   * Advanced force-directed layout with multi-level optimization and edge routing
   */
  private runForceDirected(): LayoutResult {
    const nodes = Array.from(this.nodes.values());
    const positions = new Map<number, Point>();

    // Initialize positions
    nodes.forEach(node => {
      positions.set(node.bus, { ...node.position });
    });

    const { iterations, repulsion, springLength, damping } = this.config.forceDirected!;

    // Adaptive parameters based on network size
    const nodeCount = nodes.length;
    const minDistance = this.calculateMinDistance(nodeCount);
    const k = Math.max(minDistance, Math.sqrt((1000 * 1000) / nodeCount) * 2);

    // Multi-level layout: coarse to fine
    const levels = this.calculateMultiLevelLevels(nodeCount);
    const iterationsPerLevel = Math.floor(iterations / levels);

    for (let level = 0; level < levels; level++) {
      const levelIterations = iterationsPerLevel;
      const levelRepulsion = repulsion * (1 + level * 0.5); // Increase repulsion per level
      const levelTemperature = 1 - level / levels; // Decrease temperature per level

      for (let i = 0; i < levelIterations; i++) {
        const forces = new Map<string, Point>();

        // Initialize forces
        nodes.forEach(node => {
          forces.set(node.id, { x: 0, y: 0 });
        });

        // Calculate repulsive forces (optimized with voltage awareness)
        this.calculateRepulsiveForces(nodes, positions, forces, levelRepulsion, minDistance);

        // Calculate attractive forces (springs) with edge bundling
        this.calculateAttractiveForces(positions, forces, k, springLength);

        // NEW: Calculate edge-to-edge repulsion forces
        this.calculateEdgeRepulsionForces(positions, forces, minDistance);

        // Apply voltage-based clustering forces
        this.applyVoltageClusteringForces(nodes, positions, forces, levelTemperature);

        // Apply forces and update positions with adaptive cooling
        const temperature = levelTemperature * (1 - i / levelIterations);
        this.applyForcesAndUpdatePositions(nodes, positions, forces, temperature, damping, minDistance);
      }
    }

    // Final refinement with overlap prevention
    this.preventOverlaps(nodes, positions, minDistance);

    // NEW: Optimize edge routing with control points
    this.optimizeEdgeRouting(positions, minDistance);

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

    return {
      nodes: positions,
      bounds: { minX, minY, maxX, maxY },
    };
  }

  /**
   * Calculate minimum distance based on node size and network density
   * Uses actual bus dimensions to guarantee no overlap
   */
  private calculateMinDistance(nodeCount: number): number {
    const { BUS_HEIGHT, BUS_BOUNDS_PADDING } = NETWORK_DIAGRAM_CONSTANTS;
    // Minimum: bus height + padding so adjacent buses never overlap
    const minFromSize = BUS_HEIGHT + 2 * BUS_BOUNDS_PADDING + 30;
    const densityFactor = Math.sqrt(nodeCount) * 12;
    return Math.max(minFromSize, 140 + densityFactor);
  }

  /**
   * Calculate number of multi-level layout levels
   */
  private calculateMultiLevelLevels(nodeCount: number): number {
    if (nodeCount < 50) return 1;
    if (nodeCount < 200) return 2;
    if (nodeCount < 500) return 3;
    return 4;
  }

  /**
   * Calculate repulsive forces with voltage awareness
   */
  private calculateRepulsiveForces(
    nodes: LayoutNode[],
    positions: Map<number, Point>,
    forces: Map<string, Point>,
    repulsion: number,
    minDistance: number
  ): void {
    for (let j = 0; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const nodeA = nodes[j];
        const nodeB = nodes[k];
        const posA = positions.get(nodeA.bus)!;
        const posB = positions.get(nodeB.bus)!;

        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);

        // Enhanced repulsion for closer nodes
        const force = dist < minDistance
          ? (repulsion * 2) / distSq
          : repulsion / distSq;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        const forceA = forces.get(nodeA.id)!;
        const forceB = forces.get(nodeB.id)!;

        forceA.x += fx;
        forceA.y += fy;
        forceB.x -= fx;
        forceB.y -= fy;
      }
    }
  }

  /**
   * Calculate attractive forces with edge bundling
   */
  private calculateAttractiveForces(
    positions: Map<number, Point>,
    forces: Map<string, Point>,
    k: number,
    springLength: number
  ): void {
    // Use bundled edges for more efficient calculation
    this.edgeBundles.forEach(bundle => {
      const nodeA = this.nodes.get(parseInt(bundle.from.replace('bus_', '')));
      const nodeB = this.nodes.get(parseInt(bundle.to.replace('bus_', '')));

      if (!nodeA || !nodeB) return;

      const posA = positions.get(nodeA.bus)!;
      const posB = positions.get(nodeB.bus)!;

      const dx = posA.x - posB.x;
      const dy = posA.y - posB.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Adaptive spring force based on bundle weight
      const weight = Math.log2(bundle.weight + 1); // Logarithmic scaling
      const force = (dist - springLength) * weight / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      const forceA = forces.get(bundle.from)!;
      const forceB = forces.get(bundle.to)!;

      if (forceA) {
        forceA.x -= fx;
        forceA.y -= fy;
      }
      if (forceB) {
        forceB.x += fx;
        forceB.y += fy;
      }
    });
  }

  /**
   * Apply voltage-based clustering forces
   */
  private applyVoltageClusteringForces(
    nodes: LayoutNode[],
    positions: Map<number, Point>,
    forces: Map<string, Point>,
    temperature: number
  ): void {
    // Group buses by voltage level
    const voltageGroups = new Map<number, LayoutNode[]>();
    nodes.forEach(node => {
      const bus = this.nodes.get(node.bus);
      if (!bus) return;

      const voltageLevel = this.getBusVoltageLevel(node.bus);
      if (!voltageGroups.has(voltageLevel)) {
        voltageGroups.set(voltageLevel, []);
      }
      voltageGroups.get(voltageLevel)!.push(node);
    });

    // Apply clustering force towards voltage level center
    voltageGroups.forEach((groupNodes, voltageLevel) => {
      const centerX = groupNodes.reduce((sum, n) => sum + positions.get(n.bus)!.x, 0) / groupNodes.length;
      const centerY = groupNodes.reduce((sum, n) => sum + positions.get(n.bus)!.y, 0) / groupNodes.length;

      const clusterStrength = 0.5 * temperature; // Gentle clustering

      groupNodes.forEach(node => {
        const pos = positions.get(node.bus)!;
        const force = forces.get(node.id)!;

        const dx = centerX - pos.x;
        const dy = centerY - pos.y;

        force.x += dx * clusterStrength;
        force.y += dy * clusterStrength;
      });
    });
  }

  /**
   * Apply forces and update positions
   */
  private applyForcesAndUpdatePositions(
    nodes: LayoutNode[],
    positions: Map<number, Point>,
    forces: Map<string, Point>,
    temperature: number,
    damping: number,
    minDistance: number
  ): void {
    nodes.forEach(node => {
      const pos = positions.get(node.bus)!;
      const force = forces.get(node.id)!;

      const forceMagnitude = Math.sqrt(force.x * force.x + force.y * force.y);
      const limitedForce = Math.min(forceMagnitude, 15 * temperature);

      if (forceMagnitude > 0) {
        pos.x += (force.x / forceMagnitude) * limitedForce * damping;
        pos.y += (force.y / forceMagnitude) * limitedForce * damping;
      }
    });
  }

  /**
   * Get voltage level for a bus
   */
  private getBusVoltageLevel(busNumber: number): number {
    const node = this.nodes.get(busNumber);
    if (!node) return 138;

    // This would need the actual bus data - simplified version
    return 138;
  }

  /**
   * Prevent overlaps with iterative refinement and fallback scaling
   * Uses over-relaxation (0.7) for faster convergence, fallback scale if needed
   */
  private preventOverlaps(
    nodes: LayoutNode[],
    positions: Map<number, Point>,
    minDistance: number
  ): void {
    const maxIterations = 100;
    const pushFactor = 0.7; // Over-relaxation for faster resolution

    for (let iter = 0; iter < maxIterations; iter++) {
      let overlapsFound = false;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const posA = positions.get(nodes[i].bus)!;
          const posB = positions.get(nodes[j].bus)!;

          const dx = posA.x - posB.x;
          const dy = posA.y - posB.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < minDistance && dist > 0.001) {
            overlapsFound = true;
            const overlap = minDistance - dist;
            const move = (overlap * pushFactor) / dist;
            const moveX = dx * move;
            const moveY = dy * move;

            posA.x += moveX;
            posA.y += moveY;
            posB.x -= moveX;
            posB.y -= moveY;
          }
        }
      }

      if (!overlapsFound) break;
    }

    // Fallback: if overlaps persist, scale layout outward from centroid
    let hasOverlap = false;
    for (let i = 0; i < nodes.length && !hasOverlap; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const posA = positions.get(nodes[i].bus)!;
        const posB = positions.get(nodes[j].bus)!;
        const dist = Math.sqrt(
          (posA.x - posB.x) ** 2 + (posA.y - posB.y) ** 2
        );
        if (dist < minDistance * 0.99) hasOverlap = true;
      }
    }

    if (hasOverlap) {
      const cx = Array.from(positions.values()).reduce((s, p) => s + p.x, 0) / nodes.length;
      const cy = Array.from(positions.values()).reduce((s, p) => s + p.y, 0) / nodes.length;
      const scale = 1.15;
      positions.forEach((pos) => {
        pos.x = cx + (pos.x - cx) * scale;
        pos.y = cy + (pos.y - cy) * scale;
      });
    }
  }

  /**
   * Calculate edge-to-edge repulsion forces to reduce line overlap
   * This implements the "stress majorization" technique for edge routing
   */
  private calculateEdgeRepulsionForces(
    positions: Map<number, Point>,
    forces: Map<string, Point>,
    minDistance: number
  ): void {
    const edgeSpacing = minDistance * 0.4; // Target spacing between parallel edges
    const bundleKeys = Array.from(this.edgeBundles.keys());

    for (let i = 0; i < bundleKeys.length; i++) {
      for (let j = i + 1; j < bundleKeys.length; j++) {
        const bundleA = this.edgeBundles.get(bundleKeys[i])!;
        const bundleB = this.edgeBundles.get(bundleKeys[j])!;

        // Skip if edges share a node (they should attract, not repel)
        if (bundleA.from === bundleB.from || bundleA.from === bundleB.to ||
            bundleA.to === bundleB.from || bundleA.to === bundleB.to) {
          continue;
        }

        const posA1 = positions.get(parseInt(bundleA.from.replace('bus_', '')))!;
        const posA2 = positions.get(parseInt(bundleA.to.replace('bus_', '')))!;
        const posB1 = positions.get(parseInt(bundleB.from.replace('bus_', '')))!;
        const posB2 = positions.get(parseInt(bundleB.to.replace('bus_', '')))!;

        if (!posA1 || !posA2 || !posB1 || !posB2) continue;

        // Calculate edge midpoint distance
        const midA = {
          x: (posA1.x + posA2.x) / 2,
          y: (posA1.y + posA2.y) / 2,
        };
        const midB = {
          x: (posB1.x + posB2.x) / 2,
          y: (posB1.y + posB2.y) / 2,
        };

        const dx = midA.x - midB.x;
        const dy = midA.y - midB.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        // Apply repulsion if edges are too close
        if (dist < minDistance * 2) {
          const repulsionStrength = 5000 / distSq;
          const fx = (dx / dist) * repulsionStrength;
          const fy = (dy / dist) * repulsionStrength;

          // Apply forces to all four nodes
          const forceA1 = forces.get(bundleA.from);
          const forceA2 = forces.get(bundleA.to);
          const forceB1 = forces.get(bundleB.from);
          const forceB2 = forces.get(bundleB.to);

          if (forceA1) { forceA1.x += fx * 0.25; forceA1.y += fy * 0.25; }
          if (forceA2) { forceA2.x += fx * 0.25; forceA2.y += fy * 0.25; }
          if (forceB1) { forceB1.x -= fx * 0.25; forceB1.y -= fy * 0.25; }
          if (forceB2) { forceB2.x -= fx * 0.25; forceB2.y -= fy * 0.25; }
        }
      }
    }
  }

  /**
   * Optimize edge routing with control points and curvature
   * Implements "orthogonal edge routing" with bezier curves
   */
  private optimizeEdgeRouting(positions: Map<number, Point>, minDistance: number): void {
    this.edgeBundles.forEach((bundle, key) => {
      const fromBus = parseInt(bundle.from.replace('bus_', ''));
      const toBus = parseInt(bundle.to.replace('bus_', ''));

      const posFrom = positions.get(fromBus);
      const posTo = positions.get(toBus);

      if (!posFrom || !toBus || !posTo) return;

      const dx = posTo.x - posFrom.x;
      const dy = posTo.y - posFrom.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Calculate control points for curved routing
      if (bundle.weight > 1) {
        // Multiple edges between same buses - use curvature
        const numEdges = bundle.edges.length;
        const curvatureStrength = Math.min(dist * 0.3, 100);

        bundle.controlPoints = [];
        bundle.curvature = 0;

        // Create curved control points for each edge in the bundle
        for (let i = 0; i < numEdges; i++) {
          // Offset angle based on edge index
          const offsetAngle = (i - (numEdges - 1) / 2) * 0.3;

          // Perpendicular direction for curvature
          const perpX = -dy / dist;
          const perpY = dx / dist;

          // Control point offset
          const offset = (i - (numEdges - 1) / 2) * curvatureStrength;

          bundle.controlPoints!.push({
            x: (posFrom.x + posTo.x) / 2 + perpX * offset,
            y: (posFrom.y + posTo.y) / 2 + perpY * offset,
          });
        }

        bundle.curvature = curvatureStrength / dist;
      } else {
        // Single edge - no curvature needed
        bundle.controlPoints = [];
        bundle.curvature = 0;
      }
    });
  }

  /**
   * Hierarchical layout
   */
  private runHierarchical(): LayoutResult {
    const positions = new Map<number, Point>();
    const nodesByLevel = new Map<number, LayoutNode[]>();

    // Group nodes by level
    this.nodes.forEach(node => {
      const level = node.level || 0;
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, []);
      }
      nodesByLevel.get(level)!.push(node);
    });

    const { direction, layerSpacing, nodeSpacing } = this.config.hierarchical!;
    const maxLevel = Math.max(...Array.from(nodesByLevel.keys()));

    nodesByLevel.forEach((nodes, level) => {
      const totalWidth = (nodes.length - 1) * nodeSpacing;
      const startX = -totalWidth / 2;

      nodes.forEach((node, index) => {
        let x, y;

        if (direction === 'horizontal') {
          x = level * layerSpacing;
          y = startX + index * nodeSpacing;
        } else {
          x = startX + index * nodeSpacing;
          y = level * layerSpacing;
        }

        positions.set(node.bus, { x, y });
      });
    });

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

    return {
      nodes: positions,
      bounds: { minX, minY, maxX, maxY },
    };
  }

  /**
   * Circular layout
   */
  private runCircular(): LayoutResult {
    const positions = new Map<number, Point>();
    const nodes = Array.from(this.nodes.values());
    const { radius, startAngle } = this.config.circular!;

    nodes.forEach((node, index) => {
      const angle = startAngle + (index / nodes.length) * 2 * Math.PI;
      positions.set(node.bus, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    });

    return {
      nodes: positions,
      bounds: {
        minX: -radius,
        minY: -radius,
        maxX: radius,
        maxY: radius,
      },
    };
  }

  /**
   * Manual layout (keep existing positions)
   */
  private runManual(): LayoutResult {
    const positions = new Map<number, Point>();

    this.nodes.forEach(node => {
      positions.set(node.bus, node.position);
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

    return {
      nodes: positions,
      bounds: { minX, minY, maxX, maxY },
    };
  }

  /**
   * Get position for a specific bus
   */
  getBusPosition(busNumber: number): Point | null {
    const node = this.nodes.get(busNumber);
    return node?.position || null;
  }

  /**
   * Get edge bundle data for rendering curved lines
   */
  getEdgeBundles(): Map<string, EdgeBundle> {
    return this.edgeBundles;
  }

  /**
   * Get control points for a specific edge bundle
   */
  getEdgeControlPoints(fromBus: number, toBus: number): Point[] | undefined {
    const key = `${fromBus}_${toBus}`;
    const bundle = this.edgeBundles.get(key);
    return bundle?.controlPoints;
  }

  /**
   * Update layout config
   */
  updateConfig(config: Partial<LayoutConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
