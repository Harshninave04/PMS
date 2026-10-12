"use client";

import React from "react";
import { Input } from "@/components/ui/input";

interface ComboFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Static suggestions, filtered locally as the doctor types. */
  suggestions?: readonly string[];
  /** Async suggestions (debounced). Use instead of `suggestions` for large lists. */
  fetchSuggestions?: (query: string) => Promise<string[]>;
  minChars?: number;
  required?: boolean;
  className?: string;
  id?: string;
}

/**
 * Type anything, or pick a suggestion. No separate "Other" step needed.
 */
export function ComboField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  suggestions,
  fetchSuggestions,
  minChars = 2,
  required,
  className,
  id,
}: ComboFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [remote, setRemote] = React.useState<string[]>([]);
  const [active, setActive] = React.useState(-1);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const requestRef = React.useRef(0);
  const query = value.trim();

  const items = React.useMemo(() => {
    if (fetchSuggestions) return remote;
    const lower = query.toLowerCase();
    const list = suggestions ?? [];
    const filtered = lower ? list.filter((option) => option.toLowerCase().includes(lower)) : [...list];
    return filtered.filter((option) => option.toLowerCase() !== lower);
  }, [fetchSuggestions, remote, suggestions, query]);

  React.useEffect(() => {
    if (!fetchSuggestions) return;
    if (query.length < minChars) {
      setRemote([]);
      return;
    }
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchSuggestions(query);
        if (requestId === requestRef.current) setRemote(result);
      } catch {
        if (requestId === requestRef.current) setRemote([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, fetchSuggestions, minChars]);

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (item: string) => {
    onChange(item);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && active >= 0 && items[active]) {
      event.preventDefault();
      select(items[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const showList = open && items.length > 0;

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        required={required}
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map((item, index) => (
            <li
              key={item}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                select(item);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 ${
                index === active
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}