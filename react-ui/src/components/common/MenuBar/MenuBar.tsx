import React, { useState, useRef } from 'react';
import { Tooltip } from '../Tooltip';
import './MenuBar.css';
import { useTheme } from '../../ui';
import { useLanguage } from '../../ui';
import { useTranslation } from 'react-i18next';
import { useDialog, DIALOG_IDS } from '../Dialog';
import { About } from '../../features';
import { useAuth } from '../../../auth';

interface MenuBarProps {
  onMenuClick?: (menu: string, action: string) => void;
  onToolbarAction?: (action: string) => void;
  healthStatus?: 'healthy' | 'unhealthy';
  sessionId?: string | null;
  loading?: boolean;
  /** True while a power flow solve is running — disables the Run Power Flow
   *  control and shows a loading affordance. */
  isSolving?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  /** True when at least one element is plotted on the diagram canvas. Drives
   *  the disabled/tooltip state of Save → Diagram and Save As → Diagram. */
  diagramHasElements?: boolean;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: string;
  checked?: boolean;
  hasSubmenu?: boolean;
  submenu?: (MenuItem | MenuDivider)[];
  /** When true, the item is rendered greyed-out and clicks are ignored. */
  disabled?: boolean;
  /** Tooltip shown on hover (especially useful when disabled). */
  tooltip?: string;
}

interface MenuDivider {
  divider: boolean;
}

interface Menu {
  title: string;
  items: (MenuItem | MenuDivider)[];
}

type MenuItemType = MenuItem | MenuDivider;

export const MenuBar: React.FC<MenuBarProps> = ({
  onMenuClick,
  onToolbarAction,
  healthStatus = 'unhealthy',
  sessionId = null,
  loading = false,
  isSolving = false,
  canUndo = false,
  canRedo = false,
  diagramHasElements = false,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<{menu: string, item: string} | null>(null);
  const [isMenuBarActive, setIsMenuBarActive] = useState(false);
  const submenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { mode, setMode } = useTheme();
  const { currentLanguage, setLanguage, languages } = useLanguage();
  const { t } = useTranslation();
  const { openDialog } = useDialog();
  const { user, isAuthenticated, logout, requireAuth } = useAuth();

  // Type guards
  const isMenuItem = (item: MenuItemType): item is MenuItem => {
    return 'label' in item;
  };

  const isMenuDivider = (item: MenuItemType): item is MenuDivider => {
    return 'divider' in item;
  };

  const menus: Menu[] = [
    {
      title: 'CypressEra',
      items: [
        { label: t('menu.aboutCypressEra'), action: 'about' },
        { divider: true },
        ...(isAuthenticated
          ? [
              { label: user?.email || t('menu.signedIn', { defaultValue: 'Signed in' }) } as MenuItem,
              { divider: true } as MenuDivider,
              { label: t('menu.logout', { defaultValue: 'Log Out' }), action: 'account-logout' } as MenuItem,
            ]
          : [
              { label: t('menu.login', { defaultValue: 'Login' }), action: 'account-login' } as MenuItem,
            ]
        ),
      ],
    },
    {
      title: t('menu.file'),
      items: [
        { label: t('menu.open'), shortcut: '⌘O', action: 'open-file' },
        {
          label: t('menu.upload'),
          shortcut: '⌘U',
          hasSubmenu: true,
          submenu: [
            { label: t('menu.uploadModel'), action: 'upload-model' },
            { label: t('menu.uploadKnowledgeBase'), action: 'upload-knowledge-base' },
            { divider: true },
            { label: t('menu.uploadSubsystem'), action: 'upload-sub' },
            { label: t('menu.uploadMonitor'), action: 'upload-mon' },
            { label: t('menu.uploadContingency'), action: 'upload-con' },
            { divider: true },
            { label: t('menu.uploadDiagram'), action: 'upload-diagram' },
          ]
        },
        {
          label: t('menu.save'),
          hasSubmenu: true,
          submenu: [
            { label: t('menu.saveModel'), shortcut: '⌘S', action: 'save-model' },
            {
              label: t('menu.saveDiagram'),
              shortcut: '⌥⌘S',
              action: 'save-diagram',
              disabled: !diagramHasElements,
              tooltip: diagramHasElements ? undefined : t('menu.saveDiagramDisabledTooltip', { defaultValue: 'Plot the diagram first.' }),
            },
          ]
        },
        {
          label: t('menu.saveAs'),
          hasSubmenu: true,
          submenu: [
            { label: t('menu.saveAsModel'), shortcut: '⌘⇧S', action: 'save-as-model' },
            {
              label: t('menu.saveAsDiagram'),
              action: 'save-as-diagram',
              disabled: !diagramHasElements,
              tooltip: diagramHasElements ? undefined : t('menu.saveDiagramDisabledTooltip', { defaultValue: 'Plot the diagram first.' }),
            },
          ]
        },
        { divider: true },
        { label: t('menu.exportResults'), shortcut: '⌘E', action: 'export-results' },
      ],
    },
    {
      title: t('menu.edit'),
      items: [
        { label: t('menu.undo'), shortcut: '⌘Z', action: 'undo' },
        { label: t('menu.redo'), shortcut: '⌘⇧Z', action: 'redo' },
        { divider: true },
        { label: t('menu.copy'), shortcut: '⌘C' },
        { label: t('menu.paste'), shortcut: '⌘V' },
      ],
    },
    {
      title: t('menu.powerFlow'),
      items: [
        { label: t('menu.dcPowerFlow'), shortcut: '⌘1', action: 'dc-power-flow', disabled: isSolving, tooltip: isSolving ? t('toolbar.solving') : undefined },
        { label: t('menu.acPowerFlow'), shortcut: '⌘2', action: 'ac-power-flow', disabled: isSolving, tooltip: isSolving ? t('toolbar.solving') : undefined },
        { divider: true },
        { label: t('menu.parameters'), action: 'parameters' },
        { label: t('menu.runAnalysis'), shortcut: '⌘R', action: 'run-analysis' },
      ],
    },
    {
      title: t('menu.view'),
      items: [
        { 
          label: t('menu.theme'), 
          hasSubmenu: true,
          submenu: [
            { label: t('menu.lightTheme'), action: 'theme-light', checked: mode === 'light' },
            { label: t('menu.darkTheme'), action: 'theme-dark', checked: mode === 'dark' },
            { label: t('menu.systemTheme'), action: 'theme-system', checked: mode === 'system' },
          ]
        },
        { 
          label: t('menu.language'), 
          hasSubmenu: true,
          submenu: languages.map(lang => ({
            label: lang.nativeName,
            action: `language-${lang.code}`,
            checked: currentLanguage === lang.code
          }))
        },
        { divider: true },
        { label: t('menu.resetLayout'), shortcut: '⌘⇧R', action: 'reset-layout' },
      ],
    },
    {
      title: t('menu.help'),
      items: [
        { label: t('menu.documentation'), action: 'documentation' },
        { label: t('menu.website'), action: 'website' },
      ],
    },
  ];

  const handleMenuEnter = (menu: string) => {
    setActiveMenu(menu);
    setActiveSubmenu(null); // Close any open submenu
    setIsMenuBarActive(true);
  };

  const handleMenuLeave = () => {
    // Clear any pending submenu close timeout
    if (submenuCloseTimeoutRef.current) {
      clearTimeout(submenuCloseTimeoutRef.current);
      submenuCloseTimeoutRef.current = null;
    }
    // Small delay to allow moving between menus
    setTimeout(() => {
      setActiveMenu(null);
      setActiveSubmenu(null);
      setIsMenuBarActive(false);
    }, 100);
  };

  const handleSubmenuEnter = (menu: string, item: string) => {
    // Clear any pending close timeout when entering submenu
    if (submenuCloseTimeoutRef.current) {
      clearTimeout(submenuCloseTimeoutRef.current);
      submenuCloseTimeoutRef.current = null;
    }
    setActiveSubmenu({ menu, item });
  };

  const handleSubmenuLeave = () => {
    // Small delay to allow moving between submenu items
    setTimeout(() => {
      setActiveSubmenu(null);
    }, 100);
  };

  const handleDropdownItemLeave = (menu: string, item: MenuItem) => {
    // Only close submenu if the item has one and we're leaving it
    if (item.hasSubmenu && activeSubmenu?.menu === menu && activeSubmenu?.item === item.label) {
      // Small delay to allow moving to the submenu
      submenuCloseTimeoutRef.current = setTimeout(() => {
        setActiveSubmenu(null);
        submenuCloseTimeoutRef.current = null;
      }, 150);
    }
  };

  const handleItemClick = (menu: string, item: string, action?: string) => {
    // Handle theme actions
    if (action) {
      switch (action) {
        case 'account-login':
          void requireAuth({ reason: 'menu-login' });
          break;
        case 'account-logout':
          logout();
          window.location.reload();
          break;
        case 'theme-light':
          setMode('light');
          break;
        case 'theme-dark':
          setMode('dark');
          break;
        case 'theme-system':
          setMode('system');
          break;
        case 'language-en':
          setLanguage('en');
          break;
        case 'language-fr':
          setLanguage('fr');
          break;
        case 'language-zh':
          setLanguage('zh');
          break;
        case 'language-es':
          setLanguage('es');
          break;
        case 'about':
          // Handle About dialog directly in MenuBar
          openDialog(DIALOG_IDS.ABOUT, About);
          break;
        case 'documentation':
          onMenuClick?.(menu, action);
          break;
        case 'website':
          // Open official website in new tab
          window.open('https://cypressera.ai', '_blank');
          break;
        default:
          // For actions with values (like upload-model, upload-knowledge-base), pass the action
          onMenuClick?.(menu, action);
      }
    } else {
      // For items without actions, pass the label
      onMenuClick?.(menu, item);
    }
    setActiveMenu(null);
    setActiveSubmenu(null);
    setIsMenuBarActive(false);
  };

  // SVG Icon components
  const NewProjectIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
      <polyline points="13 2 13 9 20 9"/>
    </svg>
  );

  const UploadIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );

  const SaveIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  );

  const PlayIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );

  const ChartIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );

  const UndoIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  );

  const RedoIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );

  interface QuickAccessAction {
    icon?: React.ReactNode;
    label?: string;
    action?: string;
    disabled?: boolean;
    /** When true, render a spinner in place of the icon (e.g. solving). */
    loading?: boolean;
    divider?: boolean;
  }

  const quickAccessActions: QuickAccessAction[] = [
    { 
      icon: <UploadIcon />, 
      label: t('toolbar.uploadFile'), 
      action: 'upload-file' 
    },
    { 
      icon: <SaveIcon />, 
      label: t('toolbar.save'), 
      action: 'save' 
    },
    { 
      divider: true 
    },
    {
      icon: <PlayIcon />,
      label: isSolving ? t('toolbar.solving') : t('toolbar.runPowerFlow'),
      action: 'run-power-flow',
      disabled: isSolving,
      loading: isSolving,
    },
    { 
      divider: true 
    },
    { 
      icon: <UndoIcon />, 
      label: t('toolbar.undo'), 
      action: 'undo',
      disabled: !canUndo
    },
    { 
      icon: <RedoIcon />, 
      label: t('toolbar.redo'), 
      action: 'redo',
      disabled: !canRedo
    },
  ];

  const handleToolbarClick = (action: string) => {
    onToolbarAction?.(action);
  };

  return (
    <>
      <div className="menubar" onMouseLeave={handleMenuLeave}>
        <div className="menubar-left">
          <a href="https://cypressera.ai" target="_blank" rel="noopener noreferrer" className="app-icon-link">
            <img src="/logo.svg" alt="CypressEra" className="app-icon" />
          </a>
          <div className="menu-items">
            {menus.map((menu) => (
              <div 
                key={menu.title} 
                className="menu-item"
                onMouseEnter={() => handleMenuEnter(menu.title)}
              >
                <button
                  className={`menu-button ${activeMenu === menu.title ? 'active' : ''}`}
                >
                  {menu.title}
                </button>
                {activeMenu === menu.title && (
                  <div className="dropdown-menu">
                    {menu.items.map((item, idx) =>
                      isMenuDivider(item) ? (
                        <div key={idx} className="menu-divider" />
                      ) : (
                        <div key={idx} className="dropdown-item-wrapper">
                          <button
                            className={`dropdown-item ${item.checked ? 'checked' : ''} ${item.hasSubmenu ? 'has-submenu' : ''} ${item.disabled ? 'disabled' : ''}`}
                            disabled={item.disabled}
                            title={item.tooltip}
                            onClick={() => !item.hasSubmenu && !item.disabled && handleItemClick(menu.title, item.label, item.action)}
                            onMouseEnter={() => item.hasSubmenu && handleSubmenuEnter(menu.title, item.label)}
                            onMouseLeave={() => item.hasSubmenu && handleDropdownItemLeave(menu.title, item)}
                          >
                            <span>
                              {item.checked && <span className="checkmark">✓</span>}
                              {item.label}
                            </span>
                            {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                            {item.hasSubmenu && <span className="submenu-arrow">▶</span>}
                          </button>
                          {item.hasSubmenu && activeSubmenu?.menu === menu.title && activeSubmenu?.item === item.label && (
                            <div className="submenu" onMouseEnter={() => handleSubmenuEnter(menu.title, item.label)} onMouseLeave={handleSubmenuLeave}>
                              {item.submenu?.map((subItem, subIdx) =>
                                isMenuDivider(subItem) ? (
                                  <div key={subIdx} className="menu-divider" />
                                ) : (
                                  <button
                                    key={subIdx}
                                    className={`dropdown-item submenu-item ${subItem.checked ? 'checked' : ''} ${subItem.disabled ? 'disabled' : ''}`}
                                    disabled={subItem.disabled}
                                    title={subItem.tooltip}
                                    onClick={() => !subItem.disabled && handleItemClick(menu.title, subItem.label, subItem.action)}
                                  >
                                    <span>
                                      {subItem.checked && <span className="checkmark">✓</span>}
                                      {subItem.label}
                                    </span>
                                    {subItem.shortcut && <span className="shortcut">{subItem.shortcut}</span>}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="menubar-right">
          {/* Status indicator - always visible */}
          <div className="status-indicator" title={sessionId ? `Session: ${sessionId}` : undefined}>
            {sessionId ? (
              <>
                <span className={`status-dot status-session ${loading ? 'loading' : ''}`}></span>
                <span className="status-text">{t('status.sessionActive')}</span>
              </>
            ) : (
              <>
                <span className={`status-dot status-${healthStatus} ${loading ? 'loading' : ''}`}></span>
                <span className="status-text">
                  {healthStatus === 'healthy' ? t('status.connected') : t('status.disconnected')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Quick Access Toolbar */}
      <div className="quick-access-toolbar">
        {quickAccessActions.map((item, idx) => 
          item.divider ? (
            <div key={idx} className="toolbar-divider" />
          ) : (
            <Tooltip key={idx} content={item.label} placement="bottom">
              <button
                className="toolbar-button"
                onClick={() => item.action && !item.disabled && handleToolbarClick(item.action)}
                disabled={item.disabled}
                style={{ opacity: item.disabled && !item.loading ? 0.5 : 1, cursor: item.disabled ? 'not-allowed' : 'pointer' }}
              >
                {item.icon && (
                  <span className="toolbar-icon">
                    {item.loading ? <span className="toolbar-spinner" aria-hidden="true" /> : item.icon}
                  </span>
                )}
              </button>
            </Tooltip>
          )
        )}
      </div>
    </>
  );
};