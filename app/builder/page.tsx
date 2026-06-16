'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Accordion } from '@/components/Accordion';
import { FilterBar } from '@/components/FilterBar';
import { Stepper } from '@/components/Stepper';
import { ThemeToggle } from '@/components/ThemeToggle';
import SourceFilter from '@/components/SourceFilter';
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

/**
 * NumberStatInput — a number input that lets the user CLEAR the field
 * (and type a new value) without the controlled state slamming it back.
 *
 * The bug it fixes: setting `value={8}` while the user is editing means
 * every `setState(0)` forces the input back to a clamped int. So if the
 * user wants to change `15` to `9`, they have to backspace past the
 * `1` (which the handler then reads as `''` and clamps to 8) — making
 * it impossible to type a smaller value.
 *
 * The fix: keep a local string state while the input has focus. On
 * `change`, update the local string. On `blur`, parse + clamp + commit
 * to the parent's numeric state.
 */
function NumberStatInput({
  ability,
  value,
  min,
  max,
  onChange,
}: {
  ability: AbilityKey;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  // Keep local string in sync when the parent value changes from elsewhere
  // (e.g. Tasha's Custom Origin floated ASI) — but only when we're not
  // actively editing, otherwise the user's typing would be clobbered.
  useEffect(() => {
    if (!focused) setLocal(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      // Empty or junk — revert to last good value
      setLocal(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    setLocal(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label htmlFor={`stat-${ability}`}>{ability.toUpperCase()}</label>
      <input
        id={`stat-${ability}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={local}
        onFocus={() => setFocused(true)}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setLocal(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

/**
 * NumberLevelInput — same fix as NumberStatInput, applied to the level
 * field on the Identity step. The previous raw onChange clamped on every
 * keystroke, blocking the user from clearing the field to retype.
 */
function NumberLevelInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setLocal(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    setLocal(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label htmlFor="level">Level</label>
      <input
        id="level"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={local}
        onFocus={() => setFocused(true)}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') {
            setLocal(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

/**
 * ResizableSplitPane — two-column layout with a draggable divider.
 * On desktop: list (left) is a fixed pixel width, preview (right) flexes.
 * On mobile: handle and right pane are hidden via CSS; the right pane
 * just doesn't render. The parent component is responsible for opening
 * a modal instead on mobile (via the isDesktop boolean).
 *
 * Uses pointer events for mouse + touch. setPointerCapture keeps the drag
 * alive even if the cursor leaves the handle. Double-click resets to 360px.
 */
function ResizableSplitPane({
  leftPx,
  onLeftPxChange,
  minLeft = 240,
  maxLeft = 640,
  children,
}: {
  leftPx: number;
  onLeftPxChange: (n: number) => void;
  minLeft?: number;
  maxLeft?: number;
  children: [React.ReactNode, React.ReactNode];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clamped = Math.max(minLeft, Math.min(maxLeft, x));
    onLeftPxChange(clamped);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch {}
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  const onDoubleClick = () => onLeftPxChange(480);

  return (
    <div
      ref={containerRef}
      className="split-pane split-pane--resizable"
      style={{ ['--split-left' as any]: `${leftPx}px` }}
    >
      <div className="split-pane__list split-pane__left">{children[0]}</div>
      <div
        className="split-pane__handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels (drag, or double-click to reset)"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <span className="split-pane__handle-grip" aria-hidden="true" />
      </div>
      <div className="split-pane__right">{children[1]}</div>
    </div>
  );
}

interface RawSubrace {
  name: string;
  raceName?: string;
  source?: string;
  entries?: any[];
  ability?: any;
}interface RawRace {
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
    // Extract feats from entries - look for named feature objects
    const feats: { name: string; text: string }[] = [];
    if (sr.entries && Array.isArray(sr.entries)) {
      for (const e of sr.entries) {
        if (typeof e === 'object' && e && e.name && e.entries) {
          feats.push({ name: e.name, text: extractText(e.entries).slice(0, 500) });
        }
      }
    }
    if (!subraceMap.has(sr.raceName)) subraceMap.set(sr.raceName, []);
    subraceMap.get(sr.raceName)!.push({ name: sr.name, text, ability: sr.ability, feats: feats.length > 0 ? feats : undefined });
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
    // Dedupe by name+source combo, not just name
    const raceKey = `${r.name}-${r.source}`;
    if (seen.has(raceKey)) continue;
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

    seen.set(raceKey, {
      key: `${r.name.toLowerCase().replace(/[^a-z]/g, '-')}-${r.source.toLowerCase()}`,
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

      const classSource = c.source || 'PHB';
      const feats = (d.classFeature || []).map((f: any) => ({
        name: f.name,
        text: extractText(f.entries).slice(0, 600),
        source: f.source || classSource,
      }));

      const subMap = new Map<string, Subclass>();
      // Index subclass features by subclass name for quick lookup
      const subclassFeatureMap = new Map<string, any[]>();
      for (const sf of (d.subclassFeature || [])) {
        const key = `${sf.subclassShortName || sf.name}`;
        if (!subclassFeatureMap.has(key)) subclassFeatureMap.set(key, []);
        subclassFeatureMap.get(key)!.push(sf);
      }
      
      for (const s of (d.subclass || [])) {
        if (subMap.has(s.name)) continue;
        const text = `[${s.source || s.classSource || ''}] ${s.className || ''} subclass`.trim();
        
        // Get features for this subclass
        const key = s.shortName || s.name;
        const feats = (subclassFeatureMap.get(key) || []).map((f: any) => ({
          name: f.name,
          text: extractText(f.entries || []).slice(0, 600),
          level: f.level,
        }));
        
        subMap.set(s.name, { name: s.name, text, source: s.source, feats });
      }

      cls.push({
        key, name: c.name, hitDie: c.hd.faces,
        saves: c.proficiency, spell: c.spellcastingAbility || null,
        source: classSource, feats, subs: Array.from(subMap.values()),
      });
    } catch (e) { console.warn(key, e); }
  }
  return cls;
}

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  
  // Read step from URL on mount
  useEffect(() => {
    const stepParam = searchParams?.get('step');
    if (stepParam) {
      const parsed = parseInt(stepParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 6) {
        setStep(parsed);
      }
    }
  }, [searchParams]);
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

  // Preview state — the item currently shown in the right-hand pane
  // (desktop split-pane). Independent of the selected one.
  const [previewRaceKey, setPreviewRaceKey] = useState<string | null>(null);
  const [previewClassKey, setPreviewClassKey] = useState<string | null>(null);
  const [previewSubraceName, setPreviewSubraceName] = useState<string | null>(null);
  const [previewSubclassName, setPreviewSubclassName] = useState<string | null>(null);

  // Resizable split-pane widths (px) for Heritage/Calling on desktop.
  // Persisted to localStorage so the user's preferred split sticks.
  const [heritageSplitPx, setHeritageSplitPx] = useState<number>(480);
  const [callingSplitPx, setCallingSplitPx] = useState<number>(480);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = localStorage.getItem('codex.heritageSplitPx');
    const c = localStorage.getItem('codex.callingSplitPx');
    if (h) setHeritageSplitPx(parseInt(h, 10) || 480);
    if (c) setCallingSplitPx(parseInt(c, 10) || 480);
  }, []);
  useEffect(() => { try { localStorage.setItem('codex.heritageSplitPx', String(heritageSplitPx)); } catch {} }, [heritageSplitPx]);
  useEffect(() => { try { localStorage.setItem('codex.callingSplitPx', String(callingSplitPx)); } catch {} }, [callingSplitPx]);

  // Local source filter for the Heritage step. null = use enabledSources
  // (the Step-1 master). Setting a non-null value overrides for this step only.
  const [heritageSources, setHeritageSources] = useState<string[] | null>(null);

  // Viewport width — used to decide between preview-pane (desktop) and
  // modal (mobile) for race/class selection.
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    Promise.all([loadAllRaces(), loadAllClasses()]).then(([r, c]) => {
      setRaces(r);
      setClasses(c);
      setLoading(false);
    });
  }, []);

  // Lock body scroll when any modal is open (fixes the "background scrolls
  // while previewing" bug). Cleanup on unmount removes the class defensively.
  useEffect(() => {
    const anyOpen = modalRace || modalClass || modalSubrace || modalSubclass;
    if (anyOpen) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [modalRace, modalClass, modalSubrace, modalSubclass]);

  // All distinct sources across races (sorted, with PREF first).
  // Class source isn't tracked in DndClass data so we derive from races only.
  const allSources = useMemo(() => {
    const set = new Set<string>();
    races.forEach((r) => set.add(r.source));
    const sorted = Array.from(set).sort((a, b) => {
      const ai = PREF_SOURCES.indexOf(a);
      const bi = PREF_SOURCES.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return sorted.map((s) => ({ code: s, name: SOURCE_NAMES[s] || s }));
  }, [races]);

  const setSources = (next: string[]) => {
    setEnabledSources(next);
  };
  const toggleSource = (value: string) => {
    setEnabledSources((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev; // never empty
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
  };

  // Effective source list used in the Heritage step's local filter.
  // If the user has NOT changed the local filter (null), fall back to the
  // Step-1 enabledSources. If they HAVE changed it, use their local choice.
  const effectiveHeritageSources = heritageSources ?? enabledSources;

  const filteredRaces = useMemo(() => {
    return races.filter((r) => {
      if (!effectiveHeritageSources.includes(r.source)) return false;
      if (raceSearch && !r.name.toLowerCase().includes(raceSearch.toLowerCase())) return false;
      return true;
    });
  }, [races, raceSearch, effectiveHeritageSources]);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (!effectiveHeritageSources.includes(c.source || 'PHB')) return false;
      if (classSearch && !c.name.toLowerCase().includes(classSearch.toLowerCase())) return false;
      if (classSpell === 'yes' && !c.spell) return false;
      if (classSpell === 'no' && c.spell) return false;
      return true;
    });
  }, [classes, classSearch, classSpell, effectiveHeritageSources]);

  const selectedRace = races.find((r) => r.name === char.race);
  const selectedClass = classes.find((c) => c.key === char.klass);
  
  // Filter class features by enabled sources for Step 5 display
  const filteredClassFeatures = useMemo(() => {
    if (!selectedClass) return [];
    return selectedClass.feats.filter((f) => 
      effectiveHeritageSources.includes(f.source || selectedClass.source || 'PHB')
    );
  }, [selectedClass, effectiveHeritageSources]);

  // Derive the items currently shown in the right-hand preview pane.
  // Priority: user-clicked preview > currently selected item > null.
  const previewRace = previewRaceKey
    ? races.find((r) => r.key === previewRaceKey) || null
    : selectedRace || null;
  const previewClass = previewClassKey
    ? classes.find((c) => c.key === previewClassKey) || null
    : selectedClass || null;
  const previewSubrace = previewSubraceName && selectedRace
    ? selectedRace.subraces.find((sr) => sr.name === previewSubraceName) || null
    : null;
  const previewSubclass = previewSubclassName && selectedClass
    ? selectedClass.subs.find((s) => s.name === previewSubclassName) || null
    : null;

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
    const newStep = Math.min(STEP_LABELS.length, step + 1);
    setStep(newStep);
    router.replace(`/builder?step=${newStep}`);
  };
  const prevStep = () => {
    const newStep = Math.max(1, step - 1);
    setStep(newStep);
    router.replace(`/builder?step=${newStep}`);
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
          <Link href="/" className="title">d20.build<small>Codex Anima</small></Link>
          <div className="topbar-actions">
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
        <Link href="/" className="title">d20.build<small>Codex Anima</small></Link>
        <div className="topbar-actions">
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
            <p className="muted text-sm mb-2">Tap a source to enable or disable it. The builder filters Races by what you turn on. The <strong>+ All</strong> / <strong>✕ All</strong> button toggles all sources at once.</p>
            <SourceFilter
              sources={allSources}
              selected={enabledSources}
              onChange={setSources}
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
            <div className="check-cards">
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
            </div>

            <div className="btn-row">
              <Link href="/" className="btn secondary">Cancel</Link>
              <button type="button" className="btn primary" onClick={nextStep}>Next →</button>
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
              <NumberLevelInput
                value={char.level}
                min={1}
                max={20}
                onChange={(n) => setChar({ ...char, level: n })}
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={prevStep}>← Back</button>
              <button type="button" className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 3: HERITAGE === */}
        {step === 3 && (
          <div className="card">
            <h2>III. Heritage</h2>
            <p className="muted mb-3">Pick a race from the list on the left — its details appear on the right. On mobile, tap a race to open its preview.</p>

            <details className="disclosure heritage-disclosure">
              <summary><span>Source Filter</span><span className="heritage-disclosure__count">{effectiveHeritageSources.length}/{allSources.length}</span></summary>
              <SourceFilter
                sources={allSources}
                selected={effectiveHeritageSources}
                onChange={(next) => {
                  if (next.length === enabledSources.length && next.every((c) => enabledSources.includes(c))) {
                    setHeritageSources(null);
                  } else {
                    setHeritageSources(next);
                  }
                }}
                compact
              />
            </details>

            <FilterBar
              search={raceSearch}
              onSearchChange={setRaceSearch}
              searchPlaceholder="Search races…"
            />

            <ResizableSplitPane
              leftPx={heritageSplitPx}
              onLeftPxChange={setHeritageSplitPx}
              minLeft={360}
              maxLeft={1100}
            >
              <div className="split-pane__list-inner">
                {filteredRaces.length === 0 ? (
                  <p className="muted p-3" style={{ gridColumn: '1 / -1' }}>No races match your filters</p>
                ) : (
                  <>
                    {/* Races section - collapsible accordion */}
                    <details className="accordion-section" open>
                      <summary className="accordion-summary">
                        <span>Races</span>
                        <span className="accordion-arrow">▼</span>
                      </summary>
                      <div className="accordion-content">
                      {filteredRaces.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className={`list-item ${previewRaceKey === r.key ? 'previewing' : ''} ${char.race === r.name ? 'selected' : ''}`}
                        onClick={() => {
                          if (isDesktop) setPreviewRaceKey(r.key);
                          else setModalRace(r);
                        }}
                      >
                        <strong>{r.name}</strong>
                        {r.ability ? (
                          <span className="label-meta">
                            {(() => {
                              // r.ability can be array or object - handle both
                              const abilityObj = Array.isArray(r.ability) 
                                ? Object.assign({}, ...r.ability.filter((a: any) => typeof a === 'object' && !a.choose))
                                : r.ability;
                              if (!abilityObj || typeof abilityObj !== 'object') return '—';
                              const entries = Object.entries(abilityObj).filter(([k]) => k !== 'choose');
                              if (entries.length === 0) {
                                // Check for choose in any array element
                                const anyChoose = Array.isArray(r.ability) ? r.ability.some((a: any) => a?.choose) : false;
                                return anyChoose ? '+1 Choose' : '—';
                              }
                              return entries.map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ');
                            })()}
                          </span>
                        ) : (
                          <span className="label-meta">—</span>
                        )}
                      </button>
                    ))}
                      </div>
                    </details>
                    {/* Subrace - always show the section */}
                    <details className="accordion-section" open={!!selectedRace}>
                      <summary className="accordion-summary">
                        <span>Subrace</span>
                        <span className="accordion-arrow">{selectedRace ? '▼' : '▶'}</span>
                      </summary>
                      <div className="accordion-content">
                      {selectedRace && selectedRace.subraces.length > 0 ? (
                        selectedRace.subraces.map((sr) => (
                          <button
                            key={sr.name}
                            type="button"
                            className={`list-item ${previewSubraceName === sr.name ? 'previewing' : ''} ${char.subrace === sr.name ? 'selected' : ''}`}
                            onClick={() => {
                              if (isDesktop) setPreviewSubraceName(sr.name);
                              else setModalSubrace(sr);
                            }}
                          >
                            <strong>{sr.name}</strong>
                            {sr.ability && (
                              <span className="label-meta">
                                {(() => {
                                  if (!sr.ability) return null;
                                  // sr.ability can be array or object - handle both
                                  const abilityObj = Array.isArray(sr.ability)
                                    ? Object.assign({}, ...sr.ability.filter((a: any) => typeof a === 'object' && !a.choose))
                                    : sr.ability;
                                  if (!abilityObj || typeof abilityObj !== 'object') return null;
                                  const entries = Object.entries(abilityObj).filter(([k]) => k !== 'choose');
                                  if (entries.length === 0) {
                                    const anyChoose = Array.isArray(sr.ability) ? sr.ability.some((a: any) => a?.choose) : false;
                                    return anyChoose ? '+1 Choose' : null;
                                  }
                                  return entries.map(([k, v]) => `${k.toUpperCase()}+${v}`).join(' ');
                                })()}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="muted text-sm p-2">Select a race to see subraces</p>
                      )}
                      </div>
                    </details>
                  </>
                )}
              </div>

              <div className={`split-pane__preview ${!previewRace ? 'split-pane__preview--empty' : ''}`}>
                {!previewRace && <p>← Pick a race to preview it</p>}
                {previewRace && (
                  <>
                    <h3>{previewRace.name}</h3>
                    <div className="meta">
                      <span className="source-tag">{SOURCE_NAMES[previewRace.source] || previewRace.source}</span>
                      <span>·</span>
                      <span>{previewRace.size} · {previewRace.speed} ft</span>
                    </div>
                    {Object.keys(previewRace.ability).length > 0 && (
                      <div className="section-stats" style={{ marginBottom: 12 }}>
                        {Object.entries(previewRace.ability).map(([k, v]) => (
                          <div key={k} className="stat-item">
                            <span>{k.toUpperCase()}</span>
                            <strong>+{String(v)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {previewRace.feats.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <h3 style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>Features</h3>
                        {previewRace.feats.slice(0, 6).map((f, i) => (
                          <div key={i} className="feature-block">
                            {f.name && <strong>{f.name}</strong>}
                            <p>{f.text}</p>
                          </div>
                        ))}
                        {previewRace.feats.length > 6 && (
                          <p className="muted text-sm" style={{ marginTop: 4 }}>+ {previewRace.feats.length - 6} more features</p>
                        )}
                      </div>
                    )}
                    {/* Show all available subraces for selection */}
                    {previewRace.subraces.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <h3 style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>Subraces</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {previewRace.subraces.map((sr) => (
                            <button
                              key={sr.name}
                              type="button"
                              className={`source-chip ${char.subrace === sr.name ? 'source-chip--active' : ''}`}
                              onClick={() => {
                                setChar({ ...char, subrace: sr.name });
                              }}
                            >
                              {sr.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {previewSubrace && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                        <p className="split-pane__sublist-label" style={{ marginBottom: 6 }}>
                          Subrace: {previewSubrace.name}
                        </p>
                        {previewSubrace.ability && Object.keys(previewSubrace.ability).length > 0 && (
                          <div className="section-stats" style={{ marginBottom: 8 }}>
                            {Object.entries(previewSubrace.ability).map(([k, v]) => (
                              <div key={k} className="stat-item">
                                <span>{k.toUpperCase()}</span>
                                <strong>+{String(v)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                        {previewSubrace.text && (
                          <p style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.5 }}>{previewSubrace.text}</p>
                        )}
                        {previewSubrace.feats && previewSubrace.feats.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <h3 style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>Subrace Features</h3>
                            {previewSubrace.feats.slice(0, 4).map((f, i) => (
                              <div key={i} className="feature-block">
                                {f.name && <strong>{f.name}</strong>}
                                <p>{f.text}</p>
                              </div>
                            ))}
                            {previewSubrace.feats.length > 4 && (
                              <p className="muted text-sm" style={{ marginTop: 4 }}>+ {previewSubrace.feats.length - 4} more</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="preview-actions">
                      <button
                        type="button"
                        className={`btn ${char.race === previewRace.name ? 'accent' : 'primary'}`}
                        onClick={() => {
                          if (char.race === previewRace.name) {
                            setChar((p) => ({ ...p, race: '', subrace: '' }));
                            setPreviewRaceKey(null);
                          } else {
                            selectRace(previewRace);
                            // Auto-select first subrace if there's only one
                            if (previewRace.subraces.length === 1) {
                              selectSubrace(previewRace.subraces[0].name);
                            } else {
                              setChar((p) => ({ ...p, subrace: '' }));
                            }
                          }
                        }}
                      >
                        {char.race === previewRace.name ? '✕ Deselect' : `Select ${previewRace.name}`}
                      </button>
                      {previewSubrace && (
                        <button
                          type="button"
                          className={`btn ${char.subrace === previewSubrace.name ? 'accent' : 'secondary'}`}
                          onClick={() => selectSubrace(previewSubrace.name)}
                        >
                          {char.subrace === previewSubrace.name ? '✕ Deselect subrace' : 'Select subrace'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ResizableSplitPane>

            <details className="disclosure">
              <summary>Background — coming in Phase B</summary>
              <p className="muted">Background selection arrives in Phase B. For now, focus on Race + Subrace.</p>
            </details>

            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={prevStep}>← Back</button>
              <button type="button" className="btn primary" onClick={nextStep}>Next →</button>
            </div>
          </div>
        )}

        {/* === STEP 4: CALLING === */}
        {step === 4 && (
          <div className="card">
            <h2>IV. Calling</h2>
            <p className="muted mb-3">Choose a class from the list on the left — its features and subclass options appear on the right.</p>

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

            <ResizableSplitPane
              leftPx={callingSplitPx}
              onLeftPxChange={setCallingSplitPx}
              minLeft={360}
              maxLeft={1100}
            >
              <div className="split-pane__list-inner">
                {filteredClasses.length === 0 ? (
                  <p className="muted p-3" style={{ gridColumn: '1 / -1' }}>No classes match your filters</p>
                ) : (
                  <>
                    {/* Classes section - collapsible accordion */}
                    <details className="accordion-section" open>
                      <summary className="accordion-summary">
                        <span>Classes</span>
                        <span className="accordion-arrow">▼</span>
                      </summary>
                      <div className="accordion-content">
                      {filteredClasses.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={`list-item ${previewClassKey === c.key ? 'previewing' : ''} ${char.klass === c.key ? 'selected' : ''}`}
                        onClick={() => {
                          if (isDesktop) setPreviewClassKey(c.key);
                          else setModalClass(c);
                        }}
                      >
                        <strong>{c.name}</strong>
                        <span className="label-meta">d{c.hitDie} · {c.spell || 'martial'}</span>
                      </button>
                    ))}
                      </div>
                    </details>
                    {/* Subclass - always show the section */}
                    <details className="accordion-section" open={!!selectedClass}>
                      <summary className="accordion-summary">
                        <span>Subclass</span>
                        <span className="accordion-arrow">{selectedClass ? '▼' : '▶'}</span>
                      </summary>
                      <div className="accordion-content">
                      {selectedClass && selectedClass.subs.length > 0 ? (
                        selectedClass.subs.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            className={`list-item ${previewSubclassName === s.name ? 'previewing' : ''} ${char.subclass === s.name ? 'selected' : ''}`}
                            onClick={() => {
                              if (isDesktop) setPreviewSubclassName(s.name);
                              else setModalSubclass(s);
                            }}
                          >
                            <strong>{s.name}</strong>
                            <span className="label-meta">subclass</span>
                          </button>
                        ))
                      ) : (
                        <p className="muted text-sm p-2">Select a class to see subclasses</p>
                      )}
                      </div>
                    </details>
                  </>
                )}
              </div>

              <div className={`split-pane__preview ${!previewClass ? 'split-pane__preview--empty' : ''}`}>
                {!previewClass && <p>← Pick a class to preview it</p>}
                {previewClass && (
                  <>
                    <h3>{previewClass.name}</h3>
                    <div className="meta">
                      <span>d{previewClass.hitDie} hit die</span>
                      <span>·</span>
                      <span>{previewClass.spell || 'martial'}</span>
                      <span>·</span>
                      <span>{previewClass.subs.length} subclass{previewClass.subs.length === 1 ? '' : 'es'}</span>
                    </div>
                    <div className="section-stats" style={{ marginBottom: 12 }}>
                      <div className="stat-item"><span>Hit Die</span><strong>d{previewClass.hitDie}</strong></div>
                      <div className="stat-item"><span>Saves</span><strong>{previewClass.saves.join(', ').toUpperCase()}</strong></div>
                      <div className="stat-item"><span>Spellcasting</span><strong>{previewClass.spell || 'None'}</strong></div>
                      <div className="stat-item"><span>Subclasses</span><strong>{previewClass.subs.length}</strong></div>
                    </div>
                    {previewClass.feats.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <h3 style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>
                          Class Features ({previewClass.feats.length})
                        </h3>
                        {previewClass.feats.slice(0, 8).map((f, i) => (
                          <div key={i} className="feature-block">
                            <strong>{f.name}</strong>
                            <p>{f.text}</p>
                          </div>
                        ))}
                        {previewClass.feats.length > 8 && (
                          <p className="muted text-sm" style={{ marginTop: 4 }}>+ {previewClass.feats.length - 8} more features</p>
                        )}
                      </div>
                    )}
                    {/* Show all available subclasses for selection */}
                    {previewClass.subs.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <h3 style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 6 }}>
                          Subclasses
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {previewClass.subs.map((s) => (
                            <button
                              key={s.name}
                              type="button"
                              className={`source-chip ${char.subclass === s.name ? 'source-chip--active' : ''}`}
                              onClick={() => {
                                setChar({ ...char, subclass: s.name });
                              }}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {previewSubclass && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
                        <p className="split-pane__sublist-label" style={{ marginBottom: 6 }}>
                          Subclass: {previewSubclass.name}
                        </p>
                        {previewSubclass.text && (
                          <p style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.5 }}>{previewSubclass.text}</p>
                        )}
                        <p className="muted text-sm" style={{ marginTop: 4 }}>You can pick at level 1 (2024) or level 3 (2014) — reversible until you save.</p>
                      </div>
                    )}
                    <div className="preview-actions">
                      <button
                        type="button"
                        className={`btn ${char.klass === previewClass.key ? 'accent' : 'primary'}`}
                        onClick={() => {
                          if (char.klass === previewClass.key) {
                            setChar((p) => ({ ...p, klass: '', class: '', subclass: '' }));
                            setPreviewClassKey(null);
                          } else {
                            selectClass(previewClass);
                            setChar((p) => ({ ...p, subclass: '' }));
                          }
                        }}
                      >
                        {char.klass === previewClass.key ? '✕ Deselect' : `Select ${previewClass.name}`}
                      </button>
                      {previewSubclass && (
                        <button
                          type="button"
                          className={`btn ${char.subclass === previewSubclass.name ? 'accent' : 'secondary'}`}
                          onClick={() => selectSubclass(previewSubclass.name)}
                        >
                          {char.subclass === previewSubclass.name ? '✕ Deselect subclass' : 'Select subclass'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ResizableSplitPane>

            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={prevStep}>← Back</button>
              <button type="button" className="btn primary" onClick={nextStep}>Next →</button>
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
                <NumberStatInput
                  key={a}
                  ability={a}
                  value={char.abilities[a] || 8}
                  min={8}
                  max={15}
                  onChange={(v) =>
                    setChar({ ...char, abilities: { ...char.abilities, [a]: v } })
                  }
                />
              ))}
            </div>
            <p className={`mt-4 ${ptUsed > 27 ? 'accent' : 'muted'}`}>
              Points used: <strong>{ptUsed}</strong> / 27
            </p>

            {selectedClass && filteredClassFeatures.length > 0 && (
              <details className="disclosure">
                <summary>
                  <span>Class features preview ({filteredClassFeatures.length})</span>
                </summary>
                <div className="mt-2">
                  {filteredClassFeatures.slice(0, 5).map((f, i) => (
                    <div key={i} className="feature-item">
                      <strong>{f.name}</strong>
                      <p>{f.text}</p>
                    </div>
                  ))}
                  {filteredClassFeatures.length > 5 && (
                    <p className="muted text-center mt-2">+ {filteredClassFeatures.length - 5} more features</p>
                  )}
                </div>
              </details>
            )}

            <div className="btn-row">
              <button type="button" className="btn secondary" onClick={prevStep}>← Back</button>
              <button type="button" className="btn primary" onClick={nextStep}>Next →</button>
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
              <button type="button" className="btn secondary" onClick={prevStep}>← Back</button>
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
              <button type="button" className="btn secondary" onClick={() => setModalRace(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => { selectRace(modalRace); setModalRace(null); }}>
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
                    {Array.isArray(modalSubrace.ability) ? (
                      modalSubrace.ability.map((abil, idx) => (
                        Object.entries(abil).filter(([k]) => k !== 'choose').map(([k, v]) => (
                          <div key={`${k}-${idx}`} className="stat-item">
                            <span>{k.toUpperCase()}</span>
                            <strong>+{String(v)}</strong>
                          </div>
                        ))
                      ))
                    ) : (
                      Object.entries(modalSubrace.ability).filter(([k]) => k !== 'choose').map(([k, v]) => (
                        <div key={k} className="stat-item">
                          <span>{k.toUpperCase()}</span>
                          <strong>+{String(v)}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {modalSubrace.feats && modalSubrace.feats.length > 0 && (
                <div className="modal-section">
                  <h3>Features</h3>
                  {modalSubrace.feats.map((f, i) => (
                    <div key={i} className="feature-item">
                      {f.name && <strong>{f.name}</strong>}
                      <p>{f.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn secondary" onClick={() => setModalSubrace(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => { selectSubrace(modalSubrace.name); setModalSubrace(null); }}>
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
              <button type="button" className="btn secondary" onClick={() => setModalClass(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => { selectClass(modalClass); setModalClass(null); }}>
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
              {modalSubclass.feats && modalSubclass.feats.length > 0 && (
                <div className="modal-section">
                  <h3>Features</h3>
                  {modalSubclass.feats.map((f, i) => (
                    <div key={i} className="feature-item">
                      {f.level && <span className="source-tag" style={{ marginBottom: 4 }}>Level {f.level}</span>}
                      {f.name && <strong>{f.name}</strong>}
                      <p>{f.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted mt-3 text-sm">You can pick your subclass at level 1 (2024 rules) or wait until level 3 (2014 rules) — either way, this choice is reversible until you save.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn secondary" onClick={() => setModalSubclass(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => { selectSubclass(modalSubclass.name); setModalSubclass(null); }}>
                Select {modalSubclass.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Suspense } from 'react';

export default function BuilderPage() {
  return (
    <Suspense fallback={<div className="wrap"><p className="muted">Loading...</p></div>}>
      <BuilderContent />
    </Suspense>
  );
}
