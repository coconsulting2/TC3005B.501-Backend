/**
 * Author: Diego Ortega Fernandez
 * Updated: Editorial Finance design system
 *
 * Table header — eyebrow-style column labels with sort indicators.
 */

import type { TableColumn } from "@components/Table/DataTable";

type SortDirection = "asc" | "desc" | null;

interface Props {
  columns: TableColumn[];
  sortColumn: string;
  sortDirection: SortDirection;
  onSort: (columnKey: string) => void;
}

function getSortIndicator(
  columnKey: string,
  sortColumn: string,
  sortDirection: SortDirection
): string {
  if (columnKey !== sortColumn || !sortDirection) return "";
  return sortDirection === "asc" ? " ↑" : " ↓";
}

export default function TableHeader({ columns, sortColumn, sortDirection, onSort }: Props) {
  return (
    <thead>
      <tr style={{ borderBottom: "1px solid var(--color-neutral-200, #E8E7E2)" }}>
        {columns.map((col) => {
          const isSortable = col.sortable !== false && col.key !== "action";
          const isActive = col.key === sortColumn && sortDirection !== null;

          return (
            <th
              key={col.key}
              className="eyebrow"
              style={{
                padding: "0.75rem 1.5rem",
                textAlign: col.key === "action" ? "center" : "left",
                cursor: isSortable ? "pointer" : "default",
              }}
              onClick={isSortable ? () => onSort(col.key) : undefined}
              aria-sort={
                isActive
                  ? sortDirection === "asc" ? "ascending" : "descending"
                  : undefined
              }
            >
              <span className="inline-flex items-center gap-1">
                {col.label}
                {isSortable && (
                  <span style={{ color: isActive ? "var(--color-primary-500, #3D4A2A)" : "var(--color-ink-subtle, #B0AFA8)" }}>
                    {getSortIndicator(col.key, sortColumn, sortDirection)}
                  </span>
                )}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
