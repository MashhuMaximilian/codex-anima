'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return 'light';
}

export function ThemeToggle() {
  // SSR-safe: start undefined, resolve on mount
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('codex-anima-theme', next);
    } catch {
      /* localStorage blocked — fine, in-memory state still works */
    }
    setTheme(next);
  };

  // Pre-hydration render: show a placeholder so the button doesn't pop in
  if (theme === null) {
    return (
      <button
        type="button"
        className="theme-toggle"
        aria-label="Toggle theme"
        title="Toggle theme"
        style={{ opacity: 0.5 }}
      >
        ◐
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
