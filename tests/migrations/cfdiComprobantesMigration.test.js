import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve("database/migrations");
const UP = path.join(MIGRATIONS_DIR, "20260409000000_create_cfdi_comprobantes.up.sql");
const DOWN = path.join(MIGRATIONS_DIR, "20260409000000_create_cfdi_comprobantes.down.sql");

function readSql(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("[M1-001] CFDI migration SQL", () => {
  test("up migration creates cfdi_comprobantes with required fields/constraints", () => {
    const sql = readSql(UP);

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS cfdi_comprobantes/i);
    expect(sql).toMatch(/\buuid\s+UUID\s+NOT NULL/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*uuid\s*\)/i);

    expect(sql).toMatch(/\brfc_emisor\s+VARCHAR\(13\)\s+NOT NULL/i);
    expect(sql).toMatch(/\brfc_receptor\s+VARCHAR\(13\)\s+NOT NULL/i);
    expect(sql).toMatch(/\bfecha_emision\s+TIMESTAMPTZ\s+NOT NULL/i);
    expect(sql).toMatch(/\bmonto_total\s+NUMERIC\(18,\s*2\)\s+NOT NULL/i);
    expect(sql).toMatch(/\bimpuestos\s+JSONB\s+NOT NULL/i);
    expect(sql).toMatch(/\btipo_cambio\s+NUMERIC\(18,\s*6\)/i);

    expect(sql).toMatch(/\bviaje_id\s+BIGINT\s+NOT NULL/i);
    expect(sql).toMatch(/\borg_id\s+BIGINT\s+NOT NULL/i);
    expect(sql).toMatch(/\bcreated_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+NOW\(\)/i);
    expect(sql).toMatch(/\bupdated_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+NOW\(\)/i);

    expect(sql).toMatch(/FOREIGN KEY\s*\(\s*viaje_id\s*\)\s+REFERENCES\s+viajes\s*\(\s*id\s*\)/i);
    expect(sql).toMatch(/FOREIGN KEY\s*\(\s*org_id\s*\)\s+REFERENCES\s+organizaciones\s*\(\s*id\s*\)/i);
  });

  test("down migration drops the created tables", () => {
    const sql = readSql(DOWN);
    expect(sql).toMatch(/DROP TABLE IF EXISTS cfdi_comprobantes/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS viajes/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS organizaciones/i);
  });
});

