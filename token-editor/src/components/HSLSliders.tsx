'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HSL, hslToHex, hslToRgb, getContrastColor, hexToHsl, getContrastRatioHex, clampHSL, solveHslLightnessForContrastRatio } from '@/utils/colorUtils';
import { formatOklchCssFromHex } from '@/utils/oklchFormat';
import { hexToOklchTriplet, oklchTripletToHexDirect } from '@/utils/oklchGamut';
import { useColorStore } from '@/hooks/useColorStore';
import { useTokenUsageData } from '@/hooks/useTokenUsageData';
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

function formatAliasLabel(cssName: string) {
  return cssName.replace(/^--/, '');
}

function tripletFromHsl(h: HSL): { lPct: number; c: number; h: number } {
  const t = hexToOklchTriplet(hslToHex(h.h, h.s, h.l));
  if (!t) return { lPct: 0, c: 0, h: 0 };
  return {
    lPct: Math.round(t.l * 1000) / 10,
    c: Math.round(t.c * 10000) / 10000,
    h: typeof t.h === 'number' && !Number.isNaN(t.h) ? t.h : 0,
  };
}

export default function HSLSliders({ hsl, tokenName, isRgba = false, alpha = 1, onChange, onAlphaChange, onClose }: HSLSlidersProps) {
  const { data: usageData, loading: usageLoading } = useTokenUsageData();
  const currentColors = useColorStore(s => s.currentColors);
  const [localHSL, setLocalHSL] = useState<HSL>(hsl);
  const [localOklch, setLocalOklch] = useState(() => tripletFromHsl(hsl));
  const [localAlpha, setLocalAlpha] = useState(alpha);
  const [hexInput, setHexInput] = useState(hslToHex(hsl.h, hsl.s, hsl.l));

  const [contrastMode, setContrastMode] = useState<'target' | 'passed'>('target');
  const [targetToken, setTargetToken] = useState<string>('--color-white');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [oklchCopied, setOklchCopied] = useState(false);

  const [contrastLockEnabled, setContrastLockEnabled] = useState(false);
  const lockedContrastRatioRef = useRef<number | null>(null);
  const [lockRatioError, setLockRatioError] = useState(0);

  useEffect(() => {
    lockedContrastRatioRef.current = null;
    setContrastLockEnabled(false);
    setLockRatioError(0);
  }, [tokenName]);

  useEffect(() => {
    setLocalHSL(hsl);
    setHexInput(hslToHex(hsl.h, hsl.s, hsl.l));
    setLocalOklch(tripletFromHsl(hsl));
  }, [hsl]);

  useEffect(() => {
    setLocalAlpha(alpha);
  }, [alpha]);

  const getContrastBgHex = useCallback((): string | null => {
    const t = currentColors[targetToken];
    if (!t) return null;
    return hslToHex(t.h, t.s, t.l);
  }, [currentColors, targetToken]);

  const applyContrastLockToHs = useCallback(
    (h: number, s: number): { hsl: HSL; ratioError: number } | null => {
      const r = lockedContrastRatioRef.current;
      const bgHex = getContrastBgHex();
      if (r == null || bgHex == null) return null;
      return solveHslLightnessForContrastRatio(h, s, bgHex, r);
    },
    [getContrastBgHex],
  );

  const latestHslRef = useRef(localHSL);
  latestHslRef.current = localHSL;

  useEffect(() => {
    if (!contrastLockEnabled || lockedContrastRatioRef.current == null) return;
    const tColor = useColorStore.getState().currentColors[targetToken];
    if (!tColor) return;
    const bgHex = hslToHex(tColor.h, tColor.s, tColor.l);
    const cur = latestHslRef.current;
    const { hsl, ratioError } = solveHslLightnessForContrastRatio(
      cur.h,
      cur.s,
      bgHex,
      lockedContrastRatioRef.current,
    );
    setLockRatioError(ratioError);
    setLocalHSL(hsl);
    setHexInput(hslToHex(hsl.h, hsl.s, hsl.l));
    setLocalOklch(tripletFromHsl(hsl));
    const changed =
      Math.round(hsl.h) !== Math.round(cur.h) ||
      Math.round(hsl.s) !== Math.round(cur.s) ||
      Math.round(hsl.l * 4) !== Math.round(cur.l * 4);
    if (changed) {
      onChange(hsl);
    }
  }, [targetToken, contrastLockEnabled, onChange]);

  const updateContrastLockEnabled = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        lockedContrastRatioRef.current = null;
        setContrastLockEnabled(false);
        setLockRatioError(0);
        return;
      }
      const tColor = useColorStore.getState().currentColors[targetToken];
      if (!tColor) return;
      const bgHex = hslToHex(tColor.h, tColor.s, tColor.l);
      const cur = latestHslRef.current;
      const fgHex = hslToHex(cur.h, cur.s, cur.l);
      lockedContrastRatioRef.current = getContrastRatioHex(fgHex, bgHex);
      setContrastLockEnabled(true);
    },
    [targetToken],
  );

  const handleSliderChange = useCallback((key: keyof HSL, value: number) => {
    if (contrastLockEnabled && lockedContrastRatioRef.current != null && key === 'l') {
      return;
    }
    let newHSL: HSL = { ...localHSL, [key]: value };
    if (contrastLockEnabled && lockedContrastRatioRef.current != null && (key === 'h' || key === 's')) {
      const solved = applyContrastLockToHs(newHSL.h, newHSL.s);
      if (solved) {
        newHSL = solved.hsl;
        setLockRatioError(solved.ratioError);
      }
    }
    setLocalHSL(newHSL);
    setHexInput(hslToHex(newHSL.h, newHSL.s, newHSL.l));
    setLocalOklch(tripletFromHsl(newHSL));
    onChange(newHSL);
  }, [localHSL, onChange, contrastLockEnabled, applyContrastLockToHs]);

  const handleAlphaChange = useCallback((value: number) => {
    setLocalAlpha(value);
    onAlphaChange?.(value);
  }, [onAlphaChange]);

  const handleHexChange = useCallback((value: string) => {
    setHexInput(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      let newHSL = hexToHsl(value);
      if (contrastLockEnabled && lockedContrastRatioRef.current != null) {
        const solved = applyContrastLockToHs(newHSL.h, newHSL.s);
        if (solved) {
          newHSL = solved.hsl;
          setLockRatioError(solved.ratioError);
        }
      }
      setLocalHSL(newHSL);
      setLocalOklch(tripletFromHsl(newHSL));
      onChange(newHSL);
    }
  }, [onChange, contrastLockEnabled, applyContrastLockToHs]);

  const handleOklchChange = useCallback((key: 'lPct' | 'c' | 'h', value: number) => {
    if (contrastLockEnabled && lockedContrastRatioRef.current != null && key === 'lPct') {
      return;
    }
    const next = { ...localOklch, [key]: value };
    setLocalOklch(next);
    const l = Math.max(0, Math.min(1, next.lPct / 100));
    const c = Math.max(0, next.c);
    const hue = ((next.h % 360) + 360) % 360;
    const hex = oklchTripletToHexDirect(l, c, hue);
    let newHsl = clampHSL(hexToHsl(hex));
    if (contrastLockEnabled && lockedContrastRatioRef.current != null && (key === 'c' || key === 'h')) {
      const solved = applyContrastLockToHs(newHsl.h, newHsl.s);
      if (solved) {
        newHsl = solved.hsl;
        setLockRatioError(solved.ratioError);
      }
    }
    setLocalHSL(newHsl);
    setHexInput(hslToHex(newHsl.h, newHsl.s, newHsl.l));
    setLocalOklch(tripletFromHsl(newHsl));
    onChange(newHsl);
  }, [localOklch, onChange, contrastLockEnabled, applyContrastLockToHs]);

  const handleInputChange = useCallback((key: keyof HSL, value: string) => {
    const num = parseInt(value);
    if (isNaN(num)) return;
    const max = key === 'h' ? 360 : 100;
    const clamped = Math.max(0, Math.min(max, num));
    handleSliderChange(key, clamped);
  }, [handleSliderChange]);

  const currentHex = hslToHex(localHSL.h, localHSL.s, localHSL.l);
  const oklchCss = formatOklchCssFromHex(currentHex);
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

      <div className={styles.colorTwoCol}>
        <div className={styles.colorTwoColCol}>
          <div className={styles.colTitle}>HSL</div>
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
                disabled={contrastLockEnabled}
                onChange={(e) => handleSliderChange('l', parseInt(e.target.value))}
                className={styles.slider}
                style={{ background: `linear-gradient(to right, hsl(${localHSL.h},${localHSL.s}%,0%), hsl(${localHSL.h},${localHSL.s}%,50%), hsl(${localHSL.h},${localHSL.s}%,100%))` }}
              />
              <input type="number" min={0} max={100} value={localHSL.l}
                disabled={contrastLockEnabled}
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
        </div>

        <div className={styles.colorTwoColCol}>
          <div className={styles.colTitle}>OKLCH</div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderRow}>
              <label className={styles.label}>L</label>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={localOklch.lPct}
                disabled={contrastLockEnabled}
                onChange={(e) => handleOklchChange('lPct', parseFloat(e.target.value))}
                className={styles.slider}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={localOklch.lPct}
                disabled={contrastLockEnabled}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) handleOklchChange('lPct', Math.max(0, Math.min(100, v)));
                }}
                className={styles.numInput}
              />
            </div>
            <div className={styles.sliderRow}>
              <label className={styles.label}>C</label>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.001}
                value={localOklch.c}
                onChange={(e) => handleOklchChange('c', parseFloat(e.target.value))}
                className={styles.slider}
              />
              <input
                type="number"
                min={0}
                max={0.4}
                step={0.001}
                value={localOklch.c}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) handleOklchChange('c', Math.max(0, Math.min(0.4, v)));
                }}
                className={styles.numInput}
              />
            </div>
            <div className={styles.sliderRow}>
              <label className={styles.label}>H</label>
              <input
                type="range"
                min={0}
                max={360}
                step={0.5}
                value={localOklch.h}
                onChange={(e) => handleOklchChange('h', parseFloat(e.target.value))}
                className={styles.slider}
              />
              <input
                type="number"
                min={0}
                max={360}
                step={0.5}
                value={localOklch.h}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) handleOklchChange('h', ((v % 360) + 360) % 360);
                }}
                className={styles.numInput}
              />
            </div>
            {isRgba && (
              <p className={styles.oklchSideHint}>OKLCH adjusts RGB only; alpha stays on the left.</p>
            )}
          </div>
        </div>
      </div>

      <div className={styles.hexRow}>
        <label className={styles.label}>HEX</label>
        <input type="text" value={hexInput} onChange={(e) => handleHexChange(e.target.value)}
          className={styles.hexInput} maxLength={7} spellCheck={false} />
      </div>

      {oklchCss && (
        <div className={styles.oklchBlock}>
          <div className={styles.oklchLabelRow}>
            <span className={styles.label}>OKLCH</span>
            <span className={styles.oklchHint}>{isRgba ? 'RGB only (alpha unchanged)' : 'CSS oklch()'}</span>
          </div>
          <code className={styles.oklchCode}>{oklchCss}</code>
          <div className={styles.oklchActions}>
            <button
              type="button"
              className={styles.oklchBtn}
              onClick={async () => {
                const line = `${tokenName}: ${oklchCss};`;
                try {
                  await navigator.clipboard.writeText(line);
                  setOklchCopied(true);
                  setTimeout(() => setOklchCopied(false), 2000);
                } catch {
                  const ta = document.createElement('textarea');
                  ta.value = line;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                  setOklchCopied(true);
                  setTimeout(() => setOklchCopied(false), 2000);
                }
              }}
            >
              {oklchCopied ? 'Copied' : 'Copy CSS'}
            </button>
            <button
              type="button"
              className={styles.oklchBtn}
              onClick={() => {
                const safe = tokenName.replace(/[^\w-]/g, '_');
                const line = `${tokenName}: ${oklchCss};\n`;
                const blob = new Blob([line], { type: 'text/css' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${safe}-oklch-snippet.css`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              Download snippet
            </button>
          </div>
        </div>
      )}

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
          <label className={styles.contrastLockRow}>
            <input
              type="checkbox"
              checked={contrastLockEnabled}
              onChange={(e) => updateContrastLockEnabled(e.target.checked)}
              disabled={!currentColors[targetToken]}
            />
            <span className={styles.contrastLockLabel}>
              Lock contrast ratio vs target (HSL L and OKLCH L follow automatically)
            </span>
          </label>
          {lockRatioError > 0.02 && contrastLockEnabled && (
            <p className={styles.contrastLockWarn}>
              This hue/saturation cannot hit the locked ratio exactly in sRGB; showing closest match (error ≈ {lockRatioError.toFixed(3)}:1).
            </p>
          )}
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

      <div className={styles.sectionDivider} />

      <div className={styles.aliasSection}>
        <div className={styles.aliasHeader}>
          <span className={styles.aliasTitle}>Maps from</span>
          {usageData?.primitives[tokenName]?.aliases && (
            <span className={styles.aliasCount}>{usageData.primitives[tokenName].aliases!.length}</span>
          )}
        </div>
        {usageLoading && <p className={styles.aliasMuted}>Loading variable names…</p>}
        {!usageLoading && usageData && (
          <>
            {(usageData.primitives[tokenName]?.aliases?.length ?? 0) > 0 ? (
              <p className={styles.aliasHint}>
                Other CSS variables that resolve to this color (tokens + variables + component CSS).
              </p>
            ) : (
              <p className={styles.aliasMuted}>No other variables map here—only this token name.</p>
            )}
            {(usageData.primitives[tokenName]?.aliases?.length ?? 0) > 0 && (
              <ul className={styles.aliasList} aria-label="CSS variables mapping to this primitive">
                {usageData.primitives[tokenName]!.aliases!.map((name) => (
                  <li key={name} className={styles.aliasChip} title={name}>
                    {formatAliasLabel(name)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {!usageLoading && !usageData && (
          <p className={styles.aliasMuted}>Run the token usage script to list mapped names.</p>
        )}
      </div>
    </div>
  );
}
