'use client';

import React, { useCallback, useState, useRef } from 'react';
import { useColorStore } from '@/hooks/useColorStore';
import styles from './UploadZone.module.css';

export default function UploadZone() {
  const loadCss = useColorStore(s => s.loadCss);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) loadCss(text, file.name);
    };
    reader.readAsText(file);
  }, [loadCss]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text && text.includes('--')) {
      loadCss(text, 'pasted-tokens.css');
    }
  }, [loadCss]);

  const handlePasteSubmit = useCallback(() => {
    if (pasteText.trim() && pasteText.includes('--')) {
      loadCss(pasteText, 'pasted-tokens.css');
    }
  }, [pasteText, loadCss]);

  return (
    <div className={styles.wrapper} onPaste={handlePaste}>
      <div className={styles.hero}>
        <div className={styles.logoIcon}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="16" height="16" rx="4" fill="#6f21e4" />
            <rect x="28" y="4" width="16" height="16" rx="4" fill="#0060d6" />
            <rect x="4" y="28" width="16" height="16" rx="4" fill="#f5ba0a" />
            <rect x="28" y="28" width="16" height="16" rx="4" fill="#d62400" />
          </svg>
        </div>
        <h1 className={styles.title}>IRIS -Token Color Editor</h1>
        <p className={styles.subtitle}>
          Upload your CSS design tokens, visually tune colors with HSL sliders,
          and export the updated file — all in the browser.
        </p>
      </div>

      <div
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".css"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className={styles.dropIcon}>
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path d="M32 8 L32 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M20 28 L32 40 L44 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 48 L10 52 C10 54.2 11.8 56 14 56 L50 56 C52.2 56 54 54.2 54 52 L54 48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <span className={styles.dropText}>
          {isDragging ? 'Drop your CSS file here' : 'Drag & drop your CSS token file'}
        </span>
        <span className={styles.dropHint}>or click to browse</span>
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      {!pasteMode ? (
        <button className={styles.pasteBtn} onClick={() => setPasteMode(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
          </svg>
          Paste CSS tokens
        </button>
      ) : (
        <div className={styles.pasteArea}>
          <textarea
            className={styles.pasteInput}
            placeholder="Paste your CSS tokens here..."
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            autoFocus
          />
          <div className={styles.pasteActions}>
            <button className={styles.cancelBtn} onClick={() => { setPasteMode(false); setPasteText(''); }}>
              Cancel
            </button>
            <button className={styles.submitBtn} onClick={handlePasteSubmit} disabled={!pasteText.trim()}>
              Load Tokens
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
