/**
 * Network Diagram Themes
 * Predefined theme configurations for the NetworkDiagram component
 */

import { RenderStyle, VoltageLevelColors } from '../types';
import { DEFAULT_RENDER_STYLE } from './defaults';

export type ThemeType = 'light' | 'dark';

// Voltage level color definitions
// Carefully selected colors for visual distinction and professional appearance
export const VOLTAGE_COLORS: Record<ThemeType, VoltageLevelColors> = {
  light: {
    ehv: '#c62828',  // Professional Red - highest voltage (345kV+)
    hv: '#1565c0',   // Professional Blue - high voltage (138-344kV)
    mv: '#2e7d32',   // Professional Green - medium voltage (34.5-137kV)
    lv: '#ef6c00',   // Professional Orange - low voltage (<34.5kV)
  },
  dark: {
    ehv: '#ef5350',  // Bright Red - highest voltage
    hv: '#42a5f5',   // Bright Blue - high voltage
    mv: '#66bb6a',   // Bright Green - medium voltage
    lv: '#ffa726',   // Bright Orange - low voltage
  },
};

export const THEMES: Record<ThemeType, Partial<RenderStyle>> = {
  light: {
    backgroundColor: '#fafafa', /* very light gray, Mac-style */
    gridColor: '#e0e0e0',
    busColor: '#2c3e50',
    busSlackColor: '#27ae60',
    busGenColor: '#2980b9',
    busLoadColor: '#e67e22',
    lineColor: '#34495e',
    lineSelectedColor: '#3498db',
    lineHighlightedColor: '#9b59b6',
    transformerColor: '#8e44ad',
    loadColor: '#000000',
    generatorColor: '#000000',
    shuntColor: '#d68910',
    breakerOpenColor: '#e74c3c',
    breakerClosedColor: '#27ae60',
    textColor: '#2c3e50',
    labelColor: '#7f8c8d',
    selectedColor: '#3498db',
    highlightedColor: '#9b59b6',
    fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
    fontSize: 12,
    fontSizeSmall: 10,
    fontSizeLarge: 14,
    voltageColors: VOLTAGE_COLORS.light,
  },
  dark: {
    backgroundColor: '#1a1a1a',
    gridColor: '#333333',
    busColor: '#888888',
    busSlackColor: '#00d26a',
    busGenColor: '#00d4ff',
    busLoadColor: '#ffc107',
    lineColor: '#bbbbbb',
    lineSelectedColor: '#339af0',
    lineHighlightedColor: '#7950f2',
    transformerColor: '#b76e00',
    loadColor: '#000000',
    generatorColor: '#000000',
    shuntColor: '#ff922b',
    breakerOpenColor: '#ff6b6b',
    breakerClosedColor: '#00d26a',
    textColor: '#ffffff',
    labelColor: '#aaaaaa',
    selectedColor: '#339af0',
    highlightedColor: '#7950f2',
    voltageColors: VOLTAGE_COLORS.dark,
  },
};

/**
 * Get a render style by combining default style with theme overrides
 */
export function getRenderStyle(theme: ThemeType): RenderStyle {
  const themeStyle = THEMES[theme];
  return { ...DEFAULT_RENDER_STYLE, ...themeStyle };
}
