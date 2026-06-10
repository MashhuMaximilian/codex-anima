"use client";

import { useState } from "react";

type Source = { code: string; name: string };

type Props = {
  sources: Source[];
  selected: string[];
  onChange: (codes: string[]) => void;
  /** If true (default), at least one source must remain selected. The last chip cannot be deselected, and the "All" toggle will not clear if it would leave zero. */
  requireAtLeastOne?: boolean;
  /** Show a leading "Source" label. */
  showLabel?: boolean;
  /** Compact mode for use inside modals. */
  compact?: boolean;
};

/**
 * Source filter with a real "All" toggle (NOT a source itself).
 *  - "+ All" appears when not all sources are selected → click selects all
 *  - "✕ All" appears when all sources are selected → click clears all (blocked if requireAtLeastOne)
 *  - Individual chips toggle that one source (last one is undeletable if requireAtLeastOne)
 *  - Search box for quick filtering through many sources (visible only when > 6 sources)
 */
export default function SourceFilter({
  sources,
  selected,
  onChange,
  requireAtLeastOne = true,
  showLabel = true,
  compact = false,
}: Props) {
  const [q, setQ] = useState("");
  const totalCount = sources.length;
  const selectedCount = selected.length;
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const showSearch = sources.length > 6;

  const filtered = q
    ? sources.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    : sources;

  const handleToggle = (code: string) => {
    if (selected.includes(code)) {
      if (requireAtLeastOne && selected.length === 1) return; // can't clear the last one
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const handleAll = () => {
    if (allSelected) {
      if (requireAtLeastOne) return; // can't clear all
      onChange([]);
    } else {
      onChange(sources.map((s) => s.code));
    }
  };

  return (
    <div className={`source-filter ${compact ? "source-filter--compact" : ""}`}>
      <div className="source-filter__row">
        {showLabel && <span className="source-filter__label">Source</span>}
        <div className="source-filter__chips" role="group" aria-label="Source filter">
          <button
            type="button"
            className={`source-chip source-chip--toggle ${allSelected ? "source-chip--toggle-on" : ""}`}
            onClick={handleAll}
            disabled={requireAtLeastOne && allSelected}
            title={allSelected ? "Deselect all sources" : "Select all sources"}
            aria-pressed={allSelected}
          >
            {allSelected ? "✕ All" : "+ All"}
          </button>
          {showSearch && (
            <input
              className="source-filter__search"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filter…"
              aria-label="Filter sources"
            />
          )}
          {filtered.map((s) => {
            const on = selected.includes(s.code);
            return (
              <button
                key={s.code}
                type="button"
                className={`source-chip ${on ? "source-chip--active" : ""}`}
                onClick={() => handleToggle(s.code)}
                aria-pressed={on}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        <span className="source-filter__count" aria-live="polite">
          {selectedCount}/{totalCount}
        </span>
      </div>
    </div>
  );
}
