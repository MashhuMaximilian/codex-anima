// localStorage utilities for character persistence
import { Character } from './types';

const STORAGE_KEY = 'CHARACTERS';

export function getAllCharacters(): Character[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getCharacter(id: string): Character | null {
  return getAllCharacters().find(c => c.id === id) || null;
}

export function saveCharacter(char: Character): void {
  const all = getAllCharacters();
  const idx = all.findIndex(c => c.id === char.id);
  char.updatedAt = new Date().toISOString();
  if (idx >= 0) {
    all[idx] = char;
  } else {
    if (!char.createdAt) char.createdAt = char.updatedAt;
    all.push(char);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteCharacter(id: string): void {
  const all = getAllCharacters().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function importCharacter(json: any): Character {
  if (!json.id) json.id = crypto.randomUUID();
  if (!json.createdAt) json.createdAt = new Date().toISOString();
  json.updatedAt = new Date().toISOString();
  saveCharacter(json);
  return json;
}

export function exportCharacter(char: Character): string {
  return JSON.stringify(char, null, 2);
}
