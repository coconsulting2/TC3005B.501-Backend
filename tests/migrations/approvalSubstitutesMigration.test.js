import { describe, expect, test } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

const UP = path.resolve(
  "database/migrations/20260429190000_approval_substitutes.up.sql",
);
const DOWN = path.resolve(
  "database/migrations/20260429190000_approval_substitutes.down.sql",
);

function readSql(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("[M2-006] approval_substitutes migration SQL", () => {
  test("up migration defines approval_substitutes structure", () => {
    const sql = readSql(UP);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS approval_substitutes/i);
    expect(sql).toMatch(/\bapprover_id INT NOT NULL/i);
    expect(sql).toMatch(/\bsubstitute_id INT NOT NULL/i);
    expect(sql).toMatch(/\bvalid_from TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/\bvalid_to TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/CHECK \(valid_to > valid_from\)/i);
  });

  test("down migration drops approval_substitutes table", () => {
    const sql = readSql(DOWN);
    expect(sql).toMatch(/DROP TABLE IF EXISTS approval_substitutes/i);
  });
});
