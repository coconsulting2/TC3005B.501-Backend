/**
 * Author: Eduardo Porto Morales
 * Updated: Editorial Finance design system
 *
 * Pagination — clean, minimal with editorial accent colors.
 */

import { useState, useEffect } from "react";

interface PaginationProps {
  totalPages: number;
  page: number;
  setPage: (page: number) => void;
  maxVisible?: number;
}

export default function Pagination({
  totalPages,
  page,
  setPage,
  maxVisible = 5,
}: PaginationProps) {
  const [blockStart, setBlockStart] = useState(1);

  useEffect(() => {
    const newBlockStart = Math.floor((page - 1) / maxVisible) * maxVisible + 1;
    if (newBlockStart !== blockStart) setBlockStart(newBlockStart);
  }, [page, blockStart, maxVisible]);

  const handlePrevBlock = () => {
    const newStart = blockStart - maxVisible;
    if (newStart >= 1) { setBlockStart(newStart); setPage(newStart); }
  };

  const handleNextBlock = () => {
    const newStart = blockStart + maxVisible;
    if (newStart <= totalPages) { setBlockStart(newStart); setPage(newStart); }
  };

  const pageNumbers = Array.from({ length: maxVisible }, (_, i) => blockStart + i)
    .filter((n) => n <= totalPages);

  return (
    <div className="flex justify-center items-center gap-1.5 mt-6">
      <button
        onClick={handlePrevBlock}
        disabled={blockStart === 1}
        className="cursor-pointer"
        style={{
          padding: "0.375rem 0.625rem",
          fontSize: "0.8125rem",
          border: "1px solid var(--color-neutral-300, #D4D3CE)",
          borderRadius: "var(--radius-md, 6px)",
          color: "var(--color-ink-secondary, #4A4A48)",
          backgroundColor: "transparent",
          opacity: blockStart === 1 ? 0.4 : 1,
          transition: "all 0.15s",
        }}
      >
        &laquo;
      </button>

      {pageNumbers.map((n) => (
        <button
          key={n}
          onClick={() => setPage(n)}
          className="cursor-pointer tabular-nums"
          style={{
            padding: "0.375rem 0.75rem",
            fontSize: "0.8125rem",
            fontWeight: page === n ? 600 : 400,
            border: "1px solid",
            borderColor: page === n ? "var(--color-primary-500, #3D4A2A)" : "var(--color-neutral-300, #D4D3CE)",
            borderRadius: "var(--radius-md, 6px)",
            color: page === n ? "white" : "var(--color-ink-secondary, #4A4A48)",
            backgroundColor: page === n ? "var(--color-primary-500, #3D4A2A)" : "transparent",
            transition: "all 0.15s",
            minWidth: "2.25rem",
          }}
        >
          {n}
        </button>
      ))}

      <button
        onClick={handleNextBlock}
        disabled={blockStart + maxVisible > totalPages}
        className="cursor-pointer"
        style={{
          padding: "0.375rem 0.625rem",
          fontSize: "0.8125rem",
          border: "1px solid var(--color-neutral-300, #D4D3CE)",
          borderRadius: "var(--radius-md, 6px)",
          color: "var(--color-ink-secondary, #4A4A48)",
          backgroundColor: "transparent",
          opacity: blockStart + maxVisible > totalPages ? 0.4 : 1,
          transition: "all 0.15s",
        }}
      >
        &raquo;
      </button>
    </div>
  );
}
