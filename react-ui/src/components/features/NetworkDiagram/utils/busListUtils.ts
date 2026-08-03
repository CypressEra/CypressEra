/**
 * Bus List Utilities
 * Utilities for processing and filtering bus lists for modular plotting
 */

import { Bus, ACLine, Transformer, InitialBusConfig } from '../types';

/**
 * Normalizes the bus list config to a Set of bus numbers
 */
export function normalizeBusListConfig(
  busList: number[] | InitialBusConfig | undefined
): Set<number> | undefined {
  if (!busList) {
    return undefined;
  }

  if (Array.isArray(busList)) {
    return new Set(busList);
  }

  if (busList.busNumbers) {
    return new Set(busList.busNumbers);
  }

  return undefined;
}

/**
 * Filters buses based on the provided bus list config
 * @param buses - All available buses
 * @param busList - Bus list configuration
 * @returns Filtered buses
 */
export function filterBusesByList(
  buses: Bus[],
  busList: number[] | InitialBusConfig | undefined
): Bus[] {
  const busNumbers = normalizeBusListConfig(busList);

  if (!busNumbers || busNumbers.size === 0) {
    return buses;
  }

  return buses.filter(bus => busNumbers.has(bus.ibus));
}

/**
 * Builds a neighbor map for bus connectivity
 */
export function buildNeighborMap(
  aclines: ACLine[],
  transformers: Transformer[]
): Map<number, Set<number>> {
  const neighborMap = new Map<number, Set<number>>();

  const addConnection = (fromBus: number, toBus: number) => {
    if (!neighborMap.has(fromBus)) {
      neighborMap.set(fromBus, new Set());
    }
    neighborMap.get(fromBus)!.add(toBus);
  };

  // Add AC line connections (bidirectional)
  aclines.forEach(line => {
    addConnection(line.ibus, line.jbus);
    addConnection(line.jbus, line.ibus);
  });

  // Add transformer connections (bidirectional)
  transformers.forEach(tf => {
    addConnection(tf.ibus, tf.jbus);
    addConnection(tf.jbus, tf.ibus);

    // 3-winding transformer
    if (tf.kbus && tf.kbus > 0) {
      addConnection(tf.ibus, tf.kbus);
      addConnection(tf.kbus, tf.ibus);
      addConnection(tf.jbus, tf.kbus);
      addConnection(tf.kbus, tf.jbus);
    }
  });

  return neighborMap;
}

/**
 * Gets buses within N hops for a list of start buses
 */
export function getBusesWithinHops(
  startBuses: number[],
  maxHops: number,
  neighborMap: Map<number, Set<number>>
): Set<number> {
  const result = new Set<number>();

  startBuses.forEach(startBus => {
    let currentLayer = new Set([startBus]);
    result.add(startBus);

    for (let hop = 0; hop < maxHops; hop++) {
      const nextLayer = new Set<number>();
      currentLayer.forEach(bus => {
        const neighbors = neighborMap.get(bus);
        if (neighbors) {
          neighbors.forEach(neighbor => {
            if (!result.has(neighbor)) {
              result.add(neighbor);
              nextLayer.add(neighbor);
            }
          });
        }
      });
      currentLayer = nextLayer;
    }
  });

  return result;
}

/**
 * Filters buses based on bus list config, optionally including connected buses
 */
export function filterBusesWithConnections(
  buses: Bus[],
  aclines: ACLine[],
  transformers: Transformer[],
  busList: number[] | InitialBusConfig | undefined
): Bus[] {
  const busNumbers = normalizeBusListConfig(busList);

  if (!busNumbers || busNumbers.size === 0) {
    return buses;
  }

  // Check if we should include connected buses
  const includeConnected = !Array.isArray(busList) && (busList as InitialBusConfig).includeConnectedBuses;
  const maxDepth = includeConnected ? ((busList as InitialBusConfig).maxConnectionDepth ?? 1) : 0;

  if (maxDepth === 0) {
    // Simple filtering without connections
    return buses.filter(bus => busNumbers.has(bus.ibus));
  }

  // Build neighbor map and include connected buses
  const neighborMap = buildNeighborMap(aclines, transformers);
  const busesWithConnections = getBusesWithinHops(
    Array.from(busNumbers),
    maxDepth,
    neighborMap
  );

  return buses.filter(bus => busesWithConnections.has(bus.ibus));
}

/**
 * Validates that bus numbers exist in the dataset
 */
export function validateBusNumbers(
  busNumbers: number[],
  availableBuses: Bus[]
): { valid: number[]; invalid: number[] } {
  const availableBusSet = new Set(availableBuses.map(b => b.ibus));
  const valid: number[] = [];
  const invalid: number[] = [];

  busNumbers.forEach(busNum => {
    if (availableBusSet.has(busNum)) {
      valid.push(busNum);
    } else {
      invalid.push(busNum);
    }
  });

  return { valid, invalid };
}

/**
 * Extracts bus numbers from an array of buses
 */
export function extractBusNumbers(buses: Bus[]): number[] {
  return buses.map(bus => bus.ibus);
}
