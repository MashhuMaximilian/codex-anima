// Data loaders for races and classes
import { Race, DndClass, Subrace } from './types';

const PREF_SOURCES = ["XPHB", "PHB", "TCE", "MPMM", "VGM"];
const EXCLUDED_SOURCES = ["PSA", "PSD", "AAG"];

interface RawSubrace {
  name: string;
  source?: string;
  raceName?: string;
  raceSource?: string;
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
  subrace?: any[];
}

interface RawClass {
  class: Array<{
    name: string;
    hd: { faces: number };
    proficiency: string[];
    spellcastingAbility?: string;
  }>;
  classFeature?: Array<{
    name: string;
    entries?: any[];
  }>;
  subclass?: Array<{
    name: string;
    source?: string;
    className?: string;
    classSource?: string;
  }>;
}

function extractText(entries: any[] | undefined): string {
  if (!entries) return "";
  return entries.map(e => {
    if (typeof e === 'string') return e;
    if (e.text) return e.text;
    if (e.entries?.[0]?.text) return e.entries[0].text;
    if (Array.isArray(e.entries)) return extractText(e.entries);
    return "";
  }).join(" ").trim();
}

export async function loadRaces(): Promise<Race[]> {
  const res = await fetch('https://character-sheets.pages.dev/data/races.json');
  // For local dev, use relative path
  // const res = await fetch('/data/races.json');
  const d = await res.json();

  // Build subrace map
  const subraceMap = new Map<string, Subrace[]>();
  for (const sr of (d.subrace || []) as RawSubrace[]) {
    if (!sr.raceName || !sr.name) continue;
    const text = extractText(sr.entries).slice(0, 500);
    if (!subraceMap.has(sr.raceName)) subraceMap.set(sr.raceName, []);
    subraceMap.get(sr.raceName)!.push({ name: sr.name, text, ability: sr.ability });
  }

  // Dedupe by name
  for (const [rn, arr] of subraceMap) {
    const seen = new Set<string>();
    subraceMap.set(rn, arr.filter(sr => {
      if (seen.has(sr.name)) return false;
      seen.add(sr.name);
      return true;
    }));
  }

  // Process races
  const seen = new Map<string, Race>();
  const sorted = (d.race || []).sort((a: RawRace, b: RawRace) => {
    const ai = PREF_SOURCES.indexOf(a.source);
    const bi = PREF_SOURCES.indexOf(b.source);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const r of sorted as RawRace[]) {
    if (seen.has(r.name)) continue;
    if (EXCLUDED_SOURCES.includes(r.source)) continue;

    const feats: { name: string; text: string }[] = [];
    for (const e of (r.entries || [])) {
      if (typeof e === 'string') {
        feats.push({ name: "", text: e.slice(0, 500) });
      } else if (e.name) {
        const text = extractText(e.entries).slice(0, 500);
        feats.push({ name: e.name, text });
      }
    }

    const subraces = subraceMap.get(r.name) || [];
    const ability: any = {};
    if (Array.isArray(r.ability)) {
      for (const a of r.ability) Object.assign(ability, a);
    } else if (r.ability) {
      Object.assign(ability, r.ability);
    }

    seen.set(r.name, {
      key: r.name.toLowerCase().replace(/[^a-z]/g, "-"),
      name: r.name,
      source: r.source,
      size: r.size?.[0] || "M",
      speed: r.speed?.walk || 30,
      ability,
      feats,
      subraces,
    });
  }

  return Array.from(seen.values());
}

const EXCLUDED_CLASSES = ["mystic", "sidekick"];

export async function loadClasses(): Promise<DndClass[]> {
  // Load class index
  const indexRes = await fetch('https://character-sheets.pages.dev/data/class/index.json');
  const idx = await indexRes.json();

  const classes: DndClass[] = [];
  for (const [key, file] of Object.entries(idx) as [string, string][]) {
    if (EXCLUDED_CLASSES.includes(key)) continue;

    const res = await fetch(`https://character-sheets.pages.dev/data/class/${file}`);
    const d: RawClass = await res.json();
    const c = d.class?.[0];
    if (!c) continue;

    const feats = (d.classFeature || []).map(f => ({
      name: f.name,
      text: extractText(f.entries).slice(0, 600),
    }));

    // Dedupe subclasses
    const subMap = new Map<string, { name: string; text: string; source?: string }>();
    for (const s of (d.subclass || [])) {
      if (subMap.has(s.name)) continue;
      const text = `[${s.source || s.classSource || ""}] ${s.className || ""} subclass`.trim();
      subMap.set(s.name, { name: s.name, text, source: s.source });
    }

    classes.push({
      key,
      name: c.name,
      hitDie: c.hd.faces,
      saves: c.proficiency,
      spell: c.spellcastingAbility || null,
      feats,
      subs: Array.from(subMap.values()),
    });
  }

  return classes;
}
