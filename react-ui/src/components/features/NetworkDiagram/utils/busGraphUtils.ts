/**
 * Graph utilities for bus connectivity: N-hop neighborhood and path finding.
 */

export type GetNeighbors = (busNumber: number) => Set<number>;

/**
 * Returns the set of all bus numbers within N hops from startBus (BFS).
 * Includes startBus. Uses getNeighbors(bus) to get connected buses.
 */
export function getBusesWithinNAway(
  startBus: number,
  n: number,
  getNeighbors: GetNeighbors
): Set<number> {
  if (n < 1) {
    return new Set([startBus]);
  }
  const result = new Set<number>([startBus]);
  let currentLayer = new Set<number>([startBus]);
  for (let hop = 0; hop < n; hop++) {
    const nextLayer = new Set<number>();
    currentLayer.forEach((bus) => {
      getNeighbors(bus).forEach((neighbor) => {
        if (!result.has(neighbor)) {
          result.add(neighbor);
          nextLayer.add(neighbor);
        }
      });
    });
    currentLayer = nextLayer;
  }
  return result;
}

/**
 * Finds a shortest path from fromBus to toBus using BFS.
 * Returns the list of bus numbers along the path (including both endpoints), or null if no path exists.
 */
export function findPathBetweenBuses(
  fromBus: number,
  toBus: number,
  getNeighbors: GetNeighbors
): number[] | null {
  if (fromBus === toBus) {
    return [fromBus];
  }
  const visited = new Set<number>([fromBus]);
  const queue: { bus: number; path: number[] }[] = [{ bus: fromBus, path: [fromBus] }];
  let resultPath: number[] | null = null;
  while (queue.length > 0) {
    const { bus, path } = queue.shift()!;
    getNeighbors(bus).forEach((neighbor) => {
      if (neighbor === toBus) {
        resultPath = [...path, toBus];
      } else if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ bus: neighbor, path: [...path, neighbor] });
      }
    });
    if (resultPath) return resultPath;
  }
  return null;
}
