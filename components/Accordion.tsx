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
    <div className={`accordion ${open ? 'open' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="accordion-header"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="label">{title}</span>
          {summary && <span className="value truncate">{summary}</span>}
        </span>
        <span className="arrow" aria-hidden="true">▾</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}
