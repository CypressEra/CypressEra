/**
 * Context Menu Builder
 * Builds context menu items based on the clicked element or canvas state.
 * All user-facing labels use the provided t() for i18n.
 */

import { DiagramElement } from '../types';
import { MenuItem } from '../../../common/ContextMenu';
import type { SubMenuItem } from '../../../common/ContextMenu';

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface ContextMenuBuilderOptions {
  elements: Map<string, DiagramElement>;
  /** i18n translate function (e.g. from useTranslation). Required for multi-language support. */
  t: TranslateFn;
  hasData?: boolean; // Whether network data is loaded (regardless of element creation)
  onElementClick?: (element: DiagramElement) => void;
  onSelectionChange?: (elements: DiagramElement[]) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onExportPNG?: () => void;
  /** Open the diagram-library picker (Open → Diagram). */
  onOpenDiagram?: () => void;
  /** Save the current canvas to the user's diagram library (Save → Diagram). */
  onSaveDiagram?: () => void;
  /** True when at least one element is plotted — drives the enable state of
   *  Save Diagram so an empty save is impossible. */
  canSaveDiagram?: boolean;
  onPlotAllBuses?: () => void;
  onPlotSelectedBus?: () => void;
  onPlotBus?: (busNumber: number) => void; // Plot a specific bus (adds to plotted buses)
  onGrowBusConnections?: (busNumber: number) => void; // Open modal to grow by N away or to designated bus
  onFindShortestPath?: (busNumber: number | null) => void; // Open Find Shortest Path modal for this bus
  onFindNeighbourElements?: (busNumber: number | null) => void; // Open Find Neighbour Elements modal for this bus
  onHideElement?: (elementId: string) => void; // Remove element from diagram (hide + exclude from interaction)
  onDeleteElement?: (element: DiagramElement) => void; // Delete element from data (like network data table)
  onModifyElement?: (element: DiagramElement) => void; // Modify a specific element
  onAddGenerator?: (busNumber: number) => void; // Add generator to a bus
  onAddLoad?: (busNumber: number) => void; // Add load to a bus
  onAddAcline?: (busNumber: number) => void; // Add AC line with from bus pre-filled
  onAddFixedShunt?: (busNumber: number) => void; // Add fixed shunt to a bus
  onAddSwitchedShunt?: (busNumber: number) => void; // Add switched shunt to a bus
  // Add element callbacks (for canvas context menu)
  onAddElement?: (elementType: string) => void; // Add element of specified type
  onLocateBus?: () => void; // Open locate bus modal
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export class ContextMenuBuilder {
  private options: ContextMenuBuilderOptions;

  constructor(options: ContextMenuBuilderOptions) {
    this.options = options;
  }

  /**
   * Build context menu items for a given element or canvas
   */
  buildMenu(clickedElement: DiagramElement | null): MenuItem[] {
    const items: MenuItem[] = [];

    if (clickedElement) {
      this.buildElementMenu(clickedElement, items);
    } else {
      this.buildCanvasMenu(items);
    }

    return items;
  }

  private buildElementMenu(element: DiagramElement, items: MenuItem[]): void {
    const t = this.options.t;

    // Add Modify Element option
    items.push({
      id: 'modify-element',
      label: t('contextMenu.modifyElement'),
      action: () => {
        this.options.onModifyElement?.(element);
      },
    });

    // Add "Add Element" submenu and "Grow Bus Connections" for buses only
    if (element.type === 'bus') {
      const busData = element.data as { ibus?: number };
      if (busData.ibus !== undefined) {
        items.push({
          id: 'grow-bus-connections',
          label: t('contextMenu.growBusConnections'),
          action: () => {
            this.options.onGrowBusConnections?.(busData.ibus!);
          },
        });
        if (this.options.hasData) {
          items.push({
            id: 'find-shortest-path',
            label: t('contextMenu.findShortestPath'),
            action: () => {
              this.options.onFindShortestPath?.(busData.ibus!);
            },
          });
          items.push({
            id: 'find-neighbour-elements',
            label: t('contextMenu.findNeighbourElements'),
            action: () => {
              this.options.onFindNeighbourElements?.(busData.ibus!);
            },
          });
        }
        const submenuItems: SubMenuItem[] = [
          {
            id: 'add-generator',
            label: t('parameters:elementTypes.generator'),
            action: () => {
              this.options.onAddGenerator?.(busData.ibus!);
            },
          },
          {
            id: 'add-load',
            label: t('parameters:elementTypes.load'),
            action: () => {
              this.options.onAddLoad?.(busData.ibus!);
            },
          },
          {
            id: 'add-acline',
            label: t('parameters:elementTypes.acline'),
            action: () => {
              this.options.onAddAcline?.(busData.ibus!);
            },
          },
          {
            id: 'add-fixshunt',
            label: t('parameters:elementTypes.fixshunt'),
            action: () => {
              this.options.onAddFixedShunt?.(busData.ibus!);
            },
          },
          {
            id: 'add-swshunt',
            label: t('parameters:elementTypes.swshunt'),
            action: () => {
              this.options.onAddSwitchedShunt?.(busData.ibus!);
            },
          },
        ];
        items.push({
          id: 'add-element',
          label: t('contextMenu.addElement'),
          submenu: submenuItems,
        });
      }
    }

    // Remove from diagram (hide element and its connections so diagram is more concise)
    items.push({
      id: 'hide-element',
      label: t('contextMenu.removeFromDiagram'),
      action: () => {
        this.options.onHideElement?.(element.id);
      },
    });

    // Delete element from network data (same as delete in network data table)
    items.push({
      id: 'delete-element',
      label: t('contextMenu.deleteElement'),
      action: () => {
        this.options.onDeleteElement?.(element);
      },
    });
  }

  private buildCanvasMenu(items: MenuItem[]): void {
    const t = this.options.t;

    // Check if data is loaded (either via explicit flag or if elements exist)
    const hasData = this.options.hasData !== undefined 
      ? this.options.hasData 
      : this.options.elements.size > 0;

    if (hasData) {
      // Add "Add Element" submenu with all element types
      const addElementSubmenu: SubMenuItem[] = [
        {
          id: 'add-bus',
          label: t('parameters:elementTypes.bus'),
          action: () => {
            this.options.onAddElement?.('bus');
          },
        },
        {
          id: 'add-generator',
          label: t('parameters:elementTypes.generator'),
          action: () => {
            this.options.onAddElement?.('generator');
          },
        },
        {
          id: 'add-load',
          label: t('parameters:elementTypes.load'),
          action: () => {
            this.options.onAddElement?.('load');
          },
        },
        {
          id: 'add-acline',
          label: t('parameters:elementTypes.acline'),
          action: () => {
            this.options.onAddElement?.('acline');
          },
        },
        {
          id: 'add-transformer',
          label: t('parameters:elementTypes.transformer'),
          action: () => {
            this.options.onAddElement?.('transformer');
          },
        },
        {
          id: 'add-fixshunt',
          label: t('parameters:elementTypes.fixshunt'),
          action: () => {
            this.options.onAddElement?.('fixshunt');
          },
        },
        {
          id: 'add-swshunt',
          label: t('parameters:elementTypes.swshunt'),
          action: () => {
            this.options.onAddElement?.('swshunt');
          },
        },
      ];

      // Removed "Plot All Buses" context menu item per request
      // items.push({
      //   id: 'plot-all-buses',
      //   label: t('contextMenu.plotAllBuses'),
      //   action: () => {
      //     // Enable bus rendering
      //     this.options.onPlotAllBuses?.();
      //     // Also select all buses for visual feedback
      //     const busElements: DiagramElement[] = [];
      //     this.options.elements.forEach(element => {
      //       if (element.type === 'bus') {
      //         busElements.push(element);
      //       }
      //     });
      //     if (busElements.length > 0) {
      //       this.options.onSelectionChange?.(busElements);
      //     }
      //   },
      // });

      items.push({
        id: 'plot-selected-bus',
        label: t('contextMenu.plotSelectedBus'),
        action: () => {
          this.options.onPlotSelectedBus?.();
        },
      });

      items.push({
        id: 'locate-bus',
        label: t('contextMenu.locateBus'),
        action: () => {
          this.options.onLocateBus?.();
        },
      });

      items.push({
        id: 'find-shortest-path',
        label: t('contextMenu.findShortestPath'),
        action: () => {
          this.options.onFindShortestPath?.(null);
        },
      });

      items.push({
        id: 'find-neighbour-elements',
        label: t('contextMenu.findNeighbourElements'),
        action: () => {
          this.options.onFindNeighbourElements?.(null);
        },
      });

      items.push({ id: 'separator-1', label: '', separator: true });

      items.push({
        id: 'add-element',
        label: t('contextMenu.addElement'),
        submenu: addElementSubmenu,
      });
    } else {
      items.push({
        id: 'no-data',
        label: t('contextMenu.noData'),
        disabled: true,
      });
    }

    items.push({ id: 'separator-2', label: '', separator: true });

    items.push({
      id: 'zoom-in',
      label: t('contextMenu.zoomIn'),
      action: () => this.options.onZoomIn?.(),
    });

    items.push({
      id: 'zoom-out',
      label: t('contextMenu.zoomOut'),
      action: () => this.options.onZoomOut?.(),
    });

    items.push({
      id: 'reset-view',
      label: t('contextMenu.resetView'),
      action: () => this.options.onResetView?.(),
    });

    if (hasData) {
      items.push({
        id: 'export-png',
        label: t('contextMenu.exportPng'),
        action: () => this.options.onExportPNG?.(),
      });
    }

    // Diagram I/O — opens the file-selector for Open, uploads to the library
    // for Save. Always shown so users can load a diagram even before a model
    // is loaded (ghost render). Save is disabled when no element is plotted.
    items.push({ id: 'separator-diagram-io', label: '', separator: true });
    if (this.options.onOpenDiagram) {
      items.push({
        id: 'open-diagram',
        label: t('contextMenu.openDiagram', { defaultValue: 'Open Diagram…' }),
        action: () => this.options.onOpenDiagram?.(),
      });
    }
    if (this.options.onSaveDiagram) {
      items.push({
        id: 'save-diagram',
        label: t('contextMenu.saveDiagram', { defaultValue: 'Save Diagram' }),
        disabled: this.options.canSaveDiagram === false,
        action: () => this.options.onSaveDiagram?.(),
      });
    }
  }
}
