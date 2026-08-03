import type { BusWithHop, NeighbourElement } from '../NetworkDiagram/utils/graphAnalysisService';

export type GraphAnalysisResult =
  | {
      kind: 'shortestPath';
      sourceBus: number;
      targetBus: number;
      path: BusWithHop[];
    }
  | {
      kind: 'neighbourElements';
      sourceBus: number;
      n: number;
      elements: NeighbourElement[];
    }
  | {
      kind: 'noPath';
      sourceBus: number;
      targetBus: number;
    }
  | {
      kind: 'noElements';
      sourceBus: number;
      n: number;
    };
