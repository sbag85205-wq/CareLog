/**
 * 원격 검증 SQL(supabase/verify/*.sql)을 PGlite에서 미리 실행해 보는 테스트
 * — 원격에서 처음 실행할 때 스크립트 자체의 오류로 혼란이 생기지 않도록
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./support/db";

const VERIFY_DIR = path.resolve(__dirname, "../verify");
const read = (f: string) => readFileSync(path.join(VERIFY_DIR, f), "utf8");
type Check = { check_name: string; ok: boolean; detail: string };

describe("00 사전 점검 (읽기 전용)", () => {
  it("migration 적용 전 새 DB에서는 모든 항목 통과", async () => {
    const db = await createTestDb({ migrations: false });
    const rows = (await db.query<Check>(read("00_preflight_readonly.sql"))).rows;
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });

  it("이미 적용된 DB에서는 충돌을 감지 (중복 적용 방지)", async () => {
    const db = await createTestDb();
    const failed = (await db.query<Check>(read("00_preflight_readonly.sql"))).rows.filter((r) => !r.ok).map((r) => r.check_name);
    expect(failed).toEqual(
      expect.arrayContaining(["no_existing_carelog_tables", "no_existing_carelog_types", "no_existing_private_schema", "no_trigger_name_conflict_on_auth_users"]),
    );
  });

  it("단일 SELECT 문 (읽기 전용 실행 방식과 무관하게 동작)", () => {
    const sql = read("00_preflight_readonly.sql").replace(/--.*$/gm, "");
    expect(sql.trim().replace(/;\s*$/, "")).not.toContain(";");
    expect(sql.trim()).toMatch(/^(select|with)\b/i);
  });
});

describe("10 적용 후 카탈로그 점검 (읽기 전용)", () => {
  it("migration 적용 후 모든 항목 통과", async () => {
    const db = await createTestDb();
    const rows = (await db.query<Check>(read("10_post_apply_catalog_readonly.sql"))).rows;
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });

  it("단일 SELECT 문", () => {
    const sql = read("10_post_apply_catalog_readonly.sql").replace(/--.*$/gm, "");
    expect(sql.trim().replace(/;\s*$/, "")).not.toContain(";");
    expect(sql.trim()).toMatch(/^(select|with)\b/i);
  });
});

describe("20 적용 후 동작 스모크 테스트 (ROLLBACK)", () => {
  it("PASS를 출력하고 가상 계정·기록을 남기지 않음", async () => {
    const db = await createTestDb();
    const results = await db.exec(read("20_post_apply_rls_smoke.sql"));
    const pass = results.flatMap((r) => r.rows as { result?: string }[]).find((r) => r.result === "PASS");
    expect(pass).toBeDefined();
    const left = await db.query<{ n: number }>(
      `select (select count(*) from auth.users where email like 'carelog-smoke-%')
            + (select count(*) from public.patients) + (select count(*) from public.health_records)
            + (select count(*) from public.life_requests) + (select count(*) from public.medications) as n`,
    );
    expect(Number(left.rows[0].n)).toBe(0);
  });

  it("보안 구멍이 있으면 FAIL로 중단 (탐지력 확인)", async () => {
    const db = await createTestDb();
    await db.exec(`drop policy health_records_select on public.health_records;
      create policy leak on public.health_records for select to authenticated using (true);`);
    await expect(db.exec(read("20_post_apply_rls_smoke.sql"))).rejects.toThrow(/FAIL:/);
    await db.exec("rollback");
    const left = await db.query<{ n: number }>("select count(*)::int n from auth.users where email like 'carelog-smoke-%'");
    expect(left.rows[0].n).toBe(0);
  });
});
