'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllCharacters, importCharacter, deleteCharacter } from '@/lib/storage';
import { Character } from '@/lib/types';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Home() {
  const [chars, setChars] = useState<Character[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setChars(getAllCharacters());
  }, []);

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string);
          importCharacter(json);
          setChars(getAllCharacters());
        } catch (err) {
          alert('Invalid JSON');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    deleteCharacter(id);
    setChars(getAllCharacters());
  };

  return (
    <div>
      <div className="topbar">
        <Link href="/" className="title">
          Codex Anima<small>D&amp;D 5e</small>
        </Link>
        <div className="topbar-actions">
          <Link href="/builder" className="tbtn primary">+ Build</Link>
          <button className="tbtn" onClick={handleImport}>Import</button>
          <ThemeToggle />
        </div>
      </div>

      <div className="wrap">
        <div className="page-header">
          <h1>Codex Anima</h1>
          <p>— A ledger of the living, the lost, and the in-between —</p>
        </div>

        {chars.length === 0 ? (
          <div className="card text-center">
            <p className="muted">No characters yet. Begin your tale.</p>
            <Link href="/builder" className="btn primary">
              Forge a Character
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {chars.map(c => (
              <div key={c.id} className="relative group">
                <Link href={`/character/${c.id}`} className="home-card">
                  <h3>{c.name || 'Unnamed'}</h3>
                  <div className="meta">
                    {c.title && <em>&ldquo;{c.title}&rdquo; · </em>}
                    Lv{c.level} {c.race} {c.class}
                  </div>
                  {(c.subclass || c.subrace) && (
                    <div className="meta italic">
                      {[c.subrace, c.subclass].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {c.ac !== undefined && (
                    <div className="stats">
                      <span className="stat-pill">AC {c.ac}</span>
                      {c.hp && <span className="stat-pill">HP {c.hp.current}/{c.hp.max}</span>}
                      {c.initiative !== undefined && <span className="stat-pill">Init {c.initiative >= 0 ? '+' : ''}{c.initiative}</span>}
                    </div>
                  )}
                </Link>
                <button
                  onClick={() => handleDelete(c.id, c.name)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full border border-current opacity-40 hover:opacity-100 transition flex items-center justify-center"
                  style={{ color: 'var(--bad)', background: 'transparent' }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
            <Link href="/builder" className="home-card text-center flex items-center justify-center" style={{ minHeight: 100 }}>
              <div>
                <div className="text-2xl" style={{ color: 'var(--accent)' }}>+</div>
                <div className="text-xs muted mt-1">Build New</div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
