'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import GlobalControls from './GlobalControls';
import SwatchGrid from './SwatchGrid';
import HSLSliders from './HSLSliders';
import SelectionFilterPanel from './SelectionFilterPanel';
import OklchHarmonizePanel from './OklchHarmonizePanel';
import { globalHslSelectionHasConstraints } from '@/utils/selectionFilter';
import styles from './ColorEditor.module.css';
import { useColorStore } from '@/hooks/useColorStore';

export default function ColorEditor() {
  const fileName = useColorStore(s => s.fileName);
  const originalLines = useColorStore(s => s.originalLines);
  const currentColors = useColorStore(s => s.currentColors);
  const currentRgbaColors = useColorStore(s => s.currentRgbaColors);
  const activeToken = useColorStore(s => s.activeToken);
  const setActiveToken = useColorStore(s => s.setActiveToken);
  const updateColor = useColorStore(s => s.updateColor);
  const updateRgbaColor = useColorStore(s => s.updateRgbaColor);
  const globalHslSelectionFilter = useColorStore(s => s.globalHslSelectionFilter);

  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  const [filterPopoverLayout, setFilterPopoverLayout] = useState<{
    top: number;
    right: number;
    maxHeight: number;
  } | null>(null);

  const [showHarmonizePopover, setShowHarmonizePopover] = useState(false);
  const harmonizeToggleRef = useRef<HTMLButtonElement>(null);
  const [harmonizePopoverLayout, setHarmonizePopoverLayout] = useState<{
    top: number;
    right: number;
    maxHeight: number;
  } | null>(null);

  const layoutForButton = useCallback(
    (el: HTMLElement | null, open: boolean) => {
      if (!el || !open) return null;
      const rect = el.getBoundingClientRect();
      const gap = 8;
      const bottomReserve = 20;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const maxHeight = Math.max(180, Math.floor(vh - rect.bottom - gap - bottomReserve));
      return {
        top: rect.bottom + gap,
        right: Math.max(12, window.innerWidth - rect.right),
        maxHeight,
      };
    },
    [],
  );

  const updateFilterPopoverLayout = useCallback(() => {
    setFilterPopoverLayout(layoutForButton(filterToggleRef.current, showFilterPopover));
  }, [showFilterPopover, layoutForButton]);

  const updateHarmonizePopoverLayout = useCallback(() => {
    setHarmonizePopoverLayout(layoutForButton(harmonizeToggleRef.current, showHarmonizePopover));
  }, [showHarmonizePopover, layoutForButton]);

  useEffect(() => {
    if (!showFilterPopover) return;
    const onChange = () => updateFilterPopoverLayout();
    onChange();
    const raf = requestAnimationFrame(() => onChange());
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onChange);
    vv?.addEventListener('scroll', onChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      vv?.removeEventListener('resize', onChange);
      vv?.removeEventListener('scroll', onChange);
    };
  }, [showFilterPopover, updateFilterPopoverLayout]);

  useEffect(() => {
    if (!showHarmonizePopover) return;
    const onChange = () => updateHarmonizePopoverLayout();
    onChange();
    const raf = requestAnimationFrame(() => onChange());
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onChange);
    vv?.addEventListener('scroll', onChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      vv?.removeEventListener('resize', onChange);
      vv?.removeEventListener('scroll', onChange);
    };
  }, [showHarmonizePopover, updateHarmonizePopoverLayout]);

  const hexCount = Object.keys(currentColors).length;
  const totalLines = originalLines.length;

  const currentHsl = activeToken 
    ? (activeToken.isRgba ? currentRgbaColors[activeToken.name] : currentColors[activeToken.name])
    : null;
  const currentAlpha = activeToken && activeToken.isRgba && currentHsl ? (currentHsl as any).a : 1;

  const [isDragging, setIsDragging] = useState(false);
  const loadCss = useColorStore(s => s.loadCss);
  const usageOverlayEnabled = useColorStore(s => s.usageOverlayEnabled);
  const setUsageOverlayEnabled = useColorStore(s => s.setUsageOverlayEnabled);

  useEffect(() => {
    try {
      if (localStorage.getItem('token-editor-usage-overlay') === '1') {
        setUsageOverlayEnabled(true);
      }
    } catch {
      /* ignore */
    }
  }, [setUsageOverlayEnabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only reset dragging if leaving the main window
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) loadCss(text, file.name);
      };
      reader.readAsText(file);
    }
  }, [loadCss]);

  return (
    <div 
      className={styles.editor}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragContent}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path d="M32 8 L32 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M20 28 L32 40 L44 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 48 L10 52 C10 54.2 11.8 56 14 56 L50 56 C52.2 56 54 54.2 54 52 L54 48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <h2>Drop CSS file to load instantly</h2>
          </div>
        </div>
      )}

      <GlobalControls />

      <div className={styles.info}>
        <div className={styles.fileInfo}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className={styles.fileName}>{fileName}</span>
          <span className={styles.stats}>{hexCount} colors · {totalLines} lines</span>
          <button className={styles.newFileBtn} onClick={() => {
            useColorStore.setState({
              isLoaded: false,
              originalLines: [],
              currentColors: {},
              currentRgbaColors: {},
              oklchHarmonizeExportTokenKeys: [],
            });
            localStorage.removeItem('token-editor-state');
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            New File
          </button>
        </div>
        <div className={styles.infoActions}>
          <label
            className={`${styles.filterToggle} ${usageOverlayEnabled ? styles.filterActive : ''}`}
            title="Show token usage counts on swatches"
          >
            <input
              type="checkbox"
              className={styles.usageSwitchInput}
              checked={usageOverlayEnabled}
              onChange={(e) => {
                const v = e.target.checked;
                setUsageOverlayEnabled(v);
                try {
                  localStorage.setItem('token-editor-usage-overlay', v ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
            />
            <span className={styles.usageSwitchUi} aria-hidden />
            Usage
          </label>

          <button
            ref={filterToggleRef}
            type="button"
            className={`${styles.filterToggle} ${globalHslSelectionHasConstraints(globalHslSelectionFilter) || globalHslSelectionFilter.globalHslFrozenTokenKeys !== null ? styles.filterActive : ''}`}
            onClick={() => {
              if (showFilterPopover) {
                setShowFilterPopover(false);
                setFilterPopoverLayout(null);
                return;
              }
              setShowHarmonizePopover(false);
              setHarmonizePopoverLayout(null);
              setFilterPopoverLayout(layoutForButton(filterToggleRef.current, true));
              setShowFilterPopover(true);
            }}
            title="Advanced Selection Filters"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V19l-4 2v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter Rules
          </button>

          <button
            ref={harmonizeToggleRef}
            type="button"
            className={`${styles.harmonizeToggle} ${showHarmonizePopover ? styles.harmonizeActive : ''}`}
            onClick={() => {
              if (showHarmonizePopover) {
                setShowHarmonizePopover(false);
                setHarmonizePopoverLayout(null);
                return;
              }
              setShowFilterPopover(false);
              setFilterPopoverLayout(null);
              setHarmonizePopoverLayout(layoutForButton(harmonizeToggleRef.current, true));
              setShowHarmonizePopover(true);
            }}
            title="Match lightness and chroma to a reference group in OKLCH"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            OKLCH harmonize
          </button>
          
          {showFilterPopover &&
            filterPopoverLayout &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className={styles.popoverAnchor}
                style={{
                  top: filterPopoverLayout.top,
                  right: filterPopoverLayout.right,
                  maxHeight: `${filterPopoverLayout.maxHeight}px`,
                }}
              >
                <div className={styles.popoverScroll}>
                  <SelectionFilterPanel
                    onClose={() => {
                      setShowFilterPopover(false);
                      setFilterPopoverLayout(null);
                    }}
                  />
                </div>
              </div>,
              document.body,
            )}

          {showHarmonizePopover &&
            harmonizePopoverLayout &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className={styles.popoverAnchor}
                style={{
                  top: harmonizePopoverLayout.top,
                  right: harmonizePopoverLayout.right,
                  maxHeight: `${harmonizePopoverLayout.maxHeight}px`,
                }}
              >
                <div className={styles.popoverScroll}>
                  <OklchHarmonizePanel
                    key={fileName}
                    onClose={() => {
                      setShowHarmonizePopover(false);
                      setHarmonizePopoverLayout(null);
                    }}
                  />
                </div>
              </div>,
              document.body,
            )}

          <a href="mds-storybook/" target="_blank" rel="noopener noreferrer" className={styles.storybookBtn} title="Open Storybook Preview with live sync (new tab)">
            <img src="https://cdn.brandfetch.io/idW0vT7wby/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1668515568131" width="16" height="16" alt="Storybook" />
            Storybook Preview
            <span className={styles.liveDot} />
          </a>
        </div>
      </div>

      <div className={styles.swatchArea}>
        <SwatchGrid />
      </div>

      {activeToken && currentHsl && (
        <HSLSliders
          hsl={currentHsl}
          tokenName={activeToken.name}
          isRgba={activeToken.isRgba}
          alpha={currentAlpha}
          onChange={(newHsl) => {
            if (activeToken.isRgba) {
              updateRgbaColor(activeToken.name, { ...newHsl, a: currentAlpha });
            } else {
              updateColor(activeToken.name, newHsl);
            }
          }}
          onAlphaChange={(a) => {
            if (activeToken.isRgba) {
              updateRgbaColor(activeToken.name, { ...currentHsl, a });
            }
          }}
          onClose={() => setActiveToken(null)}
        />
      )}
    </div>
  );
}
