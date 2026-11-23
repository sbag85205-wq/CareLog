/**
 * 되돌리기 SQL 검증 (PGlite, 가상 데이터)
 * 1–9 적용 + 기존 데이터 → 10·11 적용 + 새 기록 → rollback → 카탈로그가 1–9와 같고 기존 데이터는 그대로
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { as, createTestDb, MIGRATIONS_DIR, migrationFiles, signUp } from "./support/db";

const ROLLBACK = path.resolve(__dirname, "../rollback/20261124_down_11_10.sql");
const NEW = ["20261123090000_prescription_history.sql", "20261124090000_feelpill_records.sql"];

async function apply(db: PGlite, files: string[]) {
  for (const f of files) await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
}

/** 구조 스냅샷: 컬럼 · 정책 · 함수 · 트리거 · 인덱스 · 표 권한 */
async function catalog(db: PGlite) {
  const q = async (sql: string) => (await db.query<{ v: string }>(sql)).rows.map((r) => r.v);
  return {
    columns: await q(`select table_schema||'.'||table_name||'.'||column_name||':'||data_type v from information_schema.columns where table_schema in ('public','private') order by 1`),
    policies: await q(`select tablename||'.'||policyname||':'||cmd v from pg_policies where schemaname='public' order by 1`),
    functions: await q(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1`),
    triggers: await q(`select c.relname||'.'||t.tgname v from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private') order by 1`),
    indexes: await q(`select tablename||'.'||indexname v from pg_indexes where schemaname in ('public','private') order by 1`),
    grants: await q(`select table_name||':'||grantee||':'||privilege_type v from information_schema.role_table_grants where table_schema='public' order by 1`),
    colGrants: await q(`select table_name||'.'||column_name||':'||grantee||':'||privilege_type v from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated') order by 1`),
  };
}

const dataHash = async (db: PGlite) =>
  (
    await db.query<{ v: string }>(
      `select md5(string_agg(t, '|' order by t)) v from (
         select 'p:'||id||display_name t from public.patients
         union all select 'h:'||patient_id||record_date||condition from public.health_records
         union all select 'q:'||id||text from public.visit_questions
         union all select 'g:'||id||grantee_id||array_to_string(scopes::text[],',') from public.access_grants
         union all select 'u:'||id||role::text||coalesce(disabled_at::text,'') from public.profiles) x`,
    )
  ).rows[0].v;

describe("되돌리기 11 → 10", () => {
  it("1–9 구조와 같아지고, 1–9 시절 데이터는 그대로 (10·11 이후 기록만 사라짐)", async () => {
    const db = await createTestDb({ migrations: false });
    const base = migrationFiles().filter((f) => f < NEW[0]); // 1–9 (12 이후는 이 되돌리기와 무관)
    expect(base).toHaveLength(9);
    await apply(db, base);

    // 1–9 상태의 기존 데이터 (가상)
    const A = await signUp(db, "rb-a@example.test");
    const G = await signUp(db, "rb-g@example.test");
    const pid = (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '(가상) 환자') returning id", [A.id]))[0].id;
    await as(db, A, "insert into public.visit_questions (patient_id, text) values ($1, '(가상) 질문')", [pid]);
    const inv = (await as<{ j: { token: string } }>(db, A, "select public.invite_guardian($1, $2, '{records}') j", [pid, G.email]))[0].j;
    await as(db, G, "select public.accept_guardian_invitation($1)", [inv.token]);

    const before = await catalog(db);
    const hashBefore = await dataHash(db);

    // 10·11 적용 후 새 기록
    await apply(db, NEW);
    const rx = (await as<{ id: string }>(db, A, "select public.create_med_record($1, gen_random_uuid(), 'otc', 'search', current_date, '', '', '', $2::jsonb) id", [pid, JSON.stringify([{ name: "(가상) 진통정" }])]))[0].id;
    const grant = (await as<{ id: string }>(db, A, "select id from public.access_grants where grantee_id = $1", [G.id]))[0].id;
    await as(db, A, "select public.set_grant_relation($1, 'family')", [grant]);
    await as(db, A, "select public.share_record($1, $2, '{experience}', null)", [rx, G.id]);
    await as(db, A, "update public.visit_questions set prescription_id = $1", [rx]);
    expect((await catalog(db)).columns.length).toBeGreaterThan(before.columns.length);

    // 되돌리기
    await db.exec(readFileSync(ROLLBACK, "utf8"));
    expect(await catalog(db)).toEqual(before);
    expect(await dataHash(db)).toBe(hashBefore);

    // 되돌린 뒤에도 1–9 기능 동작 (질문 추가·보호자 조회)
    await as(db, A, "insert into public.visit_questions (patient_id, text) values ($1, '(가상) 되돌린 뒤 질문')", [pid]);
    expect((await as<{ n: number }>(db, G, "select count(*)::int n from public.patients"))[0].n).toBe(1);

    // 다시 적용해도 문제없음 (재배포 대비)
    await apply(db, NEW);
    expect((await as<{ n: number }>(db, A, "select count(*)::int n from public.prescriptions"))[0].n).toBe(0);
  });
});
