"use client";

type Filter = {
  value: string;
  label: string;
  onChange: (v: string) => void;
  selected: string;
  options: { value: string; label: string }[];
};

type Props = {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  extraFilters?: Filter[];
};

/**
 * FilterBar — search input + optional select dropdowns.
 * For multi-select source chips, use the SourceFilter component instead.
 */
export function FilterBar({ search, onSearchChange, searchPlaceholder, extraFilters }: Props) {
  const hasSearch = onSearchChange !== undefined;
  return (
    <div className="filter-bar">
      {hasSearch && (
        <input
          className="filter-bar__search"
          type="text"
          value={search || ''}
          onChange={(e) => onSearchChange!(e.target.value)}
          placeholder={searchPlaceholder || 'Search…'}
        />
      )}
      {extraFilters?.map((f, i) => (
        <select
          key={i}
          className="filter-bar__select"
          value={f.selected}
          onChange={(e) => f.onChange(e.target.value)}
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

export default FilterBar;
