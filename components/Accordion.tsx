'use client';

import { useState, ReactNode } from 'react';

interface AccordionProps {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Accordion({ title, summary, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-left"
      >
        <span className="flex-1 min-w-0">
          <strong className="text-zinc-100">{title}</strong>
          {summary && <span className="ml-2 text-zinc-500 text-sm truncate">{summary}</span>}
        </span>
        <span className="text-xs text-zinc-500 ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-3 bg-zinc-900 max-h-80 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}
