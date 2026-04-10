/**
 * Author: Leonardo Rodriguez
 *
 * Description:
 * TextArea component — editorial style with 1px borders, warm neutrals.
 */

import { useState } from "react";

interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> {
  label?: string;
  name: string;
  helperText?: string;
  error?: string;
  showCount?: boolean;
}

export default function TextArea({
  label,
  name,
  placeholder = "",
  value,
  required = false,
  error = "",
  helperText = "",
  disabled = false,
  maxLength,
  showCount = false,
  rows = 4,
  className = "",
  onChange,
  ...props
}: TextAreaProps) {
  const [internalValue, setInternalValue] = useState(
    typeof value === "string" ? value : ""
  );
  const isControlled = value !== undefined;
  const currentValue = isControlled ? String(value) : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isControlled) setInternalValue(e.target.value);
    onChange?.(e);
  };

  const textareaClasses = [
    "block w-full px-3 py-2.5 border rounded-[var(--radius-md)] text-sm resize-y",
    "bg-[var(--color-surface-white)] text-[var(--color-ink)]",
    "placeholder:text-[var(--color-ink-subtle)]",
    "focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400",
    "transition-colors duration-200",
    error ? "border-accent-400" : "border-[var(--color-neutral-300)]",
    disabled ? "bg-[var(--color-neutral-100)] cursor-not-allowed opacity-60" : "",
    className,
  ].join(" ");

  return (
    <div className="mb-4 w-full">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium mb-1.5 text-[var(--color-ink-secondary)]">
          {label} {required && <span className="text-accent-400">*</span>}
        </label>
      )}
      <textarea
        id={name}
        name={name}
        placeholder={placeholder}
        value={currentValue}
        className={textareaClasses}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        onChange={handleChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
        {...props}
      />
      <div className="flex justify-between items-center mt-1">
        <div>
          {error && (
            <p id={`${name}-error`} className="pl-1 text-xs text-accent-400" role="alert">
              {error}
            </p>
          )}
          {!error && helperText && (
            <p id={`${name}-helper`} className="pl-1 text-xs text-[var(--color-ink-muted)]">
              {helperText}
            </p>
          )}
        </div>
        {showCount && maxLength && (
          <span className={`text-xs ${currentValue.length >= maxLength ? "text-accent-400" : "text-[var(--color-ink-muted)]"}`}>
            {currentValue.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}
