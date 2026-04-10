/**
 * Author: Leonardo Rodriguez
 *
 * Description:
 * Editorial status badge / pill component.
 * Thin, uppercase, with letter-spacing — never saturated backgrounds.
 *
 * @param variant - Color variant (primary, accent, success, warning, neutral)
 * @param size - Badge size (small, medium, large)
 * @returns React Badge element
 */

type BadgeVariant = "primary" | "accent" | "success" | "warning" | "neutral";
type BadgeSize = "small" | "medium" | "large";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: "bg-primary-50 text-primary-500 border-primary-200",
  accent: "bg-accent-50 text-accent-400 border-accent-100",
  success: "bg-success-50 text-success-500 border-success-100",
  warning: "bg-warning-50 text-warning-500 border-warning-100",
  neutral: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

const sizeClasses: Record<BadgeSize, string> = {
  small: "px-2 py-0.5 text-[0.625rem]",
  medium: "px-2.5 py-0.5 text-[0.6875rem]",
  large: "px-3 py-1 text-xs",
};

export default function Badge({
  children,
  variant = "neutral",
  size = "medium",
  className = "",
}: BadgeProps) {
  const classes = [
    "status-pill inline-flex items-center font-semibold border tracking-wide uppercase",
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].join(" ");

  return <span className={classes}>{children}</span>;
}
