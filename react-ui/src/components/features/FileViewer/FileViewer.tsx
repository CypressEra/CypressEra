import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { BaseModal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { PowerFlowApp } from '../../../sdk';
import { useTranslation } from 'react-i18next';
import './FileViewer.css';

// Set up PDF.js worker using local file from public folder
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface FileViewerProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileType?: 'model' | 'knowledge' | 'sub' | 'mon' | 'con' | 'diagram';
}

export const FileViewer: React.FC<FileViewerProps> = ({
  isOpen,
  onClose,
  fileName,
  fileType = 'knowledge',
}) => {
  const { t } = useTranslation();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const pdfViewerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const preZoomRef = useRef<{
    scrollLeft: number;
    scrollTop: number;
    anchorX: number;
    anchorY: number;
    fromScale: number;
  } | null>(null);
  // Tracks the "intended" scroll position, independent of the browser-clamped
  // DOM value. react-pdf resizes canvases asynchronously, so during a zoom
  // step the browser may clamp scrollLeft/Top to a small value because the
  // doc hasn't grown yet. Without this we'd capture the clamped 0 as the
  // "current" scroll on the next wheel event and the position would drift
  // back to the top-left.
  const intendedScrollRef = useRef({ left: 0, top: 0 });
  const programmaticScrollRef = useRef(false);

  const captureZoomAnchor = useCallback(
    (cursor: { x: number; y: number } | null) => {
      const container = pdfViewerRef.current;
      if (!container) return;

      // Cursor zooms anchor at the pointer; button zooms anchor at top-center
      // so the top of the visible content stays where it is.
      preZoomRef.current = {
        scrollLeft: intendedScrollRef.current.left,
        scrollTop: intendedScrollRef.current.top,
        anchorX: cursor ? cursor.x : container.clientWidth / 2,
        anchorY: cursor ? cursor.y : 0,
        fromScale: scale,
      };
    },
    [scale],
  );

  // Check if file is PDF
  const isPDF = fileName.toLowerCase().endsWith('.pdf');
  // Plain-text study files (subsystem / monitor / contingency) — rendered as text.
  const isText = /\.(sub|mon|con)$/i.test(fileName);

  // Load file when modal opens
  useEffect(() => {
    if (isOpen && fileName) {
      loadFile();
    } else {
      // Cleanup when modal closes
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
        setFileUrl(null);
      }
      setFileBlob(null);
      setFileText(null);
      setPageNumber(1);
      setPageInput('1');
      setIsEditingPage(false);
      setNumPages(null);
      setError(null);
      setIsMaximized(false); // Reset maximized state when modal closes
    }

    return () => {
      // Cleanup on unmount
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [isOpen, fileName]);

  // react-pdf's TextLayer logs an AbortException warning every time a
  // scale change cancels an in-flight text-layer render — harmless but
  // very noisy during continuous wheel zoom. Suppress just that message
  // while the viewer is open.
  useEffect(() => {
    if (!isOpen || !isPDF) return;
    const original = console.error;
    console.error = (...args: unknown[]) => {
      const first = args[0];
      const message =
        typeof first === 'string'
          ? first
          : first instanceof Error
            ? first.message
            : '';
      if (
        message.includes('AbortException') &&
        message.includes('TextLayer task cancelled')
      ) {
        return;
      }
      original.apply(console, args);
    };
    return () => {
      console.error = original;
    };
  }, [isOpen, isPDF]);

  const loadFile = useCallback(async () => {
    if (!fileName) return;

    setLoading(true);
    setError(null);

    try {
      // Download file using SDK (userId is handled by SDK automatically)
      const blob = await PowerFlowApp.downloadUserFile(fileName, fileType);
      setFileBlob(blob);

      // Create object URL for the blob (used by the PDF branch and the
      // toolbar Download button in the text branch).
      const url = URL.createObjectURL(blob);
      setFileUrl(url);

      if (isText) {
        try {
          const text = await blob.text();
          setFileText(text);
        } catch (decodeErr: any) {
          console.error('Failed to decode file as text:', decodeErr);
          setError(
            t('common:fileViewer.textDecodeError', 'Failed to decode file as text'),
          );
        }
      }
    } catch (err: any) {
      console.error('Failed to load file:', err);
      setError(err.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [fileName, fileType, isText, t]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput('1');
  };

  // Handle mouse wheel zoom (Ctrl/Cmd + scroll)
  useEffect(() => {
    if (!isPDF || !isOpen) return;

    let rafId: number | null = null;
    let accumulatedDelta = 0;
    let lastUpdateTime = 0;

    const updateScale = (timestamp: number) => {
      // Throttle updates to ~60fps for smoother transitions
      if (timestamp - lastUpdateTime < 16) {
        rafId = requestAnimationFrame(updateScale);
        return;
      }

      if (Math.abs(accumulatedDelta) > 0.5) {
        setScale((prev) => {
          // Use exponential scaling for smoother, more natural zoom
          const zoomFactor = 1 + (accumulatedDelta * 0.001);
          const newScale = Math.max(0.5, Math.min(3.0, prev * zoomFactor));
          accumulatedDelta = 0; // Reset after update
          return Math.round(newScale * 100) / 100;
        });
        lastUpdateTime = timestamp;
      } else {
        accumulatedDelta = 0;
      }
      rafId = null;
    };

    const handleWheel = (e: WheelEvent) => {
      const container = pdfViewerRef.current;
      if (!container) return;

      // Check if the event target is within the PDF viewer
      const target = e.target as HTMLElement;
      if (!container.contains(target)) return;

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      const isZoomKey = e.ctrlKey || e.metaKey;
      
      if (isZoomKey) {
        e.preventDefault();
        e.stopPropagation();

        // Capture pre-zoom scroll/anchor on the first event of a batch
        // (preZoomRef stays set until the zoom effect consumes it after
        // setScale fires). Update the cursor anchor on later events.
        const rect = container.getBoundingClientRect();
        const cursor = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        if (!preZoomRef.current) {
          captureZoomAnchor(cursor);
        } else {
          preZoomRef.current.anchorX = cursor.x;
          preZoomRef.current.anchorY = cursor.y;
        }

        // Accumulate the scroll delta (invert for natural zoom direction)
        accumulatedDelta -= e.deltaY;

        // Use requestAnimationFrame to batch updates for smooth transitions
        if (rafId === null) {
          rafId = requestAnimationFrame(updateScale);
        }
      }
    };

    // Listen on window level to catch all wheel events
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isPDF, isOpen, captureZoomAnchor]);

  // Apply the pre-zoom anchor captured in event handlers using the simple
  // ratio formula. react-pdf resizes its canvases in useEffect (async), so
  // the doc may not have grown when we first try to apply — keep retrying
  // until the browser stops clamping.
  // Apply in useEffect (not useLayoutEffect) so it runs after react-pdf's own
  // useEffect has resized canvases. Otherwise we apply against a transiently
  // small scrollWidth/Height and the browser clamps our target to 0, painting
  // that as a top-left flash before the RAF retry recovers.
  useEffect(() => {
    const data = preZoomRef.current;
    if (!data) return;
    preZoomRef.current = null;

    const container = pdfViewerRef.current;
    if (!container || data.fromScale === scale) return;

    const ratio = scale / data.fromScale;
    const targetLeft = Math.max(
      0,
      (data.scrollLeft + data.anchorX) * ratio - data.anchorX,
    );
    const targetTop = Math.max(
      0,
      (data.scrollTop + data.anchorY) * ratio - data.anchorY,
    );

    intendedScrollRef.current = { left: targetLeft, top: targetTop };
    programmaticScrollRef.current = true;

    let frame = 0;
    let rafId: number | null = null;
    const apply = () => {
      container.scrollLeft = targetLeft;
      container.scrollTop = targetTop;
      const settled =
        Math.abs(container.scrollLeft - targetLeft) < 1 &&
        Math.abs(container.scrollTop - targetTop) < 1;
      if (settled || frame >= 60) {
        rafId = null;
        programmaticScrollRef.current = false;
        return;
      }
      frame++;
      rafId = requestAnimationFrame(apply);
    };
    apply();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      programmaticScrollRef.current = false;
    };
  }, [scale]);

  // Sync intendedScrollRef with user-initiated scrolls only. Ignore the
  // scroll events fired by our programmatic apply (which may be clamped).
  useEffect(() => {
    const container = pdfViewerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      intendedScrollRef.current = {
        left: container.scrollLeft,
        top: container.scrollTop,
      };
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [fileUrl, isPDF]);

  // Track scroll position to update current page
  useEffect(() => {
    const container = pdfViewerRef.current;
    if (!container || !numPages) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const viewportCenter = scrollTop + containerHeight / 2;

      let currentPage = 1;
      let minDistance = Infinity;

      // Find the page closest to the viewport center
      for (let i = 1; i <= numPages; i++) {
        const pageElement = pageRefs.current.get(i);
        if (pageElement) {
          const pageTop = pageElement.offsetTop;
          const pageHeight = pageElement.offsetHeight;
          const pageCenter = pageTop + pageHeight / 2;
          const distance = Math.abs(viewportCenter - pageCenter);

          if (distance < minDistance) {
            minDistance = distance;
            currentPage = i;
          }
        }
      }

      setPageNumber(currentPage);
    };

    container.addEventListener('scroll', handleScroll);
    // Initial check after a short delay to ensure pages are rendered
    const timeoutId = setTimeout(handleScroll, 100);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [numPages, scale]);

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
  };

  const goToPrevPage = () => {
    const targetPage = Math.max(1, pageNumber - 1);
    scrollToPage(targetPage);
  };

  const goToNextPage = () => {
    const targetPage = Math.min(numPages || 1, pageNumber + 1);
    scrollToPage(targetPage);
  };

  const scrollToPage = (targetPage: number) => {
    const pageElement = pageRefs.current.get(targetPage);
    if (pageElement && pdfViewerRef.current) {
      const container = pdfViewerRef.current;
      
      // Calculate scroll position to center the page
      // Use offsetTop relative to the container
      const pageTop = pageElement.offsetTop;
      const pageHeight = pageElement.offsetHeight;
      const containerHeight = container.clientHeight;
      
      const scrollTop = pageTop - (containerHeight / 2) + (pageHeight / 2);
      
      // Update page number immediately
      setPageNumber(targetPage);
      setPageInput(targetPage.toString());
      
      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth',
      });
    }
  };

  // Sync pageInput with pageNumber when not editing
  useEffect(() => {
    if (!isEditingPage) {
      setPageInput(pageNumber.toString());
    }
  }, [pageNumber, isEditingPage]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputFocus = () => {
    setIsEditingPage(true);
  };

  const handlePageInputBlur = () => {
    setIsEditingPage(false);
    // If input is empty or invalid, restore current page
    const inputValue = parseInt(pageInput, 10);
    if (isNaN(inputValue) || !numPages || inputValue < 1 || inputValue > numPages) {
      setPageInput(pageNumber.toString());
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJumpToPage();
      e.currentTarget.blur(); // Exit edit mode
    } else if (e.key === 'Escape') {
      setPageInput(pageNumber.toString());
      e.currentTarget.blur(); // Exit edit mode without changing
    }
  };

  const handleJumpToPage = () => {
    const inputValue = parseInt(pageInput, 10);
    if (!isNaN(inputValue) && numPages) {
      const targetPage = Math.max(1, Math.min(numPages, inputValue));
      scrollToPage(targetPage);
      setIsEditingPage(false);
    }
  };

  const setPageRef = (pageNum: number) => (element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNum, element);
    } else {
      pageRefs.current.delete(pageNum);
    }
  };

  const zoomIn = () => {
    captureZoomAnchor(null);
    setScale((prev) => Math.min(3.0, prev + 0.25));
  };

  const zoomOut = () => {
    captureZoomAnchor(null);
    setScale((prev) => Math.max(0.5, prev - 0.25));
  };

  const resetZoom = () => {
    captureZoomAnchor(null);
    setScale(1.0);
  };

  const handleDownload = () => {
    if (fileBlob && fileUrl) {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={fileName}
      width={900}
      height={1000}
      modal={true}
      maskClosable={true}
      draggable={true}
      resizable={true}
      showTrafficLights={true}
      isMaximized={isMaximized}
      onMaximize={() => setIsMaximized(!isMaximized)}
      className="file-viewer-modal"
    >
      <div className="file-viewer-container">
        {loading && (
          <div className="file-viewer-loading">
            <div className="spinner"></div>
            <p>{t('common:fileViewer.loadingFile')}</p>
          </div>
        )}

        {error && (
          <div className="file-viewer-error">
            <p>❌ {error}</p>
            <Button onClick={loadFile} variant="primary" size="medium">
              {t('common:fileViewer.retry')}
            </Button>
          </div>
        )}

        {!loading && !error && fileUrl && isPDF && (
          <div className="file-viewer-content">
            <div className="file-viewer-toolbar">
              <div className="toolbar-group">
                <button
                  onClick={goToPrevPage}
                  disabled={pageNumber <= 1}
                  className="toolbar-button"
                  title={t('common:fileViewer.previousPage')}
                >
                  ←
                </button>
                <span className="page-info">
                  <input
                    type="number"
                    min="1"
                    max={numPages || 1}
                    value={pageInput}
                    onChange={handlePageInputChange}
                    onFocus={handlePageInputFocus}
                    onBlur={handlePageInputBlur}
                    onKeyDown={handlePageInputKeyDown}
                    className="page-input"
                    title={t('common:fileViewer.editPageTooltip')}
                  />
                  {' / '}
                  {numPages || '?'}
                </span>
                <button
                  onClick={goToNextPage}
                  disabled={pageNumber >= (numPages || 1)}
                  className="toolbar-button"
                  title={t('common:fileViewer.nextPage')}
                >
                  →
                </button>
              </div>

              <div className="toolbar-group">
                <button
                  onClick={zoomOut}
                  className="toolbar-button"
                  title={t('common:fileViewer.zoomOut')}
                >
                  −
                </button>
                <span className="zoom-info">{Math.round(scale * 100)}%</span>
                <button
                  onClick={zoomIn}
                  className="toolbar-button"
                  title={t('common:fileViewer.zoomIn')}
                >
                  +
                </button>
                <button
                  onClick={resetZoom}
                  className="toolbar-button reset-zoom-button"
                  title={t('common:fileViewer.resetZoom')}
                >
                  ⟲
                </button>
              </div>

              <div className="toolbar-group">
                <Button
                  onClick={handleDownload}
                  variant="secondary"
                  size="small"
                  title={t('common:fileViewer.downloadFile')}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ marginRight: '4px' }}
                  >
                    <path
                      d="M6.5 9.5L3 6M6.5 9.5L10 6M6.5 9.5V1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M1 11.5H12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {t('common:fileViewer.download')}
                </Button>
              </div>
            </div>

            <div className="pdf-viewer" ref={pdfViewerRef}>
              <Document
                file={fileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="pdf-loading">
                    <div className="spinner"></div>
                    <p>{t('common:fileViewer.loadingPdf')}</p>
                  </div>
                }
              >
                {numPages &&
                  Array.from({ length: numPages }, (_, index) => {
                    const pageNum = index + 1;
                    return (
                      <div
                        key={pageNum}
                        ref={setPageRef(pageNum)}
                        className="pdf-page-wrapper"
                      >
                        <Page
                          pageNumber={pageNum}
                          scale={scale}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                        />
                      </div>
                    );
                  })}
              </Document>
            </div>
          </div>
        )}

        {!loading && !error && fileUrl && isText && fileText !== null && (
          <div className="file-viewer-content">
            <div className="file-viewer-toolbar">
              <div className="toolbar-group">
                <span className="file-viewer-text-name">{fileName}</span>
              </div>
              <div className="toolbar-group" />
              <div className="toolbar-group">
                <Button
                  onClick={handleDownload}
                  variant="secondary"
                  size="small"
                  title={t('common:fileViewer.downloadFile')}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ marginRight: '4px' }}
                  >
                    <path
                      d="M6.5 9.5L3 6M6.5 9.5L10 6M6.5 9.5V1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M1 11.5H12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {t('common:fileViewer.download')}
                </Button>
              </div>
            </div>
            <pre className="file-viewer-text">{fileText}</pre>
          </div>
        )}

        {!loading && !error && fileUrl && !isPDF && !isText && (
          <div className="file-viewer-content">
            <div className="file-viewer-non-pdf">
              <p>{t('common:fileViewer.previewNotAvailable')}</p>
              <p>{t('common:fileViewer.file')}: {fileName}</p>
              <Button
                onClick={handleDownload}
                variant="primary"
                size="medium"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 13 13"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ marginRight: '6px' }}
                >
                  <path
                    d="M6.5 9.5L3 6M6.5 9.5L10 6M6.5 9.5V1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M1 11.5H12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                {t('common:fileViewer.downloadFileButton')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
};

