import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PowerFlowApp, ELEMENT_TYPES } from '../../../sdk';
import { ParameterEditorModal, ParameterCategory, ContextMenu, MenuItem, AlertModal } from '../../common';
import { ELEMENT_IDENTIFIERS, getParameterCategories } from '../../../parameters';
import { useUndoRedo } from '../../../hooks';
import { aggregateNetworkData } from '../../../sdk/utils/dataAggregator';
import type { NetworkDiagramRef } from '../NetworkDiagram';
import type { NetworkViewType } from '../NetworkView/NetworkView';
import './NetworkDataTable.css';

interface NetworkDataTableProps {
  networkData?: any; // Original network data without power flow results
  powerFlowData?: any; // Power flow calculation results (separate from network data)
  onDataUpdated?: () => void;
  onUndoRedoReady?: (handlers: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void;
  triggerLoadFile?: () => void; // Callback to trigger file load dialog
  diagramRef?: React.RefObject<NetworkDiagramRef | null>; // Ref to access diagram methods
  onViewChange?: (viewType: NetworkViewType) => void; // Callback to switch to diagram view
  onFindShortestPath?: (busNumber: number | null) => void;
  onFindNeighbourElements?: (busNumber: number | null) => void;
}

const ROW_HEIGHT = 32; // Height of each row in pixels
const HEADER_HEIGHT = 40; // Height of the header row in pixels
const BUFFER_SIZE = 30; // Number of extra rows to render above/below viewport
const VIRTUAL_SCROLL_THRESHOLD = 500; // Only use virtual scrolling for datasets larger than this

// Define proper field order for main element types (matches rawx/Rust struct definition)
const FIELD_ORDERS: Record<string, string[]> = {
  bus: ['ibus', 'name', 'baskv', 'ide', 'area', 'zone', 'owner', 'vm', 'va', 'nvhi', 'nvlo', 'evhi', 'evlo'],
  load: ['ibus', 'loadid', 'stat', 'area', 'zone', 'pl', 'ql', 'ip', 'iq', 'yp', 'yq', 'owner', 'scale', 'intrpt'],
  generator: ['ibus', 'machid', 'pg', 'qg', 'qt', 'qb', 'vs', 'ireg', 'mbase', 'zr', 'zx', 'rt', 'xt', 'gtap', 'stat', 'rmpct', 'pt', 'pb', 'o1', 'f1', 'o2', 'f2', 'o3', 'f3', 'o4', 'f4', 'wmod', 'wpf'],
  acline: ['ibus', 'jbus', 'ckt', 'p_flow', 'q_flow', 's_flow', 'p_loss', 'q_loss', 's_loss', 'rpu', 'xpu', 'bpu', 'name', 'rate1', 'rate2', 'rate3', 'rate4', 'rate5', 'rate6', 'rate7', 'rate8', 'rate9', 'rate10', 'rate11', 'rate12', 'gi', 'bi', 'gj', 'bj', 'stat', 'met', 'len', 'o1', 'f1', 'o2', 'f2', 'o3', 'f3', 'o4', 'f4'],
  transformer: ['ibus', 'jbus', 'kbus', 'ckt', 'p_flow_1', 'q_flow_1', 's_flow_1', 'p_loss_1', 'q_loss_1', 's_loss_1', 'p_flow_2', 'q_flow_2', 's_flow_2', 'p_loss_2', 'q_loss_2', 's_loss_2', 'p_flow_3', 'q_flow_3', 's_flow_3', 'p_loss_3', 'q_loss_3', 's_loss_3', 'cw', 'cz', 'cm', 'mag1', 'mag2', 'nmet', 'name', 'stat', 'o1', 'f1', 'o2', 'f2', 'o3', 'f3', 'o4', 'f4', 'vecgrp', 'zcod', 'r1_2', 'x1_2', 'sbase1_2', 'r2_3', 'x2_3', 'sbase2_3', 'r3_1', 'x3_1', 'sbase3_1', 'vmstar', 'anstar', 'windv1', 'nomv1', 'ang1', 'wdg1rate1', 'wdg1rate2', 'wdg1rate3', 'wdg1rate4', 'wdg1rate5', 'wdg1rate6', 'wdg1rate7', 'wdg1rate8', 'wdg1rate9', 'wdg1rate10', 'wdg1rate11', 'wdg1rate12', 'cod1', 'cont1', 'node1', 'rma1', 'rmi1', 'vma1', 'vmi1', 'ntp1', 'tab1', 'cr1', 'cx1', 'cnxa1', 'windv2', 'nomv2', 'ang2', 'wdg2rate1', 'wdg2rate2', 'wdg2rate3', 'wdg2rate4', 'wdg2rate5', 'wdg2rate6', 'wdg2rate7', 'wdg2rate8', 'wdg2rate9', 'wdg2rate10', 'wdg2rate11', 'wdg2rate12', 'cod2', 'cont2', 'node2', 'rma2', 'rmi2', 'vma2', 'vmi2', 'ntp2', 'tab2', 'cr2', 'cx2', 'cnxa2', 'windv3', 'nomv3', 'ang3', 'wdg3rate1', 'wdg3rate2', 'wdg3rate3', 'wdg3rate4', 'wdg3rate5', 'wdg3rate6', 'wdg3rate7', 'wdg3rate8', 'wdg3rate9', 'wdg3rate10', 'wdg3rate11', 'wdg3rate12', 'cod3', 'cont3', 'node3', 'rma3', 'rmi3', 'vma3', 'vmi3', 'ntp3', 'tab3', 'cr3', 'cx3', 'cnxa3'],
  twotermdc: ['ipi', 'ipr', 'p_flow', 'p_loss', 'name', 'mdc', 'rdc', 'setvl', 'vschd', 'vcmod', 'rcomp', 'delti', 'met', 'dcvmin', 'cccitmx', 'cccacc', 'nbr', 'anmxr', 'anmnr', 'rcr', 'xcr', 'ebasr', 'trr', 'tapr', 'tmxr', 'tmnr', 'stpr', 'icr', 'ndr', 'ifr', 'itr', 'idr', 'xcapr', 'nbi', 'anmxi', 'anmni', 'rci', 'xci', 'ebasi', 'tri', 'tapi', 'tmxi', 'tmni', 'stpi', 'ici', 'ndi', 'ifi', 'iti', 'idi', 'xcapi'],
  fixshunt: ['ibus', 'shntid', 'p', 'q', 'stat', 'gl', 'bl'],
  swshunt: ['ibus', 'shntid', 'q', 'modsw', 'adjm', 'stat', 'vswhi', 'vswlo', 'swreg', 'nreg', 'rmpct', 'rmidnt', 'binit', 's1', 'n1', 'b1', 's2', 'n2', 'b2', 's3', 'n3', 'b3', 's4', 'n4', 'b4', 's5', 'n5', 'b5', 's6', 'n6', 'b6', 's7', 'n7', 'b7', 's8', 'n8', 'b8'],
  vscdc: ['ibus1', 'ibus2', 'p_converter1', 'p_converter2', 'p_loss', 'q_converter1', 'q_converter2'],
};

export const NetworkDataTable = React.memo<NetworkDataTableProps>(({
  networkData,
  powerFlowData,
  onDataUpdated,
  onUndoRedoReady,
  triggerLoadFile,
  diagramRef,
  onViewChange,
  onFindShortestPath,
  onFindNeighbourElements,
}) => {
  const { t } = useTranslation();
  const [selectedElement, setSelectedElement] = useState<string>('bus');
  const [scrollTop, setScrollTop] = useState(0);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const headerRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const [truncatedFields, setTruncatedFields] = useState<Set<string>>(new Set());
  
  // Edit state management
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [changes, setChanges] = useState<Map<string, Map<string, any>>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Undo/Redo functionality
  const {
    canUndo,
    canRedo,
    trackEdit,
    undo,
    redo,
    clearHistory,
    setChanges: syncChanges,
  } = useUndoRedo({
    maxHistorySize: 50,
    mergeTimeWindow: 2000,
  });

  // Sync changes Map with undo/redo manager when changes update
  useEffect(() => {
    syncChanges(changes);
  }, [changes, syncChanges]);
  
  // Parameter editor modal state
  const [isParamEditorOpen, setIsParamEditorOpen] = useState(false);
  const [selectedRowData, setSelectedRowData] = useState<any>(null);
  const [paramCategories, setParamCategories] = useState<ParameterCategory[]>([]);
  const [paramEditorMode, setParamEditorMode] = useState<'modify' | 'add'>('modify');
  
  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    rowIdx: number | null;
    identifier: Record<string, any> | null;
    elementInfo: string;
  }>({
    isOpen: false,
    rowIdx: null,
    identifier: null,
    elementInfo: '',
  });
  
  // Notification state
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  // Context menu state
  const [contextMenuState, setContextMenuState] = useState<{
    isOpen: boolean;
    position: { x: number; y: number } | null;
    items: MenuItem[];
  }>({
    isOpen: false,
    position: null,
    items: [],
  });

  // Memoize network data fields per element type to avoid repeated checks
  const networkDataFields = useMemo(() => {
    if (!networkData) return new Map<string, Set<string>>();
    
    const fieldsMap = new Map<string, Set<string>>();
    const elementTypes = Object.keys(networkData.network_data || networkData);
    
    elementTypes.forEach(elementType => {
      const elementData = networkData.network_data?.[elementType] || (networkData as any)[elementType];
      if (elementData && Array.isArray(elementData) && elementData.length > 0) {
        const firstRow = elementData[0];
        if (firstRow && typeof firstRow === 'object') {
          fieldsMap.set(elementType, new Set(Object.keys(firstRow)));
        }
      }
    });
    
    return fieldsMap;
  }, [networkData]);

  // Combine networkData and powerFlowData for display (but keep them separate for editability checks)
  const displayData = useMemo(() => {
    if (!networkData) return null;
    
    // If no power flow data, return network data as-is
    if (!powerFlowData) {
      // Handle different data formats (network_data wrapper or direct network object)
      if (networkData.network_data) return networkData.network_data;
      if (networkData.network) return networkData;
      return networkData;
    }
    
    // Combine network data with power flow results for display
    const calculationResultForDisplay = {
      results: {
        converged: powerFlowData.converged,
        solution_time_ms: powerFlowData.solution_time_ms,
        iterations: powerFlowData.iterations || 0,
        bus_results: powerFlowData.bus_results,
        generator_results: powerFlowData.generator_results,
        fixshunt_results: powerFlowData.fixshunt_results,
        swshunt_results: powerFlowData.swshunt_results,
        acline_results: powerFlowData.acline_results,
        transformer_results: powerFlowData.transformer_results,
        twotermdc_results: powerFlowData.twotermdc_results,
        vscdc_results: powerFlowData.vscdc_results,
        system_summary: powerFlowData.system_summary,
      }
    };
    
    const combined = aggregateNetworkData(networkData, calculationResultForDisplay);
    
    // Return the network_data portion (or the combined data if no network_data wrapper)
    return (combined as any)?.network_data || combined;
  }, [networkData, powerFlowData]);
  

  // Use displayData for rendering (combined network + power flow)
  const displayNetworkData = displayData;

  // Extract element types from network data
  const elementTypes = useMemo(() => {
    if (!displayNetworkData) return [];
    
    const mainElements = ['bus', 'load', 'generator', 'acline', 'fixshunt', 'swshunt', 'transformer'];
    const allElements = Object.keys(displayNetworkData).filter(key => {
      const element = (displayNetworkData as any)[key];
      // Accept if it's an array with data OR has fields/data properties
      return (Array.isArray(element) && element.length > 0) || 
             (element?.fields && element?.data);
    });
    
    // Prioritize main elements, then add others
    const prioritized = mainElements.filter(el => allElements.includes(el));
    const others = allElements.filter(el => !mainElements.includes(el));
    
    return [...prioritized, ...others];
  }, [displayNetworkData]);

  // Get current element data and extract fields
  const currentElementData = useMemo(() => {
    if (!displayNetworkData?.[selectedElement]) return null;
    const elementData = displayNetworkData[selectedElement];
    
    // Handle format: array of objects directly (no fields/data wrapper)
    if (Array.isArray(elementData) && elementData.length > 0) {
      // Use predefined order if available, otherwise use first row keys
      // This avoids O(n) iteration over all rows
      const predefinedOrder = FIELD_ORDERS[selectedElement];
      
      let orderedFields: string[];
      if (predefinedOrder) {
        // Use predefined order - filter to fields that exist in first row
        // (predefined fields should be in first row if they exist at all)
        const firstRow = elementData[0];
        const firstRowKeys = firstRow && typeof firstRow === 'object' ? Object.keys(firstRow) : [];
        orderedFields = predefinedOrder.filter(f => firstRowKeys.includes(f));
      } else {
        // No predefined order, use first row keys
        const firstRow = elementData[0];
        orderedFields = firstRow && typeof firstRow === 'object' ? Object.keys(firstRow) : [];
      }
      
      return { fields: orderedFields, data: elementData };
    }
    
    // Handle format with fields and data properties
    if (elementData?.fields && elementData?.data) {
      return elementData;
    }
    
    return null;
  }, [displayNetworkData, selectedElement]);

  // Detect which header labels are actually truncated so we only show tooltips for those
  useEffect(() => {
    if (!currentElementData?.fields) {
      setTruncatedFields(new Set());
      return;
    }

    const next = new Set<string>();
    currentElementData.fields.forEach((field: string, idx: number) => {
      const th = headerRefs.current[idx];
      if (!th) return;
      const labelEl = th.querySelector('.header-label') as HTMLElement | null;
      if (!labelEl) return;
      if (labelEl.scrollWidth > labelEl.clientWidth + 1) {
        next.add(field);
      }
    });

    setTruncatedFields(next);
  }, [currentElementData?.fields, selectedElement]);

  // Reset scroll when element changes
  useEffect(() => {
    setScrollTop(0);
    if (tableWrapperRef.current) {
      tableWrapperRef.current.scrollTop = 0;
    }
    setEditingCell(null); // Cancel edit when switching elements
  }, [selectedElement]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Throttled scroll handler using requestAnimationFrame for smoother performance
  // Only used for large datasets (virtual scrolling)
  const rafRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef<boolean>(false);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const wrapper = e.currentTarget;

    // Add 'scrolling' class to disable hover effects during scroll
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      wrapper.classList.add('scrolling');
    }

    // Only process scroll for virtual scrolling (large datasets)
    const totalRows = currentElementData?.data?.length || 0;
    if (totalRows >= VIRTUAL_SCROLL_THRESHOLD) {
      const scrollTop = e.currentTarget.scrollTop;
      lastScrollTopRef.current = scrollTop;

      // Use requestAnimationFrame to sync with browser's render cycle
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setScrollTop(lastScrollTopRef.current);
        });
      }
    }

    // Remove 'scrolling' class after scroll stops
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      wrapper.classList.remove('scrolling');
      // Final update for virtual scrolling
      if (currentElementData?.data?.length >= VIRTUAL_SCROLL_THRESHOLD) {
        setScrollTop(lastScrollTopRef.current);
      }
    }, 150);
  }, [currentElementData?.data?.length]);
  
  // Cleanup timeout and RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Handle cell click via event delegation
  // Note: data-editable="true" is only set on editable cells, so no need to re-check
  const handleTableBodyClick = useCallback((e: React.MouseEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('td[data-editable="true"]');
    if (!cell) return;
    
    const rowIdx = parseInt(cell.getAttribute('data-row-idx') || '');
    const field = cell.getAttribute('data-field') || '';
    
    if (!isNaN(rowIdx) && field) {
      setEditingCell({ rowIdx, field });
      // Get value from row data
      const row = currentElementData?.data?.[rowIdx];
      const value = row?.[field];
      setEditValue(value === null || value === undefined ? '' : String(value));
    }
  }, [currentElementData]);

  // Scroll tabs left/right
  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = 200;
      const newScrollLeft = tabsContainerRef.current.scrollLeft + (direction === 'right' ? scrollAmount : -scrollAmount);
      tabsContainerRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    }
  };

  // Extract bus numbers from an element row for plotting
  const getBusNumbersFromRow = useCallback((row: any, elementType: string): number[] => {
    const busNumbers: number[] = [];

    switch (elementType) {
      case 'bus':
        if (typeof row.ibus === 'number') {
          busNumbers.push(row.ibus);
        }
        break;
      case 'load':
      case 'generator':
      case 'fixshunt':
      case 'swshunt':
        if (typeof row.ibus === 'number') {
          busNumbers.push(row.ibus);
        }
        break;
      case 'acline':
        if (typeof row.ibus === 'number') busNumbers.push(row.ibus);
        if (typeof row.jbus === 'number') busNumbers.push(row.jbus);
        break;
      case 'transformer':
        if (typeof row.ibus === 'number') busNumbers.push(row.ibus);
        if (typeof row.jbus === 'number') busNumbers.push(row.jbus);
        if (typeof row.kbus === 'number' && row.kbus > 0) busNumbers.push(row.kbus);
        break;
      case 'vscdc':
        if (typeof row.ibus1 === 'number') busNumbers.push(row.ibus1);
        if (typeof row.ibus2 === 'number') busNumbers.push(row.ibus2);
        break;
      case 'twotermdc':
        if (typeof row.ipr === 'number') busNumbers.push(row.ipr);
        if (typeof row.ipi === 'number') busNumbers.push(row.ipi);
        break;
    }

    return busNumbers;
  }, []);

  // Handle plot element - plots the buses and switches to diagram view
  const handlePlotElement = useCallback((row: any) => {
    const busNumbers = getBusNumbersFromRow(row, selectedElement);

    if (busNumbers.length === 0) {
      console.warn('No bus numbers found for element:', selectedElement, row);
      return;
    }

    // Plot the buses on the diagram
    if (diagramRef?.current) {
      diagramRef.current.plotBuses(busNumbers);
    }

    // Defer view change to avoid blocking
    requestAnimationFrame(() => {
      if (onViewChange) {
        onViewChange('diagram');
      }
    });
  }, [selectedElement, getBusNumbersFromRow, diagramRef, onViewChange]);

  // Handle row right click to show context menu
  const handleRowContextMenu = useCallback((e: React.MouseEvent, rowIdx: number) => {
    if (!currentElementData) return;

    e.preventDefault();
    e.stopPropagation();

    const row = currentElementData.data[rowIdx];
    if (!row) return;

    // Store position immediately before deferring
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Use requestAnimationFrame to defer menu construction to next frame
    // This allows the browser to handle the right-click event immediately
    requestAnimationFrame(() => {
      // Build identifier for this row
      const identifierFields = ELEMENT_IDENTIFIERS[selectedElement] || [];
      const identifier: Record<string, any> = {};
      for (const field of identifierFields) {
        if (row[field] !== undefined) {
          identifier[field] = row[field];
        }
      }

      // Check if this element has bus numbers (for Plot Element option)
      const busNumbers = getBusNumbersFromRow(row, selectedElement);
      const hasBusNumbers = busNumbers.length > 0;

      // Create menu items
      const menuItems: MenuItem[] = [];

      // Group 1: Modify / Add / Delete
      menuItems.push({
        id: 'modify',
        label: t('contextMenu.modifyElement'),
        action: () => { handleModifyElement(rowIdx); },
        data: { rowIdx, row, identifier },
      });

      menuItems.push({
        id: 'delete',
        label: t('contextMenu.deleteElement'),
        action: (data) => {
          if (data?.rowIdx !== undefined && data?.identifier) {
            showDeleteConfirmation(data.rowIdx, data.identifier);
          }
        },
        data: { rowIdx, row, identifier },
      });

      if (['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'].includes(selectedElement)) {
        menuItems.push({
          id: 'add-element',
          label: t('contextMenu.addElement'),
          action: () => { handleAddElement(); },
        });
      }

      // Group 2: Plot / Graph analysis
      const hasGroup2 = hasBusNumbers || onFindShortestPath || onFindNeighbourElements;
      if (hasGroup2) {
        menuItems.push({ id: 'separator-analysis', separator: true } as MenuItem);

        if (hasBusNumbers) {
          menuItems.push({
            id: 'plot-element',
            label: t('contextMenu.plotElement'),
            action: () => { handlePlotElement(row); },
            data: { rowIdx, row, identifier, busNumbers },
          });
        }

        if (onFindShortestPath) {
          menuItems.push({
            id: 'find-shortest-path',
            label: t('contextMenu.findShortestPath'),
            action: () => { onFindShortestPath(hasBusNumbers ? busNumbers[0] : null); },
          });
        }

        if (onFindNeighbourElements) {
          menuItems.push({
            id: 'find-neighbour-elements',
            label: t('contextMenu.findNeighbourElements'),
            action: () => { onFindNeighbourElements(hasBusNumbers ? busNumbers[0] : null); },
          });
        }
      }

      // Show the context menu
      setContextMenuState({
        isOpen: true,
        position: { x: clientX, y: clientY },
        items: menuItems,
      });
    });
    // Note: handleAddElement, handleModifyElement, handlePlotElement are stable useCallbacks
    // so we don't need to include them in dependencies
  }, [currentElementData, selectedElement, t, getBusNumbersFromRow]);

  // Handle table area right click (for adding elements)
  // Note: This function references handleAddElement which is declared below,
  // but since handleAddElement is a stable useCallback, this is safe
  const handleTableContextMenu = useCallback((e: React.MouseEvent) => {
    // Only handle if clicking on the table wrapper or header, not on a row
    const target = e.target as HTMLElement;
    const isRowClick = target.closest('tbody tr');
    if (isRowClick) return;

    e.preventDefault();
    e.stopPropagation();

    // Check if this element type supports adding
    const supportedAddTypes = ['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'];
    if (!supportedAddTypes.includes(selectedElement)) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    requestAnimationFrame(() => {
      const menuItems: MenuItem[] = [
        {
          id: 'add-element',
          label: t('contextMenu.addElement'),
          action: () => {
            handleAddElement();
          },
        },
      ];

      setContextMenuState({
        isOpen: true,
        position: { x: clientX, y: clientY },
        items: menuItems,
      });
    });
    // Note: handleAddElement is a stable useCallback, not included in deps
  }, [selectedElement, t]);

  // Handle add element - opens the parameter editor in add mode
  const handleAddElement = useCallback(() => {
    // Set up for add mode with default values
    // Elements with stat field should default to 1 (On)
    const elementsWithStatus = ['generator', 'load', 'acline', 'transformer', 'fixshunt', 'swshunt'];
    const defaultValues: Record<string, any> = elementsWithStatus.includes(selectedElement) 
      ? { stat: 1 }  // Default status is On
      : {};
    
    // Bus specific defaults
    if (selectedElement === 'bus') {
      defaultValues.ide = 1;  // Default bus type is Load Bus
    }
    
    setSelectedRowData(defaultValues);
    setParamEditorMode('add');
    
    // Get categories in add mode (identifier fields will be enabled)
    const categories = getParameterCategories(selectedElement, defaultValues, { mode: 'add' });
    setParamCategories(categories);
    setIsParamEditorOpen(true);
  }, [selectedElement]);

  // Handle add element apply - calls the API
  const handleAddElementApply = async (values: Record<string, any>) => {
    try {
      await PowerFlowApp.addElement(selectedElement as keyof typeof ELEMENT_TYPES, values);
      setIsParamEditorOpen(false);
      // Network refresh is done once by usePowerFlowSDK handleEditComplete (EDIT_COMPLETE event)
    } catch (error: any) {
      console.error('Failed to add element:', error);
      setNotification({
        isOpen: true,
        title: t('notifications.error'),
        message: t('contextMenu.addElementError', { error: error.message || 'Unknown error' }),
        type: 'error',
      });
    }
  };

  // Hide context menu
  const hideContextMenu = () => {
    setContextMenuState({
      isOpen: false,
      position: null,
      items: [],
    });
  };

  // Handle modify element (opens parameter editor)
  // Use requestAnimationFrame to defer heavy work
  const handleModifyElement = useCallback((rowIdx: number) => {
    if (!currentElementData) return;

    const row = currentElementData.data[rowIdx];

    // Defer heavy work to next frame for smoother UI
    requestAnimationFrame(() => {
      setSelectedRowData(row);
      setParamEditorMode('modify');

      // getParameterCategories can be expensive for elements with many fields
      const categories = getParameterCategories(selectedElement, row);
      setParamCategories(categories);
      setIsParamEditorOpen(true);
    });
  }, [currentElementData, selectedElement]);

  // Show delete confirmation
  const showDeleteConfirmation = (rowIdx: number, identifier: Record<string, any>) => {
    if (!currentElementData) return;
    
    const row = currentElementData.data[rowIdx];
    const identifierFields = ELEMENT_IDENTIFIERS[selectedElement] || [];
    const identifierStr = identifierFields
      .map(field => `${field}=${row[field]}`)
      .join(', ');
    
    setDeleteConfirmation({
      isOpen: true,
      rowIdx,
      identifier,
      elementInfo: identifierStr,
    });
  };

  // Handle delete element (called after confirmation)
  const handleDeleteElement = async () => {
    const { rowIdx, identifier } = deleteConfirmation;
    if (rowIdx === null || !identifier || !currentElementData) return;
    
    // Close confirmation dialog
    setDeleteConfirmation({
      isOpen: false,
      rowIdx: null,
      identifier: null,
      elementInfo: '',
    });
    
    try {
      // Call delete API
      await PowerFlowApp.deleteElement(selectedElement as keyof typeof ELEMENT_TYPES, identifier);
      // Network refresh is done once by usePowerFlowSDK handleEditComplete (EDIT_COMPLETE event)
    } catch (error: any) {
      console.error('Failed to delete element:', error);
      // Show error notification
      setNotification({
        isOpen: true,
        title: t('notifications.noSession'),
        message: t('contextMenu.deleteError', { error: error.message || 'Unknown error' }),
        type: 'error',
      });
    }
  };

  // Handle parameter editor apply
  const handleParameterApply = async (updatedValues: Record<string, any>) => {
    if (paramEditorMode === 'add') {
      // In add mode, call the add element API
      await handleAddElementApply(updatedValues);
    } else {
      // In modify mode, call the modify element API
      if (!selectedRowData || !currentElementData) return;
      
      try {
        // Build identifier from original row data
        const identifierFields = ELEMENT_IDENTIFIERS[selectedElement] || [];
        const identifier: Record<string, any> = {};
        identifierFields.forEach(field => {
          if (selectedRowData[field] !== undefined) {
            identifier[field] = selectedRowData[field];
          }
        });
        
        // Build modify data with only changed fields
        const modifyData: Record<string, any> = {};
        Object.keys(updatedValues).forEach(key => {
          if (updatedValues[key] !== selectedRowData[key]) {
            modifyData[key] = updatedValues[key];
          }
        });
        
        // Only call API if there are changes
        if (Object.keys(modifyData).length > 0) {
          console.log(`Modifying ${selectedElement}:`, { identifier, modifyData });
          await PowerFlowApp.modifyElement(selectedElement as keyof typeof ELEMENT_TYPES, identifier, modifyData);
          // Network refresh is done once by usePowerFlowSDK handleEditComplete (EDIT_COMPLETE event)
        }
        
        // Close modal
        setIsParamEditorOpen(false);
      } catch (error: any) {
        console.error('Failed to modify element:', error);
        setNotification({
          isOpen: true,
          title: t('notifications.error'),
          message: t('contextMenu.modifyElementError', { error: error.message || 'Unknown error' }),
          type: 'error',
        });
      }
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Save edit
  const saveEdit = () => {
    if (!editingCell || !currentElementData) return;

    const { rowIdx, field } = editingCell;
    const row = currentElementData.data[rowIdx];
    const originalValue = row[field];

    // Parse value based on original type
    let newValue: any = editValue;
    if (typeof originalValue === 'number') {
      const parsed = editValue.includes('.') ? parseFloat(editValue) : parseInt(editValue);
      if (!isNaN(parsed)) {
        newValue = parsed;
        // Format numeric value to at most 4 decimals, remove trailing zeros
        if (!Number.isInteger(newValue)) {
          const fixed = newValue.toFixed(4);
          const formatted = fixed.replace(/\.?0+$/, '');
          newValue = parseFloat(formatted);
        }
      } else {
        // Invalid number, cancel edit
        cancelEdit();
        return;
      }
    }

    // Check if value actually changed
    const hasChanged = newValue !== originalValue;

    if (hasChanged) {
      // Track the change with undo/redo system
      const elementKey = `${selectedElement}-${rowIdx}`;
      
      // Get previous value: if field was already in changes Map, use that as previous
      // Otherwise use the original value from row data
      const elementChanges = changes.get(elementKey);
      const previousValue = elementChanges?.has(field) 
        ? elementChanges.get(field)  // If already edited, the current edit value is the previous
        : originalValue;              // If first edit, original row value is previous
      
      // Track edit for undo/redo (this updates the changes Map)
      // Note: We don't modify row data directly - display checks changes Map first
      const updatedChanges = trackEdit({
        elementKey,
        field,
        previousValue,
        newValue,
      });
      
      setChanges(updatedChanges);
    } else {
      // Value didn't change, but if it was previously edited and now matches original,
      // we should remove it from changes Map
      const elementKey = `${selectedElement}-${rowIdx}`;
      const elementChanges = changes.get(elementKey);
      
      if (elementChanges?.has(field)) {
        // Value matches original, remove from changes
        elementChanges.delete(field);
        if (elementChanges.size === 0) {
          changes.delete(elementKey);
        }
        setChanges(new Map(changes));
      }
      
      cancelEdit();
      return;
    }

    cancelEdit();
  };

  // Handle keyboard events in edit input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Helper to get cell value (checks changes Map first, then row data)
  const getCellValue = useCallback((rowIdx: number, field: string): any => {
    const elementKey = `${selectedElement}-${rowIdx}`;
    const elementChanges = changes.get(elementKey);
    
    // If field has a change, return the changed value
    if (elementChanges?.has(field)) {
      return elementChanges.get(field);
    }
    
    // Otherwise return original value from row data
    if (currentElementData?.data?.[rowIdx]) {
      return currentElementData.data[rowIdx][field];
    }
    
    return undefined;
  }, [selectedElement, changes, currentElementData]);

  // Handle undo - reverts changes Map
  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    
    const updatedChanges = undo();
    if (updatedChanges !== null) {
      // Update React state - this will show changes in UI (edited cells, Save Changes button)
      setChanges(updatedChanges);
      
      // Sync the restored changes to manager (ensures state consistency)
      // The useEffect will also sync, but doing it explicitly ensures timing
      syncChanges(updatedChanges);
      
      // Note: Row data display will automatically show the restored values
      // because getCellValue checks changes Map first
    }
  }, [canUndo, undo, syncChanges]);

  // Handle redo - re-applies changes Map
  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    
    const updatedChanges = redo();
    if (updatedChanges !== null) {
      // Update React state - this will show changes in UI (edited cells, Save Changes button)
      setChanges(updatedChanges);
      
      // Sync the restored changes to manager (ensures state consistency)
      syncChanges(updatedChanges);
    }
  }, [canRedo, redo, syncChanges]);

  // Expose undo/redo handlers to parent component (after handlers are defined)
  useEffect(() => {
    if (onUndoRedoReady) {
      onUndoRedoReady({
        undo: handleUndo,
        redo: handleRedo,
        canUndo,
        canRedo,
      });
    }
  }, [onUndoRedoReady, canUndo, canRedo, handleUndo, handleRedo]);

  // Keyboard shortcuts for undo/redo (global)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not editing a cell (to avoid conflicts)
      if (editingCell) return;
      
      // Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) for Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          handleUndo();
        }
      }
      
      // Cmd+Shift+Z or Cmd+Y for Redo
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key === 'y')
      ) {
        e.preventDefault();
        if (canRedo) {
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, handleUndo, handleRedo, editingCell]);

  // Check if a cell has been edited
  const isCellEdited = useCallback((rowIdx: number, field: string): boolean => {
    const elementKey = `${selectedElement}-${rowIdx}`;
    const elementChanges = changes.get(elementKey);
    return elementChanges?.has(field) || false;
  }, [selectedElement, changes]);

  // Memoize identifier fields for current element type
  const identifierFieldsSet = useMemo(() => {
    return new Set(ELEMENT_IDENTIFIERS[selectedElement] || []);
  }, [selectedElement]);

  // Get network fields for current element (for editability check)
  const currentNetworkFields = useMemo(() => {
    return networkDataFields.get(selectedElement) || new Set();
  }, [networkDataFields, selectedElement]);

  // Calculate visible rows for virtual scrolling (only for large datasets)
  const { startRow, endRow, paddingTop, paddingBottom, visibleData, useVirtualScroll } = useMemo(() => {
    if (!currentElementData?.data || !Array.isArray(currentElementData.data)) {
      return { startRow: 0, endRow: 0, paddingTop: 0, paddingBottom: 0, visibleData: [], useVirtualScroll: false };
    }

    const totalRows = currentElementData.data.length;
    const useVirtualScroll = totalRows >= VIRTUAL_SCROLL_THRESHOLD;

    // For small datasets, render all rows without virtual scrolling
    if (!useVirtualScroll) {
      return {
        startRow: 0,
        endRow: totalRows,
        paddingTop: 0,
        paddingBottom: 0,
        visibleData: currentElementData.data,
        useVirtualScroll: false,
      };
    }

    // Virtual scrolling for large datasets
    const containerHeight = tableWrapperRef.current?.clientHeight || 600;
    const visibleRows = Math.ceil(containerHeight / ROW_HEIGHT);
    const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_SIZE);
    const endRow = Math.min(totalRows, startRow + visibleRows + BUFFER_SIZE * 2);
    const paddingTop = startRow * ROW_HEIGHT;
    const paddingBottom = (totalRows - endRow) * ROW_HEIGHT;

    return {
      startRow,
      endRow,
      paddingTop,
      paddingBottom,
      visibleData: currentElementData.data.slice(startRow, endRow),
      useVirtualScroll: true,
    };
  }, [currentElementData, scrollTop]);

  // Reset all changes
  const handleResetChanges = async () => {
    setChanges(new Map());
    clearHistory();
    
    // Call onDataUpdated to reload data from parent
    if (onDataUpdated) {
      onDataUpdated();
    }
  };

  // Apply all changes via API
  const handleSaveChanges = async () => {
    if (changes.size === 0) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // Group changes by element type
      const changesByType = new Map<string, Array<{ rowIdx: number; changes: Map<string, any> }>>();
      
      changes.forEach((elementChanges, elementKey) => {
        // Parse element key: "elementType-rowIdx"
        const [elementType, rowIdxStr] = elementKey.split('-');
        const rowIdx = parseInt(rowIdxStr);
        
        if (!changesByType.has(elementType)) {
          changesByType.set(elementType, []);
        }
        
        changesByType.get(elementType)!.push({ rowIdx, changes: elementChanges });
      });
      
      // Apply changes for each element type
      // IMPORTANT: Also update row data to reflect saved values BEFORE clearing changes Map
      // This ensures that after save, row data has the saved values, and undo can restore previous values
      for (const [elementType, elementChanges] of Array.from(changesByType)) {
        // Use network data for getting element data (not display data)
        const elementData = networkData?.network_data?.[elementType] || networkData?.[elementType];
        if (!elementData) continue;
        
        const dataArray = Array.isArray(elementData) ? elementData : elementData.data;
        if (!dataArray) continue;
        
        // Apply each modification
        for (const { rowIdx, changes: fieldChanges } of elementChanges) {
          const row = dataArray[rowIdx];
          if (!row) continue;
          
          // Build identifier from row data (using ORIGINAL values before save)
          const identifierFields = ELEMENT_IDENTIFIERS[elementType] || [];
          const identifier: Record<string, any> = {};
          identifierFields.forEach(field => {
            if (row[field] !== undefined) {
              identifier[field] = row[field];
            }
          });
          
          // Build modify data with ONLY the changed fields
          const modifyData: Record<string, any> = {};
          
          // Only include the fields that changed
          fieldChanges.forEach((value: any, field: string) => {
            modifyData[field] = value;
            // Update row data to reflect saved value (so after save, row data has new values)
            // This ensures undo can restore previous values properly
            row[field] = value;
          });
          
          // Call modify API
          console.log(`Modifying ${elementType}:`, { identifier, modifyData });
          await PowerFlowApp.modifyElement(elementType as keyof typeof ELEMENT_TYPES, identifier, modifyData);
        }
      }
      
      // Success - update row data is done above, now clear changes and update cache
      setSaveError(null);
      
      // Note: We keep undo/redo history after save so users can undo/redo even after saving
      // The history persists throughout the session until explicitly cleared (e.g., Reset Changes)
      
      // IMPORTANT: After saving:
      // - Row data now has the saved values (updated above)
      // - Changes Map will be cleared (no pending changes)
      // - When undo is called, it will restore previousValue to changes Map
      // - Display will show previousValue from changes Map (different from row data's saved value)
      // - "Save Changes" button will appear because changes Map has entries
      
      // Clear the changes Map (no pending changes after successful save)
      const emptyChanges = new Map<string, Map<string, any>>();
      setChanges(emptyChanges);
      
      // IMPORTANT: Sync empty changes to manager immediately so it reflects current state
      // When undo is called later, EditCommand.undo() will restore changes properly
      // even from an empty Map (it will recreate the elementKey entry)
      syncChanges(emptyChanges);
      
      // Update SDK's cached network data with updated row data (now has saved values)
      // This ensures the cache reflects what was actually saved
      if (networkData) {
        PowerFlowApp.updateCachedNetwork(networkData);
        console.log('SDK network cache updated with saved data');
      }
      // Network refresh from server is done once by usePowerFlowSDK handleEditComplete (EDIT_COMPLETE event)

      console.log('All changes saved successfully');
    } catch (error: any) {
      console.error('Failed to save changes:', error);
      setSaveError(error.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Get count of changes
  const changeCount = useMemo(() => {
    let count = 0;
    changes.forEach(elementChanges => {
      count += elementChanges.size;
    });
    return count;
  }, [changes]);

  if (!networkData) {
    return (
      <div
        className="network-data-table empty"
        onClick={() => triggerLoadFile?.()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerLoadFile?.();
          }
        }}
      >
        <div className="empty-state">
          <svg className="empty-icon" width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path d="M8 16C8 11.5817 11.5817 8 16 8H48C52.4183 8 56 11.5817 56 16V48C56 52.4183 52.4183 56 48 56H16C11.5817 56 8 52.4183 8 48V16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M20 28H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M20 36H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M20 44H32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="40" cy="42" r="6" stroke="currentColor" strokeWidth="2"/>
            <path d="M44 46L48 50" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <small>{t('messages.loadCaseFile')}</small>
        </div>
      </div>
    );
  }

  return (
    <div className="network-data-table">
      {/* Changes Action Bar */}
      {changeCount > 0 && (
        <div className="changes-action-bar">
          <button 
            className="btn-reset"
            onClick={handleResetChanges}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button 
            className="btn-save"
            onClick={handleSaveChanges}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Element Type Tabs */}
      <div className="tabs-navigation">
        <button className="nav-btn nav-btn-left" onClick={() => scrollTabs('left')}>
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path d="M6.5 1L1.5 6L6.5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="element-tabs" ref={tabsContainerRef}>
          {elementTypes.map(type => {
            const typeData = displayNetworkData[type];
            const count = Array.isArray(typeData) 
              ? typeData.length 
              : typeData?.data?.length || 0;
            
            return (
              <button
                key={type}
                className={`element-tab ${selectedElement === type ? 'active' : ''}`}
                onClick={() => setSelectedElement(type)}
              >
                {type.toUpperCase()}
                {count > 0 && (
                  <span className="count">{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <button className="nav-btn nav-btn-right" onClick={() => scrollTabs('right')}>
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path d="M1.5 1L6.5 6L1.5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Data Table: single table so header and body columns always match */}
      <div className="table-wrapper" ref={tableWrapperRef} onScroll={handleScroll} onContextMenu={handleTableContextMenu}>
        {currentElementData ? (
          <div className="table-content">
            <table
              className="data-table"
              style={{
                tableLayout: 'fixed',
                width: 50 + (currentElementData.fields?.length || 0) * 120,
              }}
            >
              <colgroup>
                <col style={{ width: 50 }} />
                {(currentElementData.fields || []).map((_: string, i: number) => (
                  <col key={i} style={{ width: 120 }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="row-number">
                    {['bus', 'load', 'generator', 'acline', 'transformer', 'fixshunt', 'swshunt'].includes(selectedElement) ? (
                      <div className="add-element-btn-wrapper">
                        <button className="add-element-btn" onClick={handleAddElement}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <span className="add-element-tooltip">{t('contextMenu.addElement')}</span>
                      </div>
                    ) : (
                      '#'
                    )}
                  </th>
                  {currentElementData.fields?.map((field: string, idx: number) => (
                    <th
                      key={idx}
                      ref={el => { headerRefs.current[idx] = el; }}
                      className={`header-cell ${truncatedFields.has(field) ? 'has-tooltip' : ''}`}
                    >
                      <span className="header-label">{field}</span>
                      <span className="header-tooltip">{field}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody onClick={handleTableBodyClick}>
                {currentElementData?.data && visibleData.length > 0 && (
                  <>
                    {useVirtualScroll && paddingTop > 0 && (
                      <tr style={{ height: paddingTop }}>
                        <td colSpan={(currentElementData.fields?.length || 0) + 1} style={{ padding: 0 }} />
                      </tr>
                    )}
                    {visibleData.map((row: any, relativeIdx: number) => {
                      const rowIdx = useVirtualScroll ? startRow + relativeIdx : relativeIdx;
                      const elementKey = `${selectedElement}-${rowIdx}`;
                      const rowChanges = changes.get(elementKey);
                      return (
                        <tr
                          key={rowIdx}
                          onContextMenu={(e) => handleRowContextMenu(e, rowIdx)}
                          className={useVirtualScroll ? 'virtual-row' : ''}
                        >
                          <td className="row-number">{rowIdx + 1}</td>
                          {currentElementData.fields?.map((field: string, cellIdx: number) => {
                            const displayedValue = rowChanges?.has(field)
                              ? rowChanges.get(field)
                              : row[field];
                            const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.field === field;
                            const isEdited = rowChanges?.has(field) || false;
                            const isIdentifier = identifierFieldsSet.has(field);
                            const isEditable = currentNetworkFields.has(field) && !isIdentifier;

                            // Build className
                            let cellClassName = '';
                            if (isEdited) cellClassName += ' edited-cell';
                            if (isEditing) cellClassName += ' editing-cell';
                            if (isIdentifier) cellClassName += ' identifier-cell';
                            if (!isEditable && !isIdentifier) cellClassName += ' power-flow-field';

                            // Build title
                            let cellTitle = '';
                            if (isEdited) cellTitle = 'Modified (unsaved)';
                            else if (isIdentifier) cellTitle = 'Identifier field (read-only)';
                            else if (!isEditable) cellTitle = 'Power flow result (read-only)';

                            // Format value (limit to 4 decimals, remove trailing zeros)
                            let formattedValue = '-';
                            if (displayedValue !== null && displayedValue !== undefined) {
                              if (typeof displayedValue === 'number') {
                                if (Number.isInteger(displayedValue)) {
                                  formattedValue = String(displayedValue);
                                } else {
                                  // Format to 4 decimals and remove trailing zeros
                                  const fixed = displayedValue.toFixed(4);
                                  formattedValue = fixed.replace(/\.?0+$/, '');
                                }
                              } else {
                                formattedValue = String(displayedValue).trim();
                              }
                            }

                            return (
                              <td
                                key={cellIdx}
                                data-row-idx={rowIdx}
                                data-field={field}
                                data-editable={isEditable && !isEditing}
                                className={cellClassName}
                                title={cellTitle}
                              >
                                {isEditing ? (
                                  <input
                                    ref={inputRef}
                                    type="text"
                                    className="cell-input"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onBlur={saveEdit}
                                  />
                                ) : (
                                  <>
                                    {formattedValue}
                                    {isEdited && <span className="edit-indicator"></span>}
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {useVirtualScroll && paddingBottom > 0 && (
                      <tr style={{ height: paddingBottom }}>
                        <td colSpan={(currentElementData.fields?.length || 0) + 1} style={{ padding: 0 }} />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-data">No data for {selectedElement}</div>
        )}
      </div>
      
      {/* Parameter Editor Modal */}
      <ParameterEditorModal
        isOpen={isParamEditorOpen}
        onClose={() => setIsParamEditorOpen(false)}
        title={
          paramEditorMode === 'add'
            ? t('contextMenu.addElement') + ' - ' + selectedElement.toUpperCase()
            : t('parameters:modalTitle', { element: t(`parameters:elementTypes.${selectedElement}`) })
        }
        categories={paramCategories}
        values={selectedRowData || {}}
        onApply={handleParameterApply}
        width={700}
        height={600}
      />

      {/* Context Menu */}
      {contextMenuState.isOpen && contextMenuState.position && (
        <ContextMenu
          items={contextMenuState.items}
          position={contextMenuState.position}
          onClose={hideContextMenu}
        />
      )}

      {/* Delete Confirmation Alert */}
      <AlertModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({
          isOpen: false,
          rowIdx: null,
          identifier: null,
          elementInfo: '',
        })}
        title={t('contextMenu.delete')}
        message={t('contextMenu.deleteConfirmation', { 
          element: selectedElement,
          info: deleteConfirmation.elementInfo 
        })}
        type="warning"
        width={450}
        confirmMode={true}
        confirmText={t('contextMenu.delete')}
        cancelText={t('contextMenu.cancel')}
        onConfirm={handleDeleteElement}
      />

      {/* Success/Error Alert */}
      <AlertModal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        message={notification.message}
        type={notification.type}
      />
    </div>
  );
});
NetworkDataTable.displayName = 'NetworkDataTable';

