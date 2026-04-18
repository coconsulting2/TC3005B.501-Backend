/**
 * Author: Gabriel Munoz Luna
 *
 * Description:
 * React Button component for interactive Astro islands.
 * Uses the shared design token system from button.ts.
 * Supports multiple variants, sizes, colors, and disabled state.
 *
 * @param variant - 'filled' | 'border' | 'empty' (default: 'filled')
 * @param size - 'small' | 'medium' | 'big' | 'custom' (default: 'medium')
 * @param color - 'primary' | 'secondary' | 'success' | 'warning' (default: 'primary')
 * @param customSizeClass - Custom Tailwind size classes when size is 'custom'
 * @param disabled - Whether the button is disabled
 * @returns React Button element
 */

import type { ButtonVariant, ButtonColor, ButtonSize } from "@type/button";
import { getButtonClasses } from "@type/button";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  customSizeClass?: string;
}

export default function Button({
  children,
  variant = "filled",
  size = "medium",
  color = "primary",
  customSizeClass = "",
  className = "",
  disabled = false,
  ...props
}: ButtonProps) {
  const classList = getButtonClasses({
    variant,
    disabled,
    size,
    color,
    customSizeClass,
    extraClass: className,
  });

  return (
    <button {...props} disabled={disabled} className={classList}>
      {children}
    </button>
  );
}
