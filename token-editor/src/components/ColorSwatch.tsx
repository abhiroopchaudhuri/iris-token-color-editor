'use client';

import React, { useState, useCallback } from 'react';
import { useColorStore } from '@/hooks/useColorStore';
import { hslToHex, getContrastColor, hslToRgb } from '@/utils/colorUtils';
import { tokenShowsGlobalSelectionHighlight } from '@/utils/selectionFilter';
import styles from './ColorSwatch.module.css';

interface ColorSwatchProps {
  tokenName: string;
  isRgba?: boolean;
}

export default function ColorSwatch({ tokenName, isRgba = false }: ColorSwatchProps) {
  const hsl = useColorStore(s => isRgba ? s.currentRgbaColors[tokenName] : s.currentColors[tokenName]);
  const isLocked = useColorStore(s => s.lockedTokens.has(tokenName));
  const inGlobalSelection = useColorStore((s) => {
    const f = s.globalHslSelectionFilter;
    const c = isRgba ? s.currentRgbaColors[tokenName] : s.currentColors[tokenName];
    if (!c) return false;
    return tokenShowsGlobalSelectionHighlight(tokenName, isRgba, c, f);
  });
  const updateRgbaColor = useColorStore(s => s.updateRgbaColor);
  const toggleLock = useColorStore(s => s.toggleLock);
  const setActiveToken = useColorStore(s => s.setActiveToken);

  if (!hsl) return null;

  const hex = hslToHex(hsl.h, hsl.s, hsl.l);
  const alpha = isRgba ? (hsl as unknown as { a: number }).a : 1;
  const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l);
  const bgColor = isRgba ? `rgba(${r}, ${g}, ${b}, ${alpha})` : hex;
  const contrastColor = getContrastColor(hex);
  const shortName = tokenName.replace('--color-', '--').replace('--', '');

  const handleToggleSliders = useCallback(() => {
    setActiveToken({ name: tokenName, isRgba });
  }, [tokenName, isRgba, setActiveToken]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.swatchOuter}>
        <div className={styles.checkerboard} />
        <div
          className={`${styles.swatch} ${isLocked ? styles.locked : ''} ${inGlobalSelection ? styles.selectionMatch : ''}`}
          style={{ backgroundColor: bgColor }}
          onClick={handleToggleSliders}
        >
          <span className={styles.hexLabel} style={{ color: alpha > 0.5 ? contrastColor : '#fff' }}>
            {isRgba ? `${Math.round(alpha * 100)}%` : hex}
          </span>
          <button
            className={styles.lockBtn}
            style={{ color: alpha > 0.5 ? contrastColor : '#fff' }}
            onClick={(e) => {
              e.stopPropagation();
              toggleLock(tokenName);
            }}
            title={isLocked ? 'Unlock' : 'Lock'}
          >
            {isLocked ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
      <span className={styles.name} title={tokenName}>
        {inGlobalSelection && <span className={styles.activeDot} />}
        <span className={styles.nameText}>{shortName}</span>
      </span>
    </div>
  );
}
