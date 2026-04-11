'use client';

import React, { useMemo, useState } from 'react';
import { useColorStore } from '@/hooks/useColorStore';
import {
  collectFamiliesAndShadesFromLines,
  globalHslSelectionHasConstraints,
  globalHslSelectionRestrictsGlobal,
  type ScalarDimension,
  type ScalarOp,
} from '@/utils/selectionFilter';
import styles from './SelectionFilterPanel.module.css';

const DIMS: { value: ScalarDimension; label: string }[] = [
  { value: 'shade', label: 'Shade #' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Sat %' },
  { value: 'lightness', label: 'Light %' },
  { value: 'alpha', label: 'Alpha (0–1)' },
];

const OPS: { value: ScalarOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'between', label: 'between' },
];

function formatRuleSummary(d: ScalarDimension, op: ScalarOp, value?: number, min?: number, max?: number): string {
  const dim = DIMS.find(x => x.value === d)?.label ?? d;
  if (op === 'between' && min !== undefined && max !== undefined) return `${dim} ${min}–${max}`;
  const v = value ?? '?';
  const opLabel = OPS.find(o => o.value === op)?.label ?? op;
  return `${dim} ${opLabel} ${v}`;
}

interface SelectionFilterPanelProps {
  onClose?: () => void;
}

export default function SelectionFilterPanel({ onClose }: SelectionFilterPanelProps) {
  const originalLines = useColorStore(s => s.originalLines);
  const filter = useColorStore(s => s.globalHslSelectionFilter);
  const setActive = useColorStore(s => s.setGlobalHslSelectionActive);
  const toggleFamily = useColorStore(s => s.toggleGlobalHslSelectionFamily);
  const setFamiliesAny = useColorStore(s => s.setGlobalHslSelectionFamiliesAny);
  const toggleShade = useColorStore(s => s.toggleGlobalHslSelectionShade);
  const addRule = useColorStore(s => s.addGlobalHslSelectionRule);
  const removeRule = useColorStore(s => s.removeGlobalHslSelectionRule);
  const clearAll = useColorStore(s => s.clearGlobalHslSelectionFilter);
  const currentColors = useColorStore(s => s.currentColors);

  const { families, shades } = useMemo(
    () => collectFamiliesAndShadesFromLines(originalLines),
    [originalLines],
  );

  const [dim, setDim] = useState<ScalarDimension>('shade');
  const [op, setOp] = useState<ScalarOp>('lt');
  const [num, setNum] = useState('600');
  const [numB, setNumB] = useState('800');

  const restricts = globalHslSelectionRestrictsGlobal(filter);
  const hasConstraints = globalHslSelectionHasConstraints(filter);

  const handleAddRule = () => {
    if (op === 'between') {
      const min = parseFloat(num);
      const max = parseFloat(numB);
      if (Number.isNaN(min) || Number.isNaN(max)) return;
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      addRule({ dimension: dim, op: 'between', min: lo, max: hi });
      return;
    }
    const value = parseFloat(num);
    if (Number.isNaN(value)) return;
    addRule({ dimension: dim, op, value });
  };

  const getFamilyColor = (fam: string) => {
    const bgKey = `--color-${fam}-1000`;
    const borderKey = `--color-${fam}-400`;
    const fallbackBg = { h: 0, s: 0, l: 15 };
    const fallbackBorder = { h: 0, s: 0, l: 50 };
    
    const bg = currentColors[bgKey] || currentColors[`--color-${fam}-900`] || currentColors[`--color-${fam}-1100`] || fallbackBg;
    const border = currentColors[borderKey] || currentColors[`--color-${fam}-300`] || fallbackBorder;
    
    return {
      backgroundColor: `hsl(${Math.round(bg.h)}, ${Math.round(bg.s)}%, ${Math.round(bg.l)}%)`,
      borderColor: `hsl(${Math.round(border.h)}, ${Math.round(border.s)}%, ${Math.round(border.l)}%)`,
    };
  };

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <span className={styles.title}>Advanced selection rules</span>
          {restricts && <span className={styles.badge}>Active</span>}
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <p className={styles.hint}>
        Choose color groups and/or shade steps and/or numeric rules. All active constraints combine with AND. Swatches that match show a white offset ring; global HSL sliders then only shift matching, unlocked tokens. Use Clear to return to all colors.
      </p>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={filter.active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Limit global HSL to this selection
      </label>

      <div>
        <div className={styles.rowLabel}>Groups (OR)</div>
        <div className={styles.row}>
          <button
            type="button"
            className={`${styles.chip} ${filter.families === null ? styles.chipActive : ''}`}
            onClick={setFamiliesAny}
            title="Select all color groups simultaneously"
          >
            All groups
          </button>
          {families.map((fam) => {
            const picked = filter.families !== null && filter.families.includes(fam);
            const dimmed = filter.families !== null && !picked;
            return (
              <button
                key={fam}
                type="button"
                className={`${styles.chip} ${picked ? styles.dynamicChip : ''} ${dimmed ? styles.chipMuted : ''}`}
                onClick={() => toggleFamily(fam)}
                style={picked ? getFamilyColor(fam) : undefined}
              >
                {fam}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className={styles.rowLabel}>Shade steps (OR on token step number)</div>
        <div className={styles.row}>
          {shades.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.chip} ${filter.shadeIn.includes(s) ? styles.chipActive : styles.chipMuted}`}
              onClick={() => toggleShade(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filter.rules.length > 0 && (
        <div>
          <div className={styles.rowLabel}>Rules (AND)</div>
          <div className={styles.row}>
            {filter.rules.map((r) => (
              <span key={r.id} className={styles.ruleChip}>
                {formatRuleSummary(r.dimension, r.op, r.value, r.min, r.max)}
                <button type="button" className={styles.ruleRemove} onClick={() => removeRule(r.id)} aria-label="Remove rule">
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className={styles.rowLabel}>Add condition (AND with groups & shades)</div>
        <div className={styles.addRule}>
          <select value={dim} onChange={(e) => setDim(e.target.value as ScalarDimension)}>
            {DIMS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <select value={op} onChange={(e) => setOp(e.target.value as ScalarOp)}>
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {op === 'between' ? (
            <>
              <input type="number" value={num} onChange={(e) => setNum(e.target.value)} placeholder="min" />
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>–</span>
              <input type="number" value={numB} onChange={(e) => setNumB(e.target.value)} placeholder="max" />
            </>
          ) : (
            <input type="number" value={num} onChange={(e) => setNum(e.target.value)} step={dim === 'alpha' ? 0.01 : 1} />
          )}
          <button type="button" className={styles.addBtn} onClick={handleAddRule}>
            Add rule
          </button>
        </div>
      </div>

      <div className={styles.bottomRow}>
        <button type="button" className={`${styles.resetBtn}`} onClick={clearAll}>
          Reset Selection & Clear Rules
        </button>
        {filter.active && !hasConstraints && (
          <span className={styles.hint} style={{ margin: 0 }}>Add constraints to scope the selection.</span>
        )}
      </div>
    </div>
  );
}
