/**
 * Network Diagram Default Render Style
 * Default rendering configuration for the NetworkDiagram component
 */

import { RenderStyle } from '../types';

export const DEFAULT_RENDER_STYLE: RenderStyle = {
  backgroundColor: '#ffffff',
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
  busRadius: 24,
  lineWidth: 2.5,
  transformerSize: 20,
  loadSize: 20,
  generatorSize: 24,
  shuntSize: 20,
  breakerSize: 30,
  fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
  fontSize: 12,
  fontSizeSmall: 10,
  fontSizeLarge: 14,
  showGlow: true,
  glowBlur: 10,
  showShadows: false,
  shadowBlur: 5,
  shadowColor: 'rgba(0,0,0,0.2)',
};
