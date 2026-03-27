import {
  PROGRESS_BAR_COLORS,
  PROGRESS_BAR_TRACK,
  PROGRESS_BAR_SIZES,
} from "@config/progressBar";
import type { ProgressBarColor, ProgressBarSize } from "@config/progressBar";

interface Props {
  value: number;
  max?: number;
  color?: ProgressBarColor;
  size?: ProgressBarSize;
  showLabel?: boolean;
  animated?: boolean;
}

export default function ProgressBar({
  value,
  max = 100,
  color = "primary",
  size = "medium",
  showLabel = false,
  animated = true,
}: Props) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percentage = Math.round((clamped / max) * 100);

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs font-medium text-[var(--color-neutral-500)]">
            Progreso
          </span>
          <span className="text-xs font-medium text-[var(--color-neutral-500)]">
            {percentage}%
          </span>
        </div>
      )}

      <div
        className={`w-full rounded-full overflow-hidden ${PROGRESS_BAR_TRACK} ${PROGRESS_BAR_SIZES[size]}`}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`${PROGRESS_BAR_COLORS[color]} ${PROGRESS_BAR_SIZES[size]} rounded-full ${animated ? "transition-all duration-300 ease-in-out" : ""}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
