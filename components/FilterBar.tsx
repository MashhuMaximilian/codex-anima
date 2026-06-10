'use client';

interface ChipOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  search: string;
  onSearchChange: (s: string) => void;
  searchPlaceholder?: string;
  // Multi-select chip filter (preferred for source filter).
  // Replaces the old <select> dropdown per Phase A design.
  chips?: {
    options: ChipOption[];
    selected: string[];                 // active values (OR filter)
    onToggle: (value: string) => void;
    onClear: () => void;
  };
  // Legacy single-select dropdown — kept for backward compat with
  // the extraFilters pattern used by Class type filter.
  extraFilters?: {
    value: string;
    label: string;
    onChange: (v: string) => void;
    selected: string;
    options: ChipOption[];
  }[];
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  chips,
  extraFilters,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="filter-bar__search"
      />

      {chips && chips.options.length > 0 && (
        <div className="source-chips" role="group" aria-label="Source filter">
          <button
            type="button"
            className={`source-chip ${chips.selected.length === 0 ? 'active' : ''}`}
            onClick={chips.onClear}
          >
            All
          </button>
          {chips.options.map((opt) => {
            const active = chips.selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={`source-chip ${active ? 'active' : ''}`}
                onClick={() => chips.onToggle(opt.value)}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {extraFilters?.map((f, i) => (
        <select
          key={i}
          value={f.selected}
          onChange={(e) => f.onChange(e.target.value)}
          className="filter-bar__select"
          aria-label={f.label}
        >
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
