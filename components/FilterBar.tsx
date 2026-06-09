'use client';

import { useState, useEffect } from 'react';

interface FilterBarProps {
  search: string;
  onSearchChange: (s: string) => void;
  sourceFilter?: string;
  onSourceChange?: (s: string) => void;
  sourceOptions?: { value: string; label: string }[];
  extraFilters?: { value: string; label: string; onChange: (v: string) => void; selected: string; options: { value: string; label: string }[] }[];
}

export function FilterBar({ search, onSearchChange, sourceFilter, onSourceChange, sourceOptions, extraFilters }: FilterBarProps) {
  return (
    <div className="flex gap-2 mb-3">
      <input
        type="text"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search..."
        className="flex-1 min-w-0 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm focus:outline-none focus:border-amber-500"
      />
      {onSourceChange && sourceOptions && (
        <select
          value={sourceFilter || ''}
          onChange={e => onSourceChange(e.target.value)}
          className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm min-w-[120px]"
        >
          {sourceOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      {extraFilters?.map((f, i) => (
        <select
          key={i}
          value={f.selected}
          onChange={e => f.onChange(e.target.value)}
          className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 text-sm min-w-[100px]"
        >
          {f.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}
