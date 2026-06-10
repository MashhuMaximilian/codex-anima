'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Accordion } from '@/components/Accordion';
import { FilterBar } from '@/components/FilterBar';
import { Stepper } from '@/components/Stepper';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Race,
  DndClass,
  Character,
  SOURCE_NAMES,
  PREF_SOURCES,
  AbilityScore,
  Subrace,
  Subclass,
} from '@/lib/types';
import { saveCharacter, importCharacter } from '@/lib/storage';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityKey = typeof ABILITIES[number];

const STEP_LABELS = ['Settings', 'Identity', 'Heritage', 'Calling', 'Capabilities', 'Spells & Gear'];

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
  return text
    .replace(/\{@([^}]+)\}/g, (_, inner) => {
      const parts = inner.split('|')[0].split(' ');
      return parts.slice(1).join(' ');
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractText(entries: any[] | undefined): string {
  if (!entries) return '';
  return cleanTag(entries.map((e) => {
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

  const subraceMap = new Map<string, Subrace[]>();
  for (const sr of (d.subrace || []) as RawSubrace[]) {
    if (!sr.raceName || !sr.name) continue;
    const text = extractText(sr.entries).slice(0, 500);
    if (!subraceMap.has(sr.raceName)) subraceMap.set(sr.raceName, []);
    subraceMap.get(sr.raceName)!.push({ name: sr.name, text, ability: sr.ability });
  }

  for (const [rn, arr] of subraceMap) {
    const dedupe = new Set<string>();
    subraceMap.set(rn, arr.filter((sr) => {
      if (dedupe.has(sr.name)) return false;
      dedupe.add(sr.name);
      return true;
    }));
  }

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

      const subMap = new Map<string, Subclass>();
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

  // === Settings step state ===
  const [enabledSources, setEnabledSources] = useState<string[]>([...PREF_SOURCES]);
  const [ruleset, setRuleset] = useState<'5e' | '5.5e'>('5.5e');
  const [tashaCustom, setTashaCustom] = useState(false);
  const [level1Feat, setLevel1Feat] = useState(false);

  const [char, setChar] = useState<Character>({
    id: crypto.randomUUID(),
    name: '', title: '', pronouns: '', level: 1,
    race: '', klass: '', subclass: '', subrace: '',
    abilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    createdAt: '', updatedAt: '',
  });

  // Heritage / Calling filters
  const [raceSearch, setRaceSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classSpell, setClassSpell] = useState('');

  // Modal state
  const [modalRace, setModalRace] = useState<Race | null>(null);
  const [modalClass, setModalClass] = useState<DndClass | null>(null);
  const [modalSubrace, setModalSubrace] = useState<Subrace | null>(null);
  const [modalSubclass, setModalSubclass] = useState<Subclass | null>(null);

  useEffect(() => {
    Promise.all([loadAllRaces(), loadAllClasses()]).then(([r, c]) => {
      setRaces(r);
      setClasses(c);
      setLoading(false);
    });
  }, []);

  // All distinct sources across races + classes (sorted, with PREF first)
  const allSources = useMemo(() => {
    const set = new Set<string>();
    races.forEach((r) => set.add(r.source));
    classes.forEach((c) => c.feats.forEach((f) => {
      // classes have no source in DndClass — skip
    }));
    const sorted = Array.from(set).sort((a, b) => {
      const ai = PREF_SOURCES.indexOf(a);
      const bi = PREF_SOURCES.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return sorted.map((s) => ({ value: s, label: `${s} · ${SOURCE_NAMES[s] || s}` }));
  }, [races, classes]);

  const toggleSource = (value: string) => {
    setEnabledSources((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const filteredRaces = useMemo(() => {
    return races.filter((r) => {
      if (!enabledSources.includes(r.source)) return false;
      if (raceSearch && !r.name.toLowerCase().includes(raceSearch.toLowerCase())) return false;
      return true;
    });
  }, [races, raceSearch, enabledSources]);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (classSearch && !c.name.toLowerCase().includes(classSearch.toLowerCase())) return false;
      if (classSpell === 'yes' && !c.spell) return false;
      if (classSpell === 'no' && c.spell) return false;
      return true;
    });
  }, [classes, classSearch, classSpell]);

  const selectedRace = races.find((r) => r.name === char.race);
  const selectedClass = classes.find((c) => c.key === char.klass);

  const selectRace = (race: Race) => {
    setChar((prev) => ({ ...prev, race: race.name, subrace: '' }));
  };
  const selectSubrace = (name: string) => {
    setChar((prev) => ({ ...prev, subrace: prev.subrace === name ? '' : name }));
  };
  const selectClass = (c: DndClass) => {
    setChar((prev) => ({ ...prev, klass: c.key, class: c.name, subclass: '' }));
  };
  const selectSubclass = (name: string) => {
    setChar((prev) => ({ ...prev, subclass: prev.subclass === name ? '' : name }));
  };

  // === Point-buy helpers ===
  const getPtCost = (s: number) => {
    if (s <= 8) return 0;
    return ({ 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } as Record<number, number>)[s] || 0;
  };
  const ptUsed = ABILITIES.reduce((sum, a) => sum + getPtCost(char.abilities[a] || 8), 0);

  // === Step navigation ===
  const nextStep = () => {
    if (step === 1) {
      if (enabledSources.length === 0) return alert('Enable at least one source');
    } else if (step === 2) {
      if (!char.name?.trim()) return alert('Enter a name');
    } else if (step === 3) {
      if (!char.race) return alert('Pick a race');
    } else if (step === 4) {
      if (!char.klass) return alert('Pick a class');
    } else if (step === 5) {
      if (ptUsed > 27) return alert(`Over budget by ${ptUsed - 27} points — reduce a stat`);
    }
    setStep((s) => Math.min(STEP_LABELS.length, s + 1));
  };
  const prevStep = () => setStep((s) => Math.max(1, s - 1));

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
          <Link href="/" className="title">Codex Anima<small>D&amp;D 5e</small></Link>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
          </div>
        </div>
        <div className="wrap text-center py-20">
          <p className="muted">Loading the multiverse…</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <Link href="/" className="title">Codex Anima<small>Builder</small></Link>
        <div className="flex gap-2 items-center">
          <Link href="/" className="tbtn">Home</Link>
          <button className="tbtn" onClick={handleImport}>Import</button>
          <ThemeToggle />
        </div>
      </div>

      <Stepper steps={STEP_LABELS} current={step} />

      <div className="wrap">
        {/* === STEP 1: SETTINGS === */}
        {step === 1 && (
          <div className="card">
            <h2>I. Settings</h2>
            <p className="muted mb-4">Choose the sources to load, the ruleset, and any optional character-build options.</p>

            <h3 className="mb-2">Sources</h3>
            <p className="muted text-sm mb-2">Tap a source to enable or disable it. The builder filters Races &amp; Classes by what you turn on.</p>
            <FilterBar
              search={''}
              onSearchChange={() => {}}
              chips={{
                options: allSources,
                selected: enabledSources,
                onToggle: toggleSource,
                onClear: () => setEnabledSources([]),
              }}
            />

            <h3 className="mt-6 mb-2">Ruleset</h3>
            <div className="toggle-group" role="radiogroup" aria-label="Ruleset">
              <button
                type="button"
                role="radio"
                aria-checked={ruleset === '5.5e'}
                className={ruleset === '5.5e' ? 'active' : ''}
                onClick={() => setRuleset('5.5e')}
              >
                5.5e (2024)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={ruleset === '5e'}
                className={ruleset === '5e' ? 'active' : ''}
                onClick={() => setRuleset('5e')}
              >
                5e (2014)
              </button>
            </div>

            <h3 className="mt-6 mb-2">Optional Rules</h3>
            <div
              className={`checkbox-row ${tashaCustom ? 'checked' : ''}`}
              onClick={() => setTashaCustom((v) => !v)}
            >
              <div className="label-block">
                <strong>Tasha&rsquo;s Custom Origin</strong>
                <span>Replace racial ASI with floating +2/+1 (or +1/+1/+1). Most 5.5e races already use this — disable to lock ASIs to race.</span>
              </div>
              <div className="check-icon">{tashaCustom ? '✓' : ''}</div>
            </div>

            <div
              className={`checkbox-row ${level1Feat ? 'checked' : ''}`}
              onClick={() => setLevel1Feat((v) => !v)}
            >
              <div className="label-block">
                <strong>Level-1 Feat</strong>
                <span>All characters start with one feat at level 1 (2024 rules default). Uncheck to use the 2014 rule (no L1 feat).</span>
                {level1Feat && <span className="lvl-1-feat">Active</span>}
              </div>
              <div className="check-icon">{level1Feat ? '✓' : ''}</div>
            </div>

            <div className="btn-row">
              <Link href="/" className="btn secondary">Cancel</Link>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 2: IDENTITY === */}
        {step === 2 && (
          <div className="card">
            <h2>II. Identity</h2>
            <p className="muted mb-4">Who walks this path? Name them, and how the world knows them.</p>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  id="name"
                  type="text"
                  value={char.name}
                  onChange={(e) => setChar({ ...char, name: e.target.value })}
                  placeholder="Miliardes…"
                />
              </div>
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={char.title}
                  onChange={(e) => setChar({ ...char, title: e.target.value })}
                  placeholder="The Living Patent"
                />
              </div>
              <div className="form-group">
                <label htmlFor="pronouns">Pronouns</label>
                <input
                  id="pronouns"
                  type="text"
                  value={char.pronouns}
                  onChange={(e) => setChar({ ...char, pronouns: e.target.value })}
                  placeholder="it/its"
                />
              </div>
              <div className="form-group">
                <label htmlFor="level">Starting Level</label>
                <input
                  id="level"
                  type="number"
                  value={char.level}
                  min={1}
                  max={20}
                  onChange={(e) => setChar({ ...char, level: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 3: HERITAGE === */}
        {step === 3 && (
          <div className="card">
            <h2>III. Heritage</h2>
            <p className="muted mb-4">Pick a race, then drill into subrace if available. Race opens a detail modal; subrace is a quick toggle inside.</p>

            <Accordion title="Race" summary={char.race || '— Choose —'} defaultOpen>
              <FilterBar
                search={raceSearch}
                onSearchChange={setRaceSearch}
                searchPlaceholder="Search races…"
              />
              <div className="pick-grid">
                {filteredRaces.slice(0, 60).map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={`pick-card ${char.race === r.name ? 'selected' : ''}`}
                    onClick={() => setModalRace(r)}
                  >
                    <strong>{r.name}</strong>
                    <span className="source-tag">{SOURCE_NAMES[r.source] || r.source}</span>
                  </button>
                ))}
                {filteredRaces.length === 0 && (
                  <p className="muted col-span-full">No races match your filters</p>
                )}
              </div>
            </Accordion>

            {selectedRace && (
              <Accordion
                title="Subrace"
                summary={char.subrace || '— Optional —'}
              >
                {selectedRace.subraces.length === 0 ? (
                  <p className="muted">No subraces for {selectedRace.name}.</p>
                ) : (
                  <div className="pick-grid">
                    {selectedRace.subraces.map((sr) => (
                      <button
                        key={sr.name}
                        type="button"
                        className={`pick-card ${char.subrace === sr.name ? 'selected' : ''}`}
                        onClick={() => setModalSubrace(sr)}
                      >
                        <strong>{sr.name}</strong>
                        {sr.text && <span className="desc">{sr.text.slice(0, 60)}…</span>}
                      </button>
                    ))}
                  </div>
                )}
              </Accordion>
            )}

            <Accordion title="Background" summary="— Coming soon —">
              <p className="muted">Background selection arrives in Phase B. For now, focus on Race + Subrace.</p>
            </Accordion>

            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 4: CALLING === */}
        {step === 4 && (
          <div className="card">
            <h2>IV. Calling</h2>
            <p className="muted mb-4">Choose a class. Subclass is optional at level 1 — open the class modal to drill in.</p>

            <Accordion title="Class" summary={char.class || '— Choose —'} defaultOpen>
              <FilterBar
                search={classSearch}
                onSearchChange={setClassSearch}
                searchPlaceholder="Search classes…"
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
                {filteredClasses.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`pick-card ${char.klass === c.key ? 'selected' : ''}`}
                    onClick={() => setModalClass(c)}
                  >
                    <strong>{c.name}</strong>
                    <span className="source-tag">d{c.hitDie} • {c.spell || 'martial'}</span>
                  </button>
                ))}
              </div>
            </Accordion>

            {selectedClass && selectedClass.subs.length > 0 && (
              <Accordion title="Subclass" summary={char.subclass || '— Optional —'}>
                <div className="pick-grid">
                  {selectedClass.subs.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      className={`pick-card ${char.subclass === s.name ? 'selected' : ''}`}
                      onClick={() => setModalSubclass(s)}
                    >
                      <strong>{s.name}</strong>
                      <span className="desc">{s.text}</span>
                    </button>
                  ))}
                </div>
              </Accordion>
            )}

            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 5: CAPABILITIES === */}
        {step === 5 && (
          <div className="card">
            <h2>V. Capabilities</h2>
            <p className="muted mb-2">The body&rsquo;s truth. Point buy: 8→13 costs 1 each; 14→15 costs 2. Budget: 27 points.</p>
            {tashaCustom && (
              <p className="muted text-sm mb-3">Tasha&rsquo;s Custom Origin is on — racial ASIs will float to your best two stats at character creation.</p>
            )}
            <div className="stat-row-grid">
              {ABILITIES.map((a) => (
                <div key={a} className="form-group">
                  <label htmlFor={`stat-${a}`}>{a.toUpperCase()}</label>
                  <input
                    id={`stat-${a}`}
                    type="number"
                    min={8}
                    max={15}
                    value={char.abilities[a]}
                    onChange={(e) =>
                      setChar({
                        ...char,
                        abilities: {
                          ...char.abilities,
                          [a]: Math.max(8, Math.min(15, parseInt(e.target.value) || 8)),
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <p className={`mt-4 ${ptUsed > 27 ? 'accent' : 'muted'}`}>
              Points used: <strong>{ptUsed}</strong> / 27
            </p>

            {selectedClass && selectedClass.feats.length > 0 && (
              <details className="mt-4">
                <summary className="muted cursor-pointer py-2">Class features preview ({selectedClass.feats.length})</summary>
                <div className="mt-2">
                  {selectedClass.feats.slice(0, 5).map((f, i) => (
                    <div key={i} className="feature-item">
                      <strong>{f.name}</strong>
                      <p>{f.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="btn-row">
              <button className="btn secondary" onClick={prevStep}>← Back</button>
              <button className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 6: SPELLS & GEAR (Phase A placeholder) === */}
        {step === 6 && (
          <div className="card">
            <h2>VI. Spells &amp; Gear</h2>
            <p className="muted mb-4">Spell selection library and starting equipment are coming in Phase B. For now, review and save.</p>

            <div className="summary-box">
              <h3>{char.name || 'Unnamed'}</h3>
              {char.title && <p className="italic muted">&ldquo;{char.title}&rdquo;</p>}
              <p>Level {char.level} {char.race} {char.subrace && `(${char.subrace})`} {char.class} {char.subclass && `— ${char.subclass}`}</p>
              {char.pronouns && <p className="muted">({char.pronouns})</p>}
              <div className="stat-row-grid mt-4">
                {ABILITIES.map((a) => {
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
              <button className="btn primary" onClick={handleSave}>Save &amp; Open →</button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================
          MODALS — bottom-anchored action bar (.modal-footer)
          ============================================ */}

      {/* Race Modal */}
      {modalRace && (
        <div className="modal open" onClick={(e) => { if (e.target === e.currentTarget) setModalRace(null); }}>
          <div className="modal-backdrop" />
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2>{modalRace.name}</h2>
                <div className="meta">
                  <span className="source-tag">{SOURCE_NAMES[modalRace.source] || modalRace.source}</span>
                </div>
              </div>
              <button type="button" className="modal-close" onClick={() => setModalRace(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="section-stats">
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
                  <h3>Features</h3>
                  {modalRace.feats.map((f, i) => (
                    <div key={i} className="feature-item">
                      {f.name && <strong>{f.name}</strong>}
                      <p>{f.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setModalRace(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { selectRace(modalRace); setModalRace(null); }}>
                Select {modalRace.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subrace Modal */}
      {modalSubrace && (
        <div className="modal open" onClick={(e) => { if (e.target === e.currentTarget) setModalSubrace(null); }}>
          <div className="modal-backdrop" />
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2>{modalSubrace.name}</h2>
                <div className="meta">Subrace of {char.race}</div>
              </div>
              <button type="button" className="modal-close" onClick={() => setModalSubrace(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {modalSubrace.text && (
                <div className="modal-section">
                  <h3>Description</h3>
                  <p style={{ color: 'var(--text)', lineHeight: 1.6 }}>{modalSubrace.text}</p>
                </div>
              )}
              {modalSubrace.ability && (
                <div className="modal-section">
                  <h3>Ability Modifiers</h3>
                  <div className="section-stats">
                    {Object.entries(modalSubrace.ability).map(([k, v]) => (
                      <div key={k} className="stat-item">
                        <span>{k.toUpperCase()}</span>
                        <strong>+{String(v)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setModalSubrace(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { selectSubrace(modalSubrace.name); setModalSubrace(null); }}>
                Select {modalSubrace.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Modal */}
      {modalClass && (
        <div className="modal open" onClick={(e) => { if (e.target === e.currentTarget) setModalClass(null); }}>
          <div className="modal-backdrop" />
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2>{modalClass.name}</h2>
                <div className="meta">d{modalClass.hitDie} hit die • {modalClass.spell || 'martial'}</div>
              </div>
              <button type="button" className="modal-close" onClick={() => setModalClass(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
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
                  <h3>Class Features ({modalClass.feats.length})</h3>
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
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setModalClass(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { selectClass(modalClass); setModalClass(null); }}>
                Select {modalClass.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subclass Modal */}
      {modalSubclass && (
        <div className="modal open" onClick={(e) => { if (e.target === e.currentTarget) setModalSubclass(null); }}>
          <div className="modal-backdrop" />
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2>{modalSubclass.name}</h2>
                <div className="meta">Subclass of {char.class}</div>
              </div>
              <button type="button" className="modal-close" onClick={() => setModalSubclass(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {modalSubclass.text && (
                <p style={{ color: 'var(--text)', lineHeight: 1.6 }}>{modalSubclass.text}</p>
              )}
              <p className="muted mt-3 text-sm">You can pick your subclass at level 1 (2024 rules) or wait until level 3 (2014 rules) — either way, this choice is reversible until you save.</p>
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setModalSubclass(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { selectSubclass(modalSubclass.name); setModalSubclass(null); }}>
                Select {modalSubclass.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
