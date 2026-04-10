/**
 * Author: Diego Ortega Fernandez
 * Updated: Editorial Finance design system
 *
 * Table row — 1px separators, hover state, editorial action button.
 */

import type { TableColumn } from "@components/Table/DataTable";

interface Props {
  row: Record<string, string | number | boolean>;
  columns: TableColumn[];
  index: number;
  roleHref: string;
}

export default function TableRow({ row, columns, index, roleHref }: Props) {
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--color-neutral-200, #E8E7E2)",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-secondary, #F3F2EE)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          style={{
            padding: col.key === "action" ? "0.75rem 1.5rem" : "0.75rem 1.5rem",
            textAlign: col.key === "action" ? "center" : "left",
            fontSize: "0.875rem",
            color: "var(--color-ink-secondary, #4A4A48)",
          }}
        >
          {col.key === "action" ? (
            <a href={`/${roleHref}/${row.request_id}`}>
              <button
                className="cursor-pointer"
                style={{
                  padding: "0.375rem 1rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "white",
                  backgroundColor: "var(--color-primary-500, #3D4A2A)",
                  border: "none",
                  borderRadius: "var(--radius-md, 6px)",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-primary-400, #4D6138)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-primary-500, #3D4A2A)")}
              >
                Ver más
              </button>
            </a>
          ) : (
            <span className="tabular-nums">{String(row[col.key] ?? "")}</span>
          )}
        </td>
      ))}
    </tr>
  );
}
