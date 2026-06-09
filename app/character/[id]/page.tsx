'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Character, ABILITIES, abilityMod, formatMod, proficiencyByLevel, SOURCE_NAMES, SKILLS } from '@/lib/types';
import { getCharacter, saveCharacter, deleteCharacter } from '@/lib/storage';

interface PageProps {
  params: { id: string };
}

export default function CharacterView({ params }: PageProps) {
  const { id } = params;
  const [char, setChar] = useState<Character | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Editable fields
  const [hpCurrent, setHpCurrent] = useState(0);
  const [hpTemp, setHpTemp] = useState(0);
  const [gold, setGold] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const c = getCharacter(id);
    if (c) {
      setChar(c);
      setHpCurrent(c.hp?.current ?? c.hp?.max ?? 0);
      setHpTemp(c.hp?.temp ?? 0);
      setGold(c.gold ?? 0);
      setNotes(c.notes ?? '');
    }
  }, [id]);

  // Derived stats
  const stats = useMemo(() => {
    if (!char) return null;
    const prof = proficiencyByLevel(char.level);
    const mods: Record<string, number> = {};
    const saves: Record<string, number> = {};
    for (const a of ABILITIES) {
      const score = char.abilities[a] ?? 10;
      const mod = abilityMod(score);
      mods[a] = mod;
      // For saves, we'd need to know which are proficient (depends on class)
      saves[a] = mod;
    }
    const conMod = mods.con ?? 0;
    const wisMod = mods.wis ?? 0;
    const dexMod = mods.dex ?? 0;
    const initiative = dexMod;
    const speed = char.speed ?? 30;
    return { prof, mods, saves, initiative, speed };
  }, [char]);

  if (!char) {
    return (
      <div>
        <div className="topbar">
          <Link href="/" className="title">Codex<small>of Souls</small></Link>
        </div>
        <div className="wrap text-center py-20">
          <p className="muted">Loading character...</p>
          <Link href="/" className="btn secondary mt-4 inline-block">← Home</Link>
        </div>
      </div>
    );
  }

  const fullName = [char.name, char.title].filter(Boolean).join(', ');
  const hpMax = char.hp?.max ?? 10;
  const ac = char.ac ?? 10;
  const totalLevel = char.level;

  const handleSave = () => {
    const updated: Character = {
      ...char,
      hp: { current: hpCurrent, max: hpMax, temp: hpTemp },
      gold,
      notes,
      updatedAt: new Date().toISOString(),
    };
    saveCharacter(updated);
    setChar(updated);
    setEditMode(false);
  };

  const handleExport = () => {
    const data = JSON.stringify(char, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${char.name || 'character'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = () => {
    if (confirm(`Delete ${char.name}?`)) {
      deleteCharacter(char.id);
      window.location.href = '/';
    }
  };

  // Skill bonuses
  const skillBonus = (skill: typeof SKILLS[number]) => {
    if (!stats) return 0;
    const mod = stats.mods[skill.ability] ?? 0;
    const prof = char.skills?.[skill.name]?.prof ? stats.prof : 0;
    return mod + prof;
  };

  return (
    <div>
      <div className="topbar">
        <Link href="/" className="title">Codex<small>of Souls</small></Link>
        <div className="flex gap-2">
          {!editMode ? (
            <>
              <button className="tbtn" onClick={() => setEditMode(true)}>Edit</button>
              <button className="tbtn" onClick={handleExport}>Export</button>
            </>
          ) : (
            <>
              <button className="tbtn primary" onClick={handleSave}>Save</button>
              <button className="tbtn" onClick={() => setEditMode(false)}>Cancel</button>
            </>
          )}
        </div>
      </div>

      <div className="wrap">
        {/* Header Card */}
        <div className="card">
          <div className="char-header">
            <div>
              <h1 className="char-name">{fullName || 'Unnamed'}</h1>
              <p className="char-meta">
                Lv {totalLevel} {char.race}{char.subrace ? ` (${char.subrace})` : ''} {char.class || char.klass}
                {char.subclass ? ` • ${char.subclass}` : ''}
              </p>
              {char.pronouns && <p className="char-pronouns muted">{char.pronouns}</p>}
            </div>
            <div className="char-actions">
              <Link href="/builder" className="btn secondary">New Character</Link>
            </div>
          </div>
        </div>

        {/* Vitals Row */}
        <div className="vitals-grid">
          <div className="vital-card">
            <div className="vital-label">HP</div>
            {!editMode ? (
              <div className="vital-value">
                <span className={hpCurrent <= hpMax / 4 ? 'text-red-400' : ''}>{hpCurrent}</span>
                <span className="vital-sub">/ {hpMax}</span>
                {hpTemp > 0 && <span className="vital-temp">+{hpTemp}</span>}
              </div>
            ) : (
              <div className="hp-edit">
                <input type="number" value={hpCurrent} onChange={e => setHpCurrent(parseInt(e.target.value) || 0)} />
                <span className="vital-sub">/ {hpMax}</span>
                <input type="number" value={hpTemp} onChange={e => setHpTemp(parseInt(e.target.value) || 0)} placeholder="tmp" />
              </div>
            )}
          </div>

          <div className="vital-card">
            <div className="vital-label">AC</div>
            <div className="vital-value">{ac}</div>
          </div>

          <div className="vital-card">
            <div className="vital-label">Init</div>
            <div className="vital-value">{formatMod(stats?.initiative ?? 0)}</div>
          </div>

          <div className="vital-card">
            <div className="vital-label">Speed</div>
            <div className="vital-value">{stats?.speed ?? 30}<span className="vital-sub">ft</span></div>
          </div>

          <div className="vital-card">
            <div className="vital-label">Prof</div>
            <div className="vital-value">{formatMod(stats?.prof ?? 2)}</div>
          </div>
        </div>

        {/* Two-column layout: abilities + skills */}
        <div className="dash-grid">
          {/* Ability Scores */}
          <div className="card">
            <h2>Abilities</h2>
            <div className="ability-grid">
              {ABILITIES.map(a => {
                const score = char.abilities[a] ?? 10;
                const mod = abilityMod(score);
                const save = (stats?.saves[a] ?? 0) + (stats?.prof ?? 2); // assume all saves prof for now
                return (
                  <div key={a} className="ability-block">
                    <div className="ability-name">{a.toUpperCase()}</div>
                    <div className="ability-mod">{formatMod(mod)}</div>
                    <div className="ability-score">{score}</div>
                    <div className="ability-save">
                      <span className="muted">Save</span>
                      <strong>{formatMod(save)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Skills */}
          <div className="card">
            <h2>Skills</h2>
            <div className="skill-list">
              {SKILLS.map(skill => {
                const bonus = skillBonus(skill);
                const isProf = char.skills?.[skill.name]?.prof ?? false;
                return (
                  <div key={skill.name} className={`skill-row ${isProf ? 'prof' : ''}`}>
                    <span className="skill-prof">
                      {isProf ? '●' : '○'}
                    </span>
                    <span className="skill-name">
                      {skill.name}
                      <span className="skill-ability muted">({skill.ability.toUpperCase()})</span>
                    </span>
                    <span className="skill-bonus">{formatMod(bonus)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Resources / Spell Slots */}
        {char.resources && Object.keys(char.resources).length > 0 && (
          <div className="card">
            <h2>Resources</h2>
            <div className="resource-grid">
              {Object.entries(char.resources).map(([name, r]) => (
                <div key={name} className="resource-card">
                  <div className="resource-name">{name}</div>
                  <div className="resource-value">
                    {r.current} / {r.max}
                  </div>
                  {r.recharge && <div className="resource-recharge muted">{r.recharge}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spells */}
        {char.spells && (char.spells.cantrips.length > 0 || char.spells.known.length > 0 || char.spells.prepared.length > 0) && (
          <div className="card">
            <h2>Spells</h2>
            {char.spells.cantrips.length > 0 && (
              <div className="spell-section">
                <h3 className="muted">Cantrips</h3>
                <div className="spell-list">{char.spells.cantrips.join(', ')}</div>
              </div>
            )}
            {char.spells.known.length > 0 && (
              <div className="spell-section">
                <h3 className="muted">Known</h3>
                <div className="spell-list">{char.spells.known.join(', ')}</div>
              </div>
            )}
            {char.spells.prepared.length > 0 && (
              <div className="spell-section">
                <h3 className="muted">Prepared</h3>
                <div className="spell-list">{char.spells.prepared.join(', ')}</div>
              </div>
            )}
            {Object.keys(char.spells.slots || {}).length > 0 && (
              <div className="spell-section">
                <h3 className="muted">Slots</h3>
                <div className="slot-grid">
                  {Object.entries(char.spells.slots).sort(([a], [b]) => Number(a) - Number(b)).map(([lvl, n]) => (
                    <div key={lvl} className="slot-pill">L{lvl}: {n}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Equipment */}
        {char.equipment && char.equipment.length > 0 && (
          <div className="card">
            <h2>Equipment</h2>
            <ul className="equip-list">
              {char.equipment.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {!editMode ? (
              <p className="gold-display mt-4">💰 {gold} gp</p>
            ) : (
              <div className="form-group mt-4">
                <label>Gold</label>
                <input type="number" value={gold} onChange={e => setGold(parseInt(e.target.value) || 0)} />
              </div>
            )}
          </div>
        )}

        {/* Features */}
        {char.features && char.features.length > 0 && (
          <div className="card">
            <h2>Features & Traits</h2>
            <div className="feature-list">
              {char.features.map((f, i) => (
                <div key={i} className="feature-item">
                  <strong>{f.name}</strong>
                  {f.source && <span className="muted"> [{f.source}]</span>}
                  {f.text && <p>{f.text}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="card">
          <h2>Notes</h2>
          {!editMode ? (
            <p className="notes-text">{notes || <span className="muted">No notes yet</span>}</p>
          ) : (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="w-full"
              placeholder="Session notes, loot, NPCs..."
            />
          )}
        </div>

        {/* Danger Zone */}
        <div className="card danger-zone">
          <button className="btn danger small" onClick={handleDelete}>Delete Character</button>
        </div>
      </div>
    </div>
  );
}
