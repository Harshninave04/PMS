"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface MedicineSuggestion {
  _id: string;
  name: string;
  strength?: string;
  dosageForm?: string;
  stockStatus: "In stock" | "Low" | "Out";
}

interface MedicineAutocompleteProps {
  value: string;
  isCatalogueMedicine: boolean | null;
  onChange: (value: string, isCatalogueMedicine: boolean | null) => void;
  placeholder?: string;
  ariaLabel: string;
  id?: string;
  required?: boolean;
  className?: string;
}

export function MedicineAutocomplete({
  value,
  isCatalogueMedicine,
  onChange,
  placeholder = "Search medicine catalogue",
  ariaLabel,
  id,
  required,
  className,
}: MedicineAutocompleteProps) {
  const [suggestions, setSuggestions] = React.useState<MedicineSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const query = value.trim();
    setSuggestions([]);
    setActiveIndex(-1);
    setError("");
    if (!query) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/pharmacy/medicines/search?q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json() as { success?: boolean; data?: MedicineSuggestion[]; message?: string };
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to search the medicine catalogue.");
        }
        setSuggestions(result.data ?? []);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to search the medicine catalogue.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const query = value.trim();
  const showUseAsTyped = Boolean(query) && isCatalogueMedicine !== false;
  const showList = open && (suggestions.length > 0 || showUseAsTyped || Boolean(error));
  const useAsTypedIndex = suggestions.length;

  const chooseSuggestion = (suggestion: MedicineSuggestion) => {
    onChange(suggestion.name, true);
    setOpen(false);
    setActiveIndex(-1);
  };

  const useTypedValue = () => {
    if (!query) return;
    onChange(query, false);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && showList) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length + (showUseAsTyped ? 0 : -1)));
    } else if (event.key === "ArrowUp" && showList) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && showList && activeIndex >= 0) {
      event.preventDefault();
      if (activeIndex === useAsTypedIndex && showUseAsTyped) useTypedValue();
      else if (suggestions[activeIndex]) chooseSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative min-w-0 ${className ?? ""}`}>
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
          onChange(event.target.value, null);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {loading && <Loader2 aria-hidden="true" className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />}
      {showList && (
        <div
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {error && <p role="status" className="px-3 py-2 text-xs text-rose-600">{error}</p>}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion._id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseSuggestion(suggestion)}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left ${
                index === activeIndex
                  ? "bg-emerald-50 dark:bg-emerald-950/40"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{suggestion.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {[
                    suggestion.strength || "Strength not listed",
                    suggestion.dosageForm?.replace(/_/g, " ").toLocaleLowerCase() || "Form not listed",
                  ].join(" · ")}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-medium ${
                suggestion.stockStatus === "In stock"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : suggestion.stockStatus === "Low"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-rose-700 dark:text-rose-300"
              }`}>
                {suggestion.stockStatus}
              </span>
            </button>
          ))}
          {showUseAsTyped && (
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === useAsTypedIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(useAsTypedIndex)}
              onClick={useTypedValue}
              className={`w-full rounded-md border-t border-slate-100 px-3 py-2 text-left text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200 ${
                activeIndex === useAsTypedIndex ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-amber-50 dark:hover:bg-amber-950/30"
              }`}
            >
              Use as typed — not in catalogue
            </button>
          )}
        </div>
      )}
      {value.trim() && isCatalogueMedicine === false && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Not in catalogue</p>
      )}
    </div>
  );
}
