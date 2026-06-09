'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Accordion } from '@/components/Accordion';
import { FilterBar } from '@/components/FilterBar';
import { Race, DndClass, Character, SOURCE_NAMES, PREF_SOURCES, AbilityScore } from '@/lib/types';
import { saveCharacter, importCharacter } from '@/lib/storage';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityKey = typeof ABILITIES[number];

interface RawSubrace {
  name: string;
  raceName?: string;
  source?: string;
  entries?: any[];
  ability?: any;
}

interface RawRace {
  name: string;
  source: string;
  size?: string[];
  speed?: { walk?: number };
  ability?: any;
  entries?: any[];
}

function cleanTag(text: string): string {
  // Strip 5e.tools tags like {@spell Fireball|PHB}, {@sense Darkvision|XPHB}, etc.
  return text
    .replace(/\{@([^}]+)\}/g, (_, inner) => {
      // inner is e.g. "spell Fireball|PHB" or "sense Darkvision|XPHB"
      const parts = inner.split('|')[0].split(' ');
      return parts.slice(1).join(' '); // Skip type, take name
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractText(entries: any[] | undefined): string {
  if (!entries) return '';
  return cleanTag(entries.map(e => {
    if (typeof e === 'string') return e;
    if (e.text) return e.text;
    if (e.entries?.[0]?.text) return e.entries[0].text;
    if (Array.isArray(e.entries)) return extractText(e.entries);
    return '';
  }).join(' ').trim());
}

async function loadAllRaces(): Promise<Race[]> {
  const res = await fetch('/data/races.json');
  const d = await res.json();
  const seen = new Map<string, Race>();

  // Build subrace map
  const subraceMap = new Map<string, { name: string; text: string; ability?: any }[]>();
  for (const sr of (d.subrace || []) as RawSubrace[]) {
    if (!sr.raceName || !sr.name) continue;
    const text = extractText(sr.entries).slice(0, 500);
    if (!subraceMap.has(sr.raceName)) subraceMap.set(sr.raceName, []);
    subraceMap.get(sr.raceName)!.push({ name: sr.name, text, ability: sr.ability });
  }

  // Dedupe
  for (const [rn, arr] of subraceMap) {
    const seen = new Set<string>();
    subraceMap.set(rn, arr.filter(sr => {
      if (seen.has(sr.name)) return false;
      seen.add(sr.name);
      return true;
    }));
  }

  // Process races
  const sorted = (d.race || []).sort((a: RawRace, b: RawRace) => {
    const ai = PREF_SOURCES.indexOf(a.source);
    const bi = PREF_SOURCES.indexOf(b.source);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const r of sorted as RawRace[]) {
    if (seen.has(r.name)) continue;
    if (['PSA', 'PSD', 'AAG'].includes(r.source)) continue;

    const feats: { name: string; text: string }[] = [];
    for (const e of (r.entries || [])) {
      if (typeof e === 'string') feats.push({ name: '', text: e.slice(0, 500) });
      else if (e.name) feats.push({ name: e.name, text: extractText(e.entries).slice(0, 500) });
    }

    const subraces = subraceMap.get(r.name) || [];
    const ability: any = {};
    if (Array.isArray(r.ability)) {
      for (const a of r.ability) Object.assign(ability, a);
    } else if (r.ability) Object.assign(ability, r.ability);

    seen.set(r.name, {
      key: r.name.toLowerCase().replace(/[^a-z]/g, '-'),
      name: r.name, source: r.source,
      size: r.size?.[0] || 'M', speed: r.speed?.walk || 30,
      ability, feats, subraces,
    });
  }

  return Array.from(seen.values());
}

async function loadAllClasses(): Promise<DndClass[]> {
  const idx = await (await fetch('/data/class/index.json')).json();
  const cls: DndClass[] = [];
  for (const [key, file] of Object.entries(idx) as [string, string][]) {
    if (['mystic', 'sidekick'].includes(key)) continue;
    try {
      const d = await (await fetch(`/data/class/${file}`)).json();
      const c = d.class?.[0];
      if (!c) continue;

      const feats = (d.classFeature || []).map((f: any) => ({
        name: f.name,
        text: extractText(f.entries).slice(0, 600),
      }));

      const subMap = new Map<string, { name: string; text: string; source?: string }>();
      for (const s of (d.subclass || [])) {
        if (subMap.has(s.name)) continue;
        const text = `[${s.source || s.classSource || ''}] ${s.className || ''} subclass`.trim();
        subMap.set(s.name, { name: s.name, text, source: s.source });
      }

      cls.push({
        key, name: c.name, hitDie: c.hd.faces,
        saves: c.proficiency, spell: c.spellcastingAbility || null,
        feats, subs: Array.from(subMap.values()),
      });
    } catch (e) { console.warn(key, e); }
  }
  return cls;
}

export default function BuilderPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [races, setRaces] = useState<Race[]>([]);
  const [classes, setClasses] = useState<DndClass[]>([]);
  const [loading, setLoading] = useState(true);

  const [char, setChar] = useState<Character>({
    id: crypto.randomUUID(),
    name: '', title: '', pronouns: '', level: 1,
    race: '', klass: '', subclass: '', subrace: '',
    abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    createdAt: '', updatedAt: '',
  });

  // Filters
  const [raceSearch, setRaceSearch] = useState('');
  const [raceSource, setRaceSource] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classSpell, setClassSpell] = useState('');

  // Modal state
  const [modalRace, setModalRace] = useState<Race | null>(null);
  const [modalClass, setModalClass] = useState<DndClass | null>(null);

  useEffect(() => {
    Promise.all([loadAllRaces(), loadAllClasses()]).then(([r, c]) => {
      setRaces(r);
      setClasses(c);
      setLoading(false);
    });
  }, []);

  // Source options for filter
  const sourceOptions = useMemo(() => {
    const sources = [...new Set(races.map(r => r.source))].sort();
    return [
      { value: '', label: 'All Sources' },
      ...sources.map(s => ({ value: s, label: `${s} - ${SOURCE_NAMES[s] || s}` })),
    ];
  }, [races]);

  // Filtered races
  const filteredRaces = useMemo(() => {
    return races.slice(0, 60).filter(r => {
      if (raceSearch && !r.name.toLowerCase().includes(raceSearch.toLowerCase())) return false;
      if (raceSource && r.source !== raceSource) return false;
      return true;
    });
  }, [races, raceSearch, raceSource]);

  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      if (classSearch && !c.name.toLowerCase().includes(classSearch.toLowerCase())) return false;
      if (classSpell === 'yes' && !c.spell) return false;
      if (classSpell === 'no' && c.spell) return false;
      return true;
    });
  }, [classes, classSearch, classSpell]);

  // Selected race's subraces
  const selectedRace = races.find(r => r.name === char.race);
  const selectedClass = classes.find(c => c.key === char.klass);

  const selectRace = (race: Race) => {
    setChar(prev => ({ ...prev, race: race.name, subrace: '' }));
  };

  const selectSubrace = (name: string) => {
    setChar(prev => ({ ...prev, subrace: prev.subrace === name ? '' : name }));
  };

  const selectClass = (c: DndClass) => {
    setChar(prev => ({ ...prev, klass: c.key, class: c.name, subclass: '' }));
  };

  const selectSubclass = (name: string) => {
    setChar(prev => ({ ...prev, subclass: prev.subclass === name ? '' : name }));
  };

  const confirmModal = () => {
    setModalRace(null);
    setModalClass(null);
  };

  // Stat helpers
  const getPtCost = (s: number) => {
    if (s <= 8) return 0;
    return ({ 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } as Record<number, number>)[s] || 0;
  };

  const ptUsed = ABILITIES.reduce((sum, a) => sum + getPtCost(char.abilities[a] || 8), 0);

  const nextStep = () => {
    if (step === 1 && !char.name) return alert('Enter a name');
    if (step === 2 && (!char.race || !char.klass)) return alert('Pick race and class');
    setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => Math.max(1, s - 1));

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

  const handleSave = () => {
    saveCharacter(char);
    router.push(`/character/${char.id}`);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string);
          const imported = importCharacter(json);
          router.push(`/character/${imported.id}`);
        } catch (err) {
          alert('Invalid JSON');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (loading) {
    return (
      <div>
        <div className="topbar">
          <Link href="/" className="title">Builder<small>D&D 5e</small></Link>
        </div>
        <div className="wrap text-center py-20">
          <p className="muted">Loading the multiverse...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <Link href="/" className="title">Builder<small>D&D 5e</small></Link>
        <div className="flex gap-2">
          <Link href="/" className="tbtn">Home</Link>
          <button className="tbtn" onClick={handleImport}>Import</button>
        </div>
      </div>

      <div className="wrap">
        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="card">
            <h2>I. Name & Such</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={char.name}
                  onChange={e => setChar({ ...char, name: e.target.value })}
                  placeholder="Miliardes..."
                />
              </div>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={char.title}
                  onChange={e => setChar({ ...char, title: e.target.value })}
                  placeholder="The Living Patent"
                />
              </div>
              <div className="form-group">
                <label>Pronouns</label>
                <input
                  type="text"
                  value={char.pronouns}
                  onChange={e => setChar({ ...char, pronouns: e.target.value })}
                  placeholder="it/its"
                />
              </div>
              <div className="form-group">
                <label>Level</label>
                <input
                  type="number"
                  value={char.level}
                  min={1}
                  max={20}
                  onChange={e => setChar({ ...char, level: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn primary full" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 2: Race → Subrace → Class → Subclass */}
        {step === 2 && (
          <div className="card">
            <h2>II. Blood & Calling</h2>

            <Accordion title="Race" summary={char.race || '— Choose —'}>
              <FilterBar
                search={raceSearch}
                onSearchChange={setRaceSearch}
                sourceFilter={raceSource}
                onSourceChange={setRaceSource}
                sourceOptions={sourceOptions}
              />
              <div className="pick-grid">
                {filteredRaces.map(r => (
                  <button
                    key={r.key}
                    className={`pick-card ${char.race === r.name ? 'selected' : ''}`}
                    onClick={() => setModalRace(r)}
                  >
                    <strong>{r.name}</strong>
                    <span>{SOURCE_NAMES[r.source] || r.source}</span>
                  </button>
                ))}
                {filteredRaces.length === 0 && <p className="muted col-span-full">No races match</p>}
              </div>
            </Accordion>

            <Accordion title="Subrace" summary={char.subrace || '— Optional —'}>
              {!selectedRace ? (
                <p className="muted">Pick a race first</p>
              ) : selectedRace.subraces.length === 0 ? (
                <p className="muted">No subraces for {selectedRace.name}</p>
              ) : (
                <div className="pick-grid">
                  {selectedRace.subraces.map(sr => (
                    <button
                      key={sr.name}
                      className={`pick-card ${char.subrace === sr.name ? 'selected' : ''}`}
                      onClick={() => selectSubrace(sr.name)}
                    >
                      <strong>{sr.name}</strong>
                      {sr.text && <span>{sr.text.slice(0, 50)}...</span>}
                    </button>
                  ))}
                </div>
              )}
            </Accordion>

            <Accordion title="Class" summary={char.class || '— Choose —'}>
              <FilterBar
                search={classSearch}
                onSearchChange={setClassSearch}
                extraFilters={[{
                  value: classSpell,
                  label: 'Type',
                  onChange: setClassSpell,
                  selected: classSpell,
                  options: [
                    { value: '', label: 'All' },
                    { value: 'yes', label: 'Casters' },
                    { value: 'no', label: 'Martial' },
                  ],
                }]}
              />
              <div className="pick-grid">
                {filteredClasses.map(c => (
                  <button
                    key={c.key}
                    className={`pick-card ${char.klass === c.key ? 'selected' : ''}`}
                    onClick={() => setModalClass(c)}
                  >
                    <strong>{c.name}</strong>
                    <span>d{c.hitDie} • {c.spell || 'martial'}</span>
                  </button>
                ))}
              </div>
            </Accordion>

            <Accordion title="Subclass" summary={char.subclass || '— Optional —'}>
              {!selectedClass ? (
                <p className="muted">Pick a class first</p>
              ) : selectedClass.subs.length === 0 ? (
                <p className="muted">No subclasses for {selectedClass.name}</p>
              ) : (
                <div className="pick-grid">
                  {selectedClass.subs.map(s => (
                    <button
                      key={s.name}
                      className={`pick-card ${char.subclass === s.name ? 'selected' : ''}`}
                      onClick={() => selectSubclass(s.name)}
                    >
                      <strong>{s.name}</strong>
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </Accordion>

            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Stats */}
        {step === 3 && (
          <div className="card">
            <h2>III. The Body's Truth</h2>
            <p className="muted mb-4">Point Buy: 8→13 costs 1 each; 14→15 costs 2. Total budget: 27.</p>
            <div className="stat-row-grid">
              {ABILITIES.map(a => (
                <div key={a} className="form-group">
                  <label>{a.toUpperCase()}</label>
                  <input
                    type="number"
                    min={8}
                    max={15}
                    value={char.abilities[a]}
                    onChange={e => setChar({
                      ...char,
                      abilities: { ...char.abilities, [a]: Math.max(8, Math.min(15, parseInt(e.target.value) || 8)) }
                    })}
                  />
                </div>
              ))}
            </div>
            <p className={`mt-4 ${ptUsed > 27 ? 'text-red-400' : 'accent'}`}>
              Points used: <strong>{ptUsed}</strong> / 27
            </p>
            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="card">
            <h2>IV. Final Sigil</h2>
            <div className="summary-box">
              <h3>{char.name || 'Unnamed'}</h3>
              {char.title && <p className="italic muted">"{char.title}"</p>}
              <p>Level {char.level} {char.race} {char.subrace && `(${char.subrace})`} {char.class} {char.subclass && `— ${char.subclass}`}</p>
              {char.pronouns && <p className="muted">({char.pronouns})</p>}
              <div className="stat-row-grid mt-4">
                {ABILITIES.map(a => {
                  const score = char.abilities[a] || 8;
                  const mod = Math.floor((score - 10) / 2);
                  return (
                    <div key={a} className="stat-box">
                      <span className="muted text-xs">{a.toUpperCase()}</span>
                      <div className="val">{score}</div>
                      <div className="mod">{mod >= 0 ? '+' : ''}{mod}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn accent" onClick={handleExport}>Download JSON</button>
              <button className="btn primary" onClick={handleSave}>Save & Open →</button>
            </div>
          </div>
        )}
      </div>

      {/* Race Modal */}
      {modalRace && (
        <div className="modal open" onClick={(e) => {
          if (e.target === e.currentTarget) setModalRace(null);
        }}>
          <div className="modal-backdrop" />
          <div className="modal-content">
            <button className="modal-close" onClick={() => setModalRace(null)}>×</button>
            <h2>{modalRace.name}</h2>
            <div className="modal-section">
              <div className="section-stats">
                <div className="stat-item"><span>Source</span><strong>{SOURCE_NAMES[modalRace.source] || modalRace.source}</strong></div>
                <div className="stat-item"><span>Size</span><strong>{modalRace.size}</strong></div>
                <div className="stat-item"><span>Speed</span><strong>{modalRace.speed} ft</strong></div>
                <div className="stat-item">
                  <span>Ability</span>
                  <strong>
                    {Object.entries(modalRace.ability).map(([k, v]) => `${k.toUpperCase()}+${v}`).join(', ') || '—'}
                  </strong>
                </div>
              </div>
            </div>
            {modalRace.feats.length > 0 && (
              <div className="modal-section">
                <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-2">Features</h3>
                {modalRace.feats.map((f, i) => (
                  <div key={i} className="feature-item">
                    {f.name && <strong>{f.name}</strong>}
                    <p>{f.text}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setModalRace(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { selectRace(modalRace); setModalRace(null); }}>Select {modalRace.name}</button>
            </div>
          </div>
        </div>
      )}

      {/* Class Modal */}
      {modalClass && (
        <div className="modal open" onClick={(e) => {
          if (e.target === e.currentTarget) setModalClass(null);
        }}>
          <div className="modal-backdrop" />
          <div className="modal-content">
            <button className="modal-close" onClick={() => setModalClass(null)}>×</button>
            <h2>{modalClass.name}</h2>
            <div className="modal-section">
              <div className="section-stats">
                <div className="stat-item"><span>Hit Die</span><strong>d{modalClass.hitDie}</strong></div>
                <div className="stat-item"><span>Saves</span><strong>{modalClass.saves.join(', ').toUpperCase()}</strong></div>
                <div className="stat-item"><span>Spellcasting</span><strong>{modalClass.spell || 'None'}</strong></div>
                <div className="stat-item"><span>Subclasses</span><strong>{modalClass.subs.length}</strong></div>
              </div>
            </div>
            {modalClass.feats.length > 0 && (
              <div className="modal-section">
                <h3 className="text-sm uppercase tracking-wider text-zinc-500 mb-2">Class Features ({modalClass.feats.length})</h3>
                <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                  {modalClass.feats.slice(0, 20).map((f, i) => (
                    <div key={i} className="feature-item">
                      <strong>{f.name}</strong>
                      <p>{f.text}</p>
                    </div>
                  ))}
                  {modalClass.feats.length > 20 && (
                    <p className="muted text-center mt-2">+ {modalClass.feats.length - 20} more features</p>
                  )}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setModalClass(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { selectClass(modalClass); setModalClass(null); }}>Select {modalClass.name}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
