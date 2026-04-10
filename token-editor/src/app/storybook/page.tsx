'use client';

import React from 'react';
import styles from './StorybookPage.module.css';

export default function StorybookPage() {
  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <a href="/" className={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Token Editor
        </a>
        <h1 className={styles.title}>Storybook Preview</h1>
        <span className={styles.badge}>Live Sync</span>
      </div>
      <iframe
        src="http://localhost:5000"
        className={styles.iframe}
        title="MDS Storybook"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
