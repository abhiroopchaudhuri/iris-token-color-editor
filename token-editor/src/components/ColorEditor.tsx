'use client';

import React, { useState, useCallback } from 'react';
import GlobalControls from './GlobalControls';
import SwatchGrid from './SwatchGrid';
import HSLSliders from './HSLSliders';
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

  const hexCount = Object.keys(currentColors).length;
  const totalLines = originalLines.length;

  const currentHsl = activeToken 
    ? (activeToken.isRgba ? currentRgbaColors[activeToken.name] : currentColors[activeToken.name])
    : null;
  const currentAlpha = activeToken && activeToken.isRgba && currentHsl ? (currentHsl as any).a : 1;

  const [isDragging, setIsDragging] = useState(false);
  const loadCss = useColorStore(s => s.loadCss);

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
        </div>
        <div className={styles.infoActions}>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/mds-storybook/`} target="_blank" rel="noopener noreferrer" className={styles.storybookBtn} title="Open Storybook Preview with live sync (new tab)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
            Storybook Preview
            <span className={styles.liveDot} />
          </a>
          <button className={styles.newFileBtn} onClick={() => {
            useColorStore.setState({ isLoaded: false, originalLines: [], currentColors: {}, currentRgbaColors: {} });
            localStorage.removeItem('token-editor-state');
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            New File
          </button>
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
