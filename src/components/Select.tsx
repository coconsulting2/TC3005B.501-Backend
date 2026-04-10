/**
 * Author: Leonardo Rodriguez
 *
 * Description:
 * Select component — editorial style with 1px borders, warm neutrals,
 * search/filter, keyboard navigation.
 */

import { useState, useRef, useEffect, useCallback } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  name: string;
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  searchable?: boolean;
  onChange?: (value: string) => void;
}

export default function Select({
  label,
  name,
  options,
  value = "",
  placeholder = "Seleccionar...",
  required = false,
  error = "",
  helperText = "",
  disabled = false,
  searchable = false,
  onChange,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = searchable && search
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleSelect = useCallback((optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
    setSearch("");
    setHighlightIndex(-1);
  }, [onChange]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    setSearch("");
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        else if (highlightIndex >= 0 && highlightIndex < filteredOptions.length)
          handleSelect(filteredOptions[highlightIndex].value);
        break;
      case "Escape":
        setIsOpen(false);
        setSearch("");
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        else setHighlightIndex((prev) => prev < filteredOptions.length - 1 ? prev + 1 : 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => prev > 0 ? prev - 1 : filteredOptions.length - 1);
        break;
    }
  };

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) searchInputRef.current.focus();
  }, [isOpen, searchable]);

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("li");
      items[highlightIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const triggerClasses = [
    "flex items-center justify-between w-full px-3 py-2.5 border rounded-[var(--radius-md)] text-sm",
    "bg-[var(--color-surface-white)] text-[var(--color-ink)]",
    "focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400",
    "transition-colors duration-200",
    error ? "border-accent-400" : "border-[var(--color-neutral-300)]",
    disabled ? "bg-[var(--color-neutral-100)] cursor-not-allowed opacity-60" : "cursor-pointer",
  ].join(" ");

  return (
    <div className="mb-4 w-full relative" ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label htmlFor={name} className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]">
          {label} {required && <span className="text-accent-400">*</span>}
        </label>
      )}

      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        id={name}
        className={triggerClasses}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
      >
        <span className={selectedOption ? "text-[var(--color-ink)]" : "text-[var(--color-ink-subtle)]"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-[var(--color-ink-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-40 w-full mt-1 bg-[var(--color-surface-white)] border border-[var(--color-neutral-200)] rounded-[var(--radius-md)] max-h-60 overflow-hidden shadow-[var(--shadow-md)]">
          {searchable && (
            <div className="p-2 border-b border-[var(--color-neutral-200)]">
              <input
                ref={searchInputRef}
                type="text"
                className="w-full px-2 py-1.5 text-sm border border-[var(--color-neutral-300)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-primary-200"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightIndex(-1);
                }}
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[var(--color-ink-muted)]">Sin resultados</li>
            ) : (
              filteredOptions.map((opt, idx) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  className={[
                    "px-3 py-2 text-sm cursor-pointer transition-colors",
                    opt.value === value ? "bg-primary-50 text-primary-500 font-medium" : "",
                    idx === highlightIndex ? "bg-[var(--color-surface-secondary)]" : "",
                    opt.value !== value && idx !== highlightIndex ? "hover:bg-[var(--color-surface-secondary)]" : "",
                  ].join(" ")}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {error && (
        <p id={`${name}-error`} className="pl-1 text-xs text-accent-400 mt-1" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${name}-helper`} className="pl-1 text-xs text-[var(--color-ink-muted)] mt-1">
          {helperText}
        </p>
      )}
    </div>
  );
}
