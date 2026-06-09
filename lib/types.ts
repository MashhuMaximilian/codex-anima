// D&D 5e character data types

export interface AbilityScore {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

export interface Subrace {
  name: string;
  text: string;
  ability?: any;
}

export interface Race {
  key: string;
  name: string;
  source: string;
  size: string;
  speed: number;
  ability: AbilityScore;
  feats: { name: string; text: string }[];
  subraces: Subrace[];
}

export interface Subclass {
  name: string;
  text: string;
  source?: string;
}

export interface ClassFeature {
  name: string;
  text: string;
  level?: number;
}

export interface DndClass {
  key: string;
  name: string;
  hitDie: number;
  saves: string[];
  spell: string | null;
  feats: ClassFeature[];
  subs: Subclass[];
}

export interface Character {
  id: string;
  name: string;
  title?: string;
  pronouns?: string;
  level: number;
  race: string;
  raceKey?: string;
  klass: string;
  class?: string;
  subclass?: string;
  subrace?: string;
  abilities: AbilityScore;
  // Extended fields
  background?: string;
  alignment?: string;
  ac?: number;
  hp?: { current: number; max: number; temp: number };
  speed?: number;
  initiative?: number;
  // Resources
  resources?: Record<string, { current: number; max: number; recharge?: string }>;
  // Skills
  skills?: Record<string, { prof: boolean; exp: boolean; bonus: number }>;
  // Spells
  spells?: { cantrips: string[]; known: string[]; prepared: string[]; slots: Record<number, number> };
  // Equipment
  equipment?: string[];
  gold?: number;
  // Notes
  notes?: string;
  features?: { name: string; text: string; source?: string }[];
  createdAt: string;
  updatedAt: string;
}

export const SOURCE_NAMES: Record<string, string> = {
  "XPHB": "Player's Handbook (2024)",
  "PHB": "Player's Handbook",
  "TCE": "Tasha's Cauldron of Everything",
  "MPMM": "Mordenkainen's Presents",
  "VGM": "Volo's Guide to Monsters",
  "MTF": "Mordenkainen's Tome of Foes",
  "DMG": "Dungeon Master's Guide",
  "ERLW": "Eberron: Rising from the Last War",
  "SCAG": "Sword Coast Adventurer's Guide",
  "GGTR": "Guildmasters' Guide to Ravnica",
  "SCC": "Strixhaven: Curriculum of Chaos",
  "FTD": "Fizban's Treasury of Dragons",
  "GGR": "Guildmasters' Guide to Ravnica",
  "AI": "Acquisitions Incorporated",
  "LR": "Lost Reefs of the Neverwinter Deep",
  "LLK": "Locathah Ledger",
  "MOT": "Mythic Odysseys of Theros",
  "PSX": "Plane Shift: Ixalan",
  "PSK": "Plane Shift: Kaldheim",
  "PSI": "Plane Shift: Innistrad",
  "PSZ": "Plane Shift: Zendikar",
  "VRGR": "Van Richtener's Guide to Ravenloft",
  "ABH": "Arcane: Archive of Fey",
  "DSotDQ": "Dragonlance: Shadow of the Dragon Queen",
  "LFL": "Little Red Sand",
  "OGA": "Old Greyhawk Archives",
  "EFA": "Epic Archetypes",
};

export const PREF_SOURCES = ["XPHB", "PHB", "TCE", "MPMM", "VGM"];
