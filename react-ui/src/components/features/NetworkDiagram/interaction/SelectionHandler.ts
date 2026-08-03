/**
 * Selection Handler
 * Manages element selection and lasso selection logic
 */

import { Point, Bounds, DiagramElement } from '../types';
import { findElementsInBounds, findElementAtPosition, normalizeBounds } from '../utils/elementUtils';

export class SelectionHandler {
  private elementsRef: React.MutableRefObject<Map<string, DiagramElement>>;

  constructor(elementsRef: React.MutableRefObject<Map<string, DiagramElement>>) {
    this.elementsRef = elementsRef;
  }

  /**
   * Find element at a given position
   */
  findElementAtPosition(worldPos: Point): DiagramElement | null {
    return findElementAtPosition(this.elementsRef.current, worldPos);
  }

  /**
   * Find elements within a selection bounds
   */
  findElementsInBounds(selectionStart: Point, currentPos: Point): DiagramElement[] {
    const width = currentPos.x - selectionStart.x;
    const height = currentPos.y - selectionStart.y;

    const selectionBounds = normalizeBounds({
      x: selectionStart.x,
      y: selectionStart.y,
      width,
      height,
    });

    return findElementsInBounds(this.elementsRef.current, selectionBounds);
  }

  /**
   * Calculate selection bounds from start and current positions
   */
  calculateSelectionBounds(selectionStart: Point, currentPos: Point): Bounds {
    const width = currentPos.x - selectionStart.x;
    const height = currentPos.y - selectionStart.y;

    return {
      x: width > 0 ? selectionStart.x : currentPos.x,
      y: height > 0 ? selectionStart.y : currentPos.y,
      width: Math.abs(width),
      height: Math.abs(height),
    };
  }

  /**
   * Get element IDs from an array of elements
   */
  getElementIds(elements: DiagramElement[]): string[] {
    return elements.map(el => el.id);
  }
}
