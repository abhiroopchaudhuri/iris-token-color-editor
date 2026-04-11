'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { HSL, hslToHex, hslToRgb, getContrastColor, hexToHsl, getContrastRatioHex } from '@/utils/colorUtils';
import { useColorStore } from '@/hooks/useColorStore';
import styles from './HSLSliders.module.css';

interface HSLSlidersProps {
  hsl: HSL;
  tokenName: string;
  isRgba?: boolean;
  alpha?: number;
  onChange: (hsl: HSL) => void;
  onAlphaChange?: (a: number) => void;
  onClose: () => void;
}

export default function HSLSliders({ hsl, tokenName, isRgba = false, alpha = 1, onChange, onAlphaChange, onClose }: HSLSlidersProps) {
  const currentColors = useColorStore(s => s.currentColors);
  const [localHSL, setLocalHSL] = useState<HSL>(hsl);
  const [localAlpha, setLocalAlpha] = useState(alpha);
  const [hexInput, setHexInput] = useState(hslToHex(hsl.h, hsl.s, hsl.l));

  const [contrastMode, setContrastMode] = useState<'target' | 'passed'>('target');
  const [targetToken, setTargetToken] = useState<string>('--color-white');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setLocalHSL(hsl);
    setHexInput(hslToHex(hsl.h, hsl.s, hsl.l));
  }, [hsl]);

  useEffect(() => {
    setLocalAlpha(alpha);
  }, [alpha]);

  const handleSliderChange = useCallback((key: keyof HSL, value: number) => {
    const newHSL = { ...localHSL, [key]: value };
    setLocalHSL(newHSL);
    setHexInput(hslToHex(newHSL.h, newHSL.s, newHSL.l));
    onChange(newHSL);
  }, [localHSL, onChange]);

  const handleAlphaChange = useCallback((value: number) => {
    setLocalAlpha(value);
    onAlphaChange?.(value);
  }, [onAlphaChange]);

  const handleHexChange = useCallback((value: string) => {
    setHexInput(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      const newHSL = hexToHsl(value);
      setLocalHSL(newHSL);
      onChange(newHSL);
    }
  }, [onChange]);

  const handleInputChange = useCallback((key: keyof HSL, value: string) => {
    const num = parseInt(value);
    if (isNaN(num)) return;
    const max = key === 'h' ? 360 : 100;
    const clamped = Math.max(0, Math.min(max, num));
    handleSliderChange(key, clamped);
  }, [handleSliderChange]);

  const currentHex = hslToHex(localHSL.h, localHSL.s, localHSL.l);
  const { r, g, b } = hslToRgb(localHSL.h, localHSL.s, localHSL.l);
  const previewBg = isRgba ? `rgba(${r}, ${g}, ${b}, ${localAlpha})` : currentHex;
  const contrastColor = localAlpha > 0.4 ? getContrastColor(currentHex) : '#ffffff';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.tokenLabel}>{tokenName}</span>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      <div className={styles.previewWrap}>
        <div className={styles.previewCheckerboard} />
        <div className={styles.preview} style={{ background: previewBg, color: contrastColor }} title="Click to open system color picker">
          {isRgba ? `rgba(${r},${g},${b},${localAlpha.toFixed(2)})` : currentHex}
          <input 
            type="color" 
            value={currentHex}
            onChange={(e) => handleHexChange(e.target.value)}
            className={styles.nativeColorPicker} 
          />
        </div>
      </div>

      <div className={styles.sliderGroup}>
        <div className={styles.sliderRow}>
          <label className={styles.label}>H</label>
          <input
            type="range" min={0} max={360} value={localHSL.h}
            onChange={(e) => handleSliderChange('h', parseInt(e.target.value))}
            className={styles.slider}
            style={{ background: `linear-gradient(to right, hsl(0,${localHSL.s}%,${localHSL.l}%), hsl(60,${localHSL.s}%,${localHSL.l}%), hsl(120,${localHSL.s}%,${localHSL.l}%), hsl(180,${localHSL.s}%,${localHSL.l}%), hsl(240,${localHSL.s}%,${localHSL.l}%), hsl(300,${localHSL.s}%,${localHSL.l}%), hsl(360,${localHSL.s}%,${localHSL.l}%))` }}
          />
          <input type="number" min={0} max={360} value={localHSL.h}
            onChange={(e) => handleInputChange('h', e.target.value)} className={styles.numInput} />
        </div>

        <div className={styles.sliderRow}>
          <label className={styles.label}>S</label>
          <input
            type="range" min={0} max={100} value={localHSL.s}
            onChange={(e) => handleSliderChange('s', parseInt(e.target.value))}
            className={styles.slider}
            style={{ background: `linear-gradient(to right, hsl(${localHSL.h},0%,${localHSL.l}%), hsl(${localHSL.h},100%,${localHSL.l}%))` }}
          />
          <input type="number" min={0} max={100} value={localHSL.s}
            onChange={(e) => handleInputChange('s', e.target.value)} className={styles.numInput} />
        </div>

        <div className={styles.sliderRow}>
          <label className={styles.label}>L</label>
          <input
            type="range" min={0} max={100} value={localHSL.l}
            onChange={(e) => handleSliderChange('l', parseInt(e.target.value))}
            className={styles.slider}
            style={{ background: `linear-gradient(to right, hsl(${localHSL.h},${localHSL.s}%,0%), hsl(${localHSL.h},${localHSL.s}%,50%), hsl(${localHSL.h},${localHSL.s}%,100%))` }}
          />
          <input type="number" min={0} max={100} value={localHSL.l}
            onChange={(e) => handleInputChange('l', e.target.value)} className={styles.numInput} />
        </div>

        {isRgba && (
          <div className={styles.sliderRow}>
            <label className={styles.label}>A</label>
            <input
              type="range" min={0} max={100} value={Math.round(localAlpha * 100)}
              onChange={(e) => handleAlphaChange(parseInt(e.target.value) / 100)}
              className={styles.slider}
              style={{ background: `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1))` }}
            />
            <input type="number" min={0} max={100} value={Math.round(localAlpha * 100)}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) handleAlphaChange(Math.max(0, Math.min(100, v)) / 100); }}
              className={styles.numInput} />
          </div>
        )}
      </div>

      <div className={styles.hexRow}>
        <label className={styles.label}>HEX</label>
        <input type="text" value={hexInput} onChange={(e) => handleHexChange(e.target.value)}
          className={styles.hexInput} maxLength={7} spellCheck={false} />
      </div>

      <div className={styles.sectionDivider} />
      
      <div className={styles.contrastHeader}>
        <div className={styles.contrastTabs}>
          <button 
            className={`${styles.tabBtn} ${contrastMode === 'target' ? styles.tabActive : ''}`}
            onClick={() => setContrastMode('target')}
          >
            Target Matcher
          </button>
          <button 
            className={`${styles.tabBtn} ${contrastMode === 'passed' ? styles.tabActive : ''}`}
            onClick={() => setContrastMode('passed')}
          >
            Passed Tokens
          </button>
        </div>
      </div>

      {contrastMode === 'target' ? (
        <div className={styles.contrastTargetBox}>
          <div className={styles.targetRow}>
            <span className={styles.label}>VS</span>
            
            <div className={styles.customSelectWrap}>
              {(() => {
                const activeC = currentColors[targetToken] || { h: 0, s: 0, l: 100 };
                const bgStr = `hsl(${activeC.h}, ${activeC.s}%, ${activeC.l}%)`;
                return (
                  <div 
                    className={styles.customSelectTrigger} 
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    <div className={styles.optionColor} style={{ background: bgStr }} />
                    <span className={styles.optionText}>{targetToken.replace('--color-', '')}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                );
              })()}
              
              {dropdownOpen && (
                <div className={styles.customSelectMenu}>
                  {Object.keys(currentColors).map(t => {
                    const c = currentColors[t];
                    return (
                      <div 
                        key={t} 
                        className={styles.customOption}
                        onClick={() => {
                          setTargetToken(t);
                          setDropdownOpen(false);
                        }}
                      >
                        <div className={styles.optionColor} style={{ background: `hsl(${c.h}, ${c.s}%, ${c.l}%)` }} />
                        <span className={styles.optionText}>{t.replace('--color-', '')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(() => {
              const tColor = currentColors[targetToken] || { h: 0, s: 0, l: 100 };
              const tHex = hslToHex(tColor.h, tColor.s, tColor.l);
              const ratio = getContrastRatioHex(currentHex, tHex);
              const formatted = ratio.toFixed(2);
              return (
                <div className={styles.ratioBadge} data-level={ratio >= 4.5 ? 'pass' : ratio >= 3 ? 'warn' : 'fail'}>
                  {formatted}:1
                </div>
              );
            })()}
          </div>
          {(() => {
            const tColor = currentColors[targetToken] || { h: 0, s: 0, l: 100 };
            const tHex = hslToHex(tColor.h, tColor.s, tColor.l);
            const ratio = getContrastRatioHex(currentHex, tHex);
            return (
              <div className={styles.wcagResults}>
                <div className={`${styles.wcagItem} ${ratio >= 3 ? styles.wcagPass : styles.wcagFail}`}>
                  {ratio >= 3 ? '✓' : '×'} AA Large (3:1)
                </div>
                <div className={`${styles.wcagItem} ${ratio >= 4.5 ? styles.wcagPass : styles.wcagFail}`}>
                  {ratio >= 4.5 ? '✓' : '×'} AA Normal (4.5:1)
                </div>
                <div className={`${styles.wcagItem} ${ratio >= 7 ? styles.wcagPass : styles.wcagFail}`}>
                  {ratio >= 7 ? '✓' : '×'} AAA (7:1)
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className={styles.contrastPassedBox}>
          {(() => {
            const tokens = Object.keys(currentColors);
            const passed3: string[] = [];
            const passed45: string[] = [];
            
            tokens.forEach(t => {
              const tHex = hslToHex(currentColors[t].h, currentColors[t].s, currentColors[t].l);
              const ratio = getContrastRatioHex(currentHex, tHex);
              if (ratio >= 4.5) passed45.push(t);
              else if (ratio >= 3) passed3.push(t);
            });

            return (
              <div className={styles.passedListsWrapper}>
                <div className={styles.passedListGroup}>
                  <div className={styles.passedTitle}>AA Normal (≥4.5:1)</div>
                  <div className={styles.passedGrid}>
                    {passed45.map(t => (
                       <div key={t} className={styles.passedChip} title={t.replace('--color-', '')} style={{ background: `hsl(${currentColors[t].h}, ${currentColors[t].s}%, ${currentColors[t].l}%)` }} />
                    ))}
                  </div>
                  {passed45.length === 0 && <div className={styles.emptyList}>No tokens</div>}
                </div>
                <div className={styles.passedListGroup}>
                  <div className={styles.passedTitle}>AA Large Only (≥3:1)</div>
                  <div className={styles.passedGrid}>
                    {passed3.map(t => (
                       <div key={t} className={styles.passedChip} title={t.replace('--color-', '')} style={{ background: `hsl(${currentColors[t].h}, ${currentColors[t].s}%, ${currentColors[t].l}%)` }} />
                    ))}
                  </div>
                  {passed3.length === 0 && <div className={styles.emptyList}>No additional tokens</div>}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
