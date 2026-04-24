import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

const UP = path.resolve("database/migrations/20260421000000_workflow_rules.up.sql");
const DOWN = path.resolve("database/migrations/20260421000000_workflow_rules.down.sql");

function readSql(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("[M2-004] workflow_rules migration SQL", () => {
  test("up migration defines workflow_rules and Request/User columns", () => {
    const sql = readSql(UP);

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS workflow_rules/i);
    expect(sql).toMatch(/\brule_type\s+VARCHAR\(10\)/i);
    expect(sql).toMatch(/\bparam_type\s+VARCHAR\(20\)/i);
    expect(sql).toMatch(/\bskip_if_below/i);
    expect(sql).toMatch(/workflow_pre_snapshot\s+JSONB/i);
    expect(sql).toMatch(/workflow_post_snapshot\s+JSONB/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS org_id BIGINT REFERENCES organizaciones/i);
  });

  test("down migration drops workflow artifacts", () => {
    const sql = readSql(DOWN);
    expect(sql).toMatch(/DROP TABLE IF EXISTS workflow_rules/i);
    expect(sql).toMatch(/workflow_post_snapshot/i);
    expect(sql).toMatch(/workflow_pre_snapshot/i);
    expect(sql).toMatch(/org_id/i);
  });
});
