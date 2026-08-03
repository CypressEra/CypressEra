import React, {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  /** Tooltip text. Empty content renders the child without a tooltip. */
  content: React.ReactNode;
  /** Side of the target the tip appears on. */
  placement?: 'top' | 'bottom';
  /** Hover delay before showing, in milliseconds. */
  delayMs?: number;
  /** Show only when the target's text is actually truncated (ellipsized) —
   *  for cells/labels where the tooltip would otherwise repeat visible text. */
  onlyWhenTruncated?: boolean;
  /** Suppress the tooltip (e.g. while the control is in an active state). */
  disabled?: boolean;
  /** Single element that receives the hover handlers (no wrapper is added,
   *  so table semantics like th/td stay valid). */
  children: React.ReactElement;
}

const GAP = 6; // px between target and tip (bridged by the arrow)

/** The app-wide tooltip: macOS help-tag styling shared with the menu bar and
 *  AI assistant. Portalled to document.body so it never clips inside scroll
 *  containers or transformed ancestors (modals), and clamped to the viewport
 *  with its arrow kept on the target's center. */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  delayMs = 300,
  onlyWhenTruncated = false,
  disabled = false,
  children,
}) => {
  // Anchor rect captured on hover; the tip positions itself from it.
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; centerX: number } | null>(
    null,
  );
  const timer = useRef<number | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setAnchor(null);
  }, []);

  // Never leave a pending timer or visible tip behind on unmount.
  useEffect(() => hide, [hide]);

  const show = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      const target = e.currentTarget;
      if (onlyWhenTruncated && target.scrollWidth <= target.clientWidth) return;
      const r = target.getBoundingClientRect();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setAnchor({ top: r.top, bottom: r.bottom, centerX: r.left + r.width / 2 });
      }, delayMs);
    },
    [delayMs, disabled, onlyWhenTruncated],
  );

  // Measure the rendered tip, clamp it to the viewport, and point the arrow
  // at the target's center. Runs before paint, so there is no flicker.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!anchor || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.centerX - w / 2, window.innerWidth - w - 8));
    el.style.left = `${left}px`;
    el.style.top = placement === 'top' ? `${anchor.top - h - GAP}px` : `${anchor.bottom + GAP}px`;
    const arrowLeft = Math.max(10, Math.min(anchor.centerX - left - 5, w - 20));
    el.style.setProperty('--arrow-left', `${arrowLeft}px`);
    el.style.visibility = 'visible';
  }, [anchor, placement]);

  if (!isValidElement(children)) return children;
  if (content == null || content === '') return children;

  const childProps: any = (children as React.ReactElement<any>).props;
  const child = cloneElement(children as React.ReactElement<any>, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      show(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {anchor &&
        createPortal(
          <div
            ref={tipRef}
            className={`${styles.tip} ${placement === 'top' ? styles.top : styles.bottom}`}
            role="tooltip"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
};
