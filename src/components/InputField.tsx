/**
 * Author: Leonardo Rodriguez
 *
 * Description:
 * InputField component — editorial style with 1px borders, warm neutrals.
 */

import { useState } from "react";
import type { InputTypes } from "@type/input";
import { InputPatterns } from "@type/input";

interface InputFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  name: string;
  helperText?: string;
  error?: string;
  type?: InputTypes;
}

export default function InputField({
  label,
  name,
  placeholder = "",
  value,
  required = false,
  error = "",
  helperText = "",
  disabled = false,
  type = "text",
  pattern,
  className = "",
  onChange,
  ...props
}: InputFieldProps) {
  const [internalValue, setInternalValue] = useState(value ?? "");
  const finalPattern = pattern ?? InputPatterns[type];
  const isControlled = value !== undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(e.target.value);
    onChange?.(e);
  };

  const inputClasses = [
    "block w-full px-3 py-2.5 border rounded-[var(--radius-md)] text-sm",
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
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={isControlled ? value : internalValue}
        className={inputClasses}
        required={required}
        disabled={disabled}
        pattern={finalPattern}
        onChange={handleChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
        {...props}
      />
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
