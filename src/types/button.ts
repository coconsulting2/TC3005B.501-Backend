/**
 * Author: Gabriel Munoz Luna
 * Updated: Editorial Finance design system
 *
 * Button configuration utilities
 **/
export const allowedVariants = ['filled', 'border', 'empty'] as const;
export const allowedColors = ['primary', 'accent', 'success', 'danger'] as const;
export const allowedSizes = ['small', 'medium', 'big', 'custom'] as const;

export type ButtonVariant = (typeof allowedVariants)[number];
export type ButtonColor = (typeof allowedColors)[number];
export type ButtonSize = (typeof allowedSizes)[number];

export interface ButtonClassesProps {
  variant: ButtonVariant;
  disabled?: boolean;
  color?: ButtonColor;
  size?: ButtonSize;
  customSizeClass?: string;
  extraClass?: string;
}

const sizeClasses = {
  small: 'px-3 py-1.5 text-xs',
  medium: 'px-4 py-2 text-sm',
  big: 'px-6 py-3 text-base',
};

const colorMap = {
  primary: {
    bg: 'bg-primary-500',
    hover: 'hover:bg-primary-400',
    active: 'active:bg-primary-300',
    baseText: 'text-white',
    text: 'text-primary-500',
    border: 'border-primary-500',
    hoverBorder: 'hover:border-primary-400',
    activeBorder: 'active:border-primary-300',
    hoverText: 'hover:text-primary-400',
    activeText: 'active:text-primary-300',
    ring: 'focus:ring-2 focus:ring-primary-200 focus:ring-offset-1',
  },
  accent: {
    bg: 'bg-accent-400',
    hover: 'hover:bg-accent-300',
    active: 'active:bg-accent-500',
    baseText: 'text-white',
    text: 'text-accent-400',
    border: 'border-accent-400',
    hoverBorder: 'hover:border-accent-300',
    activeBorder: 'active:border-accent-500',
    hoverText: 'hover:text-accent-300',
    activeText: 'active:text-accent-500',
    ring: 'focus:ring-2 focus:ring-accent-200 focus:ring-offset-1',
  },
  success: {
    bg: 'bg-success-400',
    hover: 'hover:bg-success-300',
    active: 'active:bg-success-500',
    baseText: 'text-white',
    text: 'text-success-500',
    border: 'border-success-400',
    hoverBorder: 'hover:border-success-300',
    activeBorder: 'active:border-success-500',
    hoverText: 'hover:text-success-300',
    activeText: 'active:text-success-500',
    ring: 'focus:ring-2 focus:ring-success-200 focus:ring-offset-1',
  },
  danger: {
    bg: 'bg-error-400',
    hover: 'hover:bg-error-300',
    active: 'active:bg-error-500',
    baseText: 'text-white',
    text: 'text-error-400',
    border: 'border-error-400',
    hoverBorder: 'hover:border-error-300',
    activeBorder: 'active:border-error-500',
    hoverText: 'hover:text-error-300',
    activeText: 'active:text-error-500',
    ring: 'focus:ring-2 focus:ring-error-200 focus:ring-offset-1',
  },
};

export function getButtonClasses({
  variant,
  disabled = false,
  color = 'primary',
  size = 'medium',
  customSizeClass = '',
  extraClass = '',
}: ButtonClassesProps): string {
  const safeColor = colorMap[color] ?? colorMap.primary;
  const sizeClass = size === 'custom' ? customSizeClass : sizeClasses[size] ?? sizeClasses.medium;

  const base = `rounded-[var(--radius-md)] font-medium transition-all duration-200 cursor-pointer ${safeColor.ring}`;

  const variants = {
    filled: disabled
      ? 'bg-neutral-300 text-neutral-400 cursor-not-allowed'
      : `${safeColor.bg} ${safeColor.baseText} ${safeColor.hover} ${safeColor.active}`,

    border: disabled
      ? 'border border-neutral-300 text-neutral-400 cursor-not-allowed bg-transparent'
      : `border bg-transparent ${safeColor.text} ${safeColor.border} ${safeColor.hoverBorder} ${safeColor.hoverText} ${safeColor.activeBorder} ${safeColor.activeText}`,

    empty: disabled
      ? 'text-neutral-400 cursor-not-allowed bg-transparent'
      : `bg-transparent ${safeColor.text} ${safeColor.hoverText} ${safeColor.activeText}`,
  };

  return `${sizeClass} ${base} ${variants[variant]} ${extraClass}`.trim();
}
