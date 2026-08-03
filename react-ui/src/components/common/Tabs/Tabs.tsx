import React from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  /** Tab definitions, rendered left-to-right. */
  tabs: TabItem[];
  /** Id of the currently active tab. */
  activeId: string;
  /** Called with the tab id when a tab is selected. */
  onChange: (id: string) => void;
  /** Extra class applied to the tab strip container. */
  className?: string;
  /** Accessible label for the tablist. */
  ariaLabel?: string;
}

/**
 * Controlled segmented tab strip, styled to match the app's `.view-tabs`
 * pill pattern. The caller owns the active id and renders the panel itself.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onChange, className, ariaLabel }) => {
  return (
    <div
      className={`${styles.tabs}${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => {
              if (!tab.disabled) onChange(tab.id);
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
