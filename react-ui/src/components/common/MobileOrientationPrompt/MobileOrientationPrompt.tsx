import React, { useState, useEffect } from 'react';
import './MobileOrientationPrompt.css';
import { useTranslation } from 'react-i18next';

interface MobileOrientationPromptProps {
  /**
   * Whether to show the prompt (can be controlled externally)
   */
  show?: boolean;
}

/**
 * A component that requires mobile users to rotate their device to landscape mode.
 * Shows only on mobile devices in portrait orientation and blocks access until rotated.
 * 
 * Features:
 * - Detects mobile devices and portrait orientation
 * - Shows a friendly animation suggesting rotation
 * - Blocks access in portrait mode (landscape is mandatory)
 * - Automatically hides when device is rotated to landscape
 */
export const MobileOrientationPrompt: React.FC<MobileOrientationPromptProps> = ({ 
  show = true 
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect if device is mobile
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      // Also check screen width as a fallback
      const isSmallScreen = window.innerWidth <= 768;
      return isMobileDevice || isSmallScreen;
    };

    // Check if device is in portrait mode
    const checkOrientation = () => {
      // Use screen.orientation if available, otherwise fall back to dimensions
      if (window.screen.orientation) {
        return window.screen.orientation.type.includes('portrait');
      }
      // Fallback for older browsers
      return window.innerHeight > window.innerWidth;
    };

    const updateState = () => {
      const mobile = checkMobile();
      const portrait = checkOrientation();
      
      setIsMobile(mobile);
      setIsPortrait(portrait);
      
      // Show prompt only on mobile devices in portrait mode
      if (show && mobile && portrait) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Initial check
    updateState();

    // Listen for orientation changes
    const handleOrientationChange = () => {
      // Small delay to ensure dimensions are updated
      setTimeout(updateState, 100);
    };

    // Listen for resize events (covers orientation changes on some devices)
    window.addEventListener('resize', handleOrientationChange);
    
    // Listen for orientation change events
    if (window.screen.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    } else {
      // Fallback for older browsers
      window.addEventListener('orientationchange', handleOrientationChange);
    }

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      if (window.screen.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      } else {
        window.removeEventListener('orientationchange', handleOrientationChange);
      }
    };
  }, [show]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="mobile-orientation-overlay">
      <div className="mobile-orientation-content">
        <div className="rotation-animation">
          <div className="phone-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="1" width="14" height="22" rx="2" ry="2" />
              <line x1="12" y1="19" x2="12" y2="19" />
            </svg>
          </div>
          <div className="rotate-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </div>
        </div>
        
        <h2 className="orientation-title">
          {t('mobileOrientation.welcome', 'Welcome to CypressEra')}
        </h2>
        
        <p className="orientation-subtitle">
          {t('mobileOrientation.subtitle', 'AI-automated Power System Analysis Platform')}
        </p>
        
        <p className="orientation-message">
          {t('mobileOrientation.message', 'For better user experience, please rotate your device to landscape mode.')}
        </p>
      </div>
    </div>
  );
};
