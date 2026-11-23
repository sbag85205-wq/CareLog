/**
 * migration 12 — 로그인 없는 공개 체험 (Supabase 익명 세션) · PGlite, 가상 계정만
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, expectFail, signInAnonymously, signUp } from "./support/db";

type U = { id: string; email?: string; anonymous?: boolean };
let db: PGlite;
let P: U, G: U; // 기존 일반 환자·보호자 (체험과 무관해야 함)
let pidP: string;
let V1: U, V2: U;
let t1: { patient_id: string; expires_at: string; resumed: boolean };
let t2: { patient_id: string };

const start = async (u: U) => (await as<{ j: typeof t1 }>(db, u, "select public.start_trial() j"))[0].j;
const count = async (u: U, sql: string, params: unknown[] = []) => (await as<{ n: number }>(db, u, `select count(*)::int n from (${sql}) q`, params))[0].n;
const RX_TABLES = [
  "prescriptions",
  "prescription_items",
  "prescription_notes",
  "health_records",
  "visit_questions",
  "intake_logs",
  "record_shares",
  "medications",
];
const existingHash = async () =>
  (
    await as<{ v: string }>(
      db,
      "superuser",
      `select md5(string_agg(t, '|' order by t)) v from (
         select 'p:'||id||display_name||coalesce(profile_id::text,'') t from public.patients where id = $1
         union all select 'h:'||record_date||condition from public.health_records where patient_id = $1
         union all select 'q:'||text from public.visit_questions where patient_id = $1
         union all select 'g:'||id||coalesce(revoked_at::text,'') from public.access_grants where patient_id = $1
         union all select 'u:'||id||role||coalesce(disabled_at::text,'') from public.profiles where id = $2) x`,
      [pidP, P.id],
    )
  )[0].v;
let hashBefore = "";

beforeAll(async () => {
  db = await createTestDb();
  P = await signUp(db, "trial-regular@example.test");
  G = await signUp(db, "trial-guardian@example.test");
  pidP = (
    await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '(가상) 기존 환자') returning id", [P.id])
  )[0].id;
  await as(db, P, "insert into public.visit_questions (patient_id, text) values ($1, '(가상) 기존 질문')", [pidP]);
  const inv = (await as<{ j: { token: string } }>(db, P, "select public.invite_guardian($1, $2, '{records}') j", [pidP, G.email]))[0].j;
  await as(db, G, "select public.accept_guardian_invitation($1)", [inv.token]);
  hashBefore = await existingHash();
  V1 = await signInAnonymously(db);
  V2 = await signInAnonymously(db);
});

describe("체험 시작 — 익명 세션만, 방문자마다 독립된 환자", () => {
  it("익명 계정은 가입 트리거로 patient 프로필만 생기고, 체험 시작 전에는 아무 기록도 없음", async () => {
    expect((await as<{ role: string }>(db, "superuser", "select role from public.profiles where id = $1", [V1.id]))[0].role).toBe("patient");
    for (const t of RX_TABLES) expect(await count(V1, `select 1 from public.${t}`), t).toBe(0);
    expect(await count(V1, "select 1 from public.patients")).toBe(0);
    expect(await expectFail(as(db, V1, "insert into public.patients (profile_id, display_name) values ($1, 'x')", [V1.id]))).toMatch(/permission denied/);
  });

  it("체험 시작 → 내 환자 행 + 가상 예시 기록(컨디션·처방·경험·질문), 24시간 뒤 만료", async () => {
    t1 = await start(V1);
    expect(t1.resumed).toBe(false);
    const hours = (Date.parse(t1.expires_at) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
    expect(await count(V1, "select 1 from public.patients")).toBe(1);
    expect(await count(V1, "select 1 from public.health_records")).toBe(3);
    expect(await count(V1, "select 1 from public.prescriptions")).toBe(3);
    expect(await count(V1, "select 1 from public.prescription_notes")).toBe(3);
    expect(await count(V1, "select 1 from public.visit_questions")).toBe(1);
    expect((await as<{ j: { is_trial: boolean; expired: boolean } }>(db, V1, "select public.trial_status() j"))[0].j).toMatchObject({
      is_trial: true,
      expired: false,
    });
  });

  it("같은 세션으로 다시 들어오면 같은 체험 (재사용, 기록이 늘지 않음)", async () => {
    const again = await start(V1);
    expect(again).toMatchObject({ patient_id: t1.patient_id, resumed: true });
    expect(await count(V1, "select 1 from public.prescriptions")).toBe(3);
  });

  it("방문자 두 명: 서로의 환자·기록을 읽거나 쓰지 못함", async () => {
    t2 = await start(V2);
    expect(t2.patient_id).not.toBe(t1.patient_id);
    for (const t of RX_TABLES) {
      expect(await count(V2, `select 1 from public.${t} where patient_id = $1`, [t1.patient_id]), t).toBe(0);
      expect(await count(V1, `select 1 from public.${t} where patient_id = $1`, [t2.patient_id]), t).toBe(0);
    }
    expect(await count(V2, "select 1 from public.patients where id = $1", [t1.patient_id])).toBe(0);
    expect(
      await expectFail(
        as(
          db,
          V2,
          "select public.upsert_health_record($1::uuid, current_date, 3::smallint, 2::smallint, 3::smallint, 3::smallint, 50::smallint, 'normal'::public.digestion)",
          [t1.patient_id],
        ),
      ),
    ).toMatch(/row-level security/);
    expect(await expectFail(as(db, V2, "insert into public.visit_questions (patient_id, text) values ($1, 'x')", [t1.patient_id]))).toMatch(
      /row-level security/,
    );
    expect(await as(db, V2, "delete from public.prescription_notes where patient_id = $1 returning id", [t1.patient_id])).toEqual([]);
    // 기존 환자 기록도 안 보임
    expect(await count(V1, "select 1 from public.visit_questions where patient_id = $1", [pidP])).toBe(0);
  });

  it("방문자는 자기 체험에서 컨디션·약 기록을 직접 쓸 수 있음", async () => {
    await as(
      db,
      V1,
      "select public.upsert_health_record($1::uuid, current_date, 4::smallint, 1::smallint, 2::smallint, 4::smallint, 100::smallint, 'good'::public.digestion)",
      [t1.patient_id],
    );
    await as(db, V1, "select public.create_med_record($1, gen_random_uuid(), 'otc', 'manual', current_date, '', '', '', $2::jsonb)", [
      t1.patient_id,
      JSON.stringify([{ name: "(가상) 방문자가 적은 약" }]),
    ]);
    expect(await count(V1, "select 1 from public.prescriptions")).toBe(4);
    expect(await count(V2, "select 1 from public.prescriptions")).toBe(3);
  });

  it("방문자 10명이 동시에 시작해도 각자 하나씩, 서로 섞이지 않음", async () => {
    const vs = await Promise.all(Array.from({ length: 10 }, () => signInAnonymously(db)));
    const ts = [];
    for (const v of vs) ts.push(await start(v)); // PGlite 는 연결 하나 — 순서대로
    expect(new Set(ts.map((t) => t.patient_id)).size).toBe(10);
    for (const [i, v] of vs.entries()) {
      expect(await count(v, "select 1 from public.patients")).toBe(1);
      expect(await count(v, "select 1 from public.prescriptions where patient_id <> $1", [ts[i].patient_id])).toBe(0);
    }
  });
});

describe("기존 계정·권한은 그대로", () => {
  it("일반 계정(이메일 가입 환자·보호자)은 체험을 만들 수 없음", async () => {
    expect(await expectFail(start(P))).toMatch(/forbidden/);
    expect(await expectFail(start(G))).toMatch(/forbidden/);
    const fresh = await signUp(db, "trial-fresh@example.test");
    expect(await expectFail(start(fresh))).toMatch(/forbidden/);
    expect((await as<{ j: { is_trial: boolean } }>(db, P, "select public.trial_status() j"))[0].j).toEqual({ is_trial: false });
  });

  it("로그인 안 한 요청은 체험 함수를 실행할 수 없음, 서버 정리 함수는 서버 키만", async () => {
    expect(await expectFail(as(db, "anon", "select public.start_trial()"))).toMatch(/permission denied/);
    expect(await expectFail(as(db, V1, "select public.svc_purge_expired_trials(10)"))).toMatch(/permission denied/);
    expect(await expectFail(as(db, V1, "select * from public.svc_trial_users_to_delete(10)"))).toMatch(/permission denied/);
    expect(await expectFail(as(db, V1, "select * from private.trial_accounts"))).toMatch(/permission denied/);
    expect(await expectFail(as(db, V1, "select public.create_my_patient_profile('x', null, null)"))).toMatch(/permission denied/);
  });

  it("방문자끼리 공유 연결 불가 (초대는 이메일 계정만 수락 가능)", async () => {
    const inv = (await as<{ j: { token: string } }>(db, V1, "select public.invite_guardian($1, 'someone@example.test', '{records}') j", [t1.patient_id]))[0].j;
    expect(await expectFail(as(db, V2, "select public.accept_guardian_invitation($1)", [inv.token]))).toMatch(/not_found|forbidden|invalid|이메일/);
    expect(await count(V2, "select 1 from public.health_records where patient_id = $1", [t1.patient_id])).toBe(0);
  });

  it("기존 환자의 데이터·보호자 연결은 체험 작업 후에도 그대로", async () => {
    expect(await existingHash()).toBe(hashBefore);
    expect(await count(G, "select 1 from public.patients")).toBe(1); // 보호자는 기존 환자만
  });
});

describe("만료·정리·체험 끝내기", () => {
  it("만료되면 정리: 그 체험 기록만 삭제·계정 비활성화, 다른 방문자·기존 환자는 그대로", async () => {
    await as(db, "superuser", "update private.trial_accounts set expires_at = now() - interval '1 minute' where user_id = $1", [V1.id]);
    expect((await as<{ j: { expired: boolean } }>(db, V1, "select public.trial_status() j"))[0].j.expired).toBe(true);
    expect((await as<{ n: number }>(db, "service_role", "select public.svc_purge_expired_trials(100) n"))[0].n).toBe(1);
    for (const t of RX_TABLES) expect(await count(V1, `select 1 from public.${t}`), t).toBe(0);
    expect((await as<{ n: number }>(db, "superuser", "select count(*)::int n from public.patients where id = $1", [t1.patient_id]))[0].n).toBe(0);
    expect(
      (await as<{ n: number }>(db, "superuser", "select count(*)::int n from public.prescription_notes where patient_id = $1", [t1.patient_id]))[0].n,
    ).toBe(0);
    expect(await expectFail(start(V1))).toMatch(/expired/); // 같은 세션 재사용 불가 → 새로 시작
    expect(await count(V2, "select 1 from public.prescriptions")).toBe(3);
    expect(await existingHash()).toBe(hashBefore);
  });

  it("새 방문자가 체험을 시작할 때도 만료된 체험이 정리됨 (크론이 없어도)", async () => {
    await as(db, "superuser", "update private.trial_accounts set expires_at = now() - interval '1 minute' where user_id = $1", [V2.id]);
    await start(await signInAnonymously(db));
    expect((await as<{ n: number }>(db, "superuser", "select count(*)::int n from public.patients where id = $1", [t2.patient_id]))[0].n).toBe(0);
  });

  it("체험 끝내기: 본인 기록 바로 삭제, 일반 계정은 사용할 수 없음", async () => {
    const v = await signInAnonymously(db);
    const t = await start(v);
    await as(db, v, "select public.end_trial()");
    expect((await as<{ n: number }>(db, "superuser", "select count(*)::int n from public.patients where id = $1", [t.patient_id]))[0].n).toBe(0);
    expect(await count(v, "select 1 from public.prescriptions")).toBe(0);
    expect(await expectFail(as(db, P, "select public.end_trial()"))).toMatch(/forbidden/);
    expect(await existingHash()).toBe(hashBefore);
  });

  it("Auth 계정 삭제 목록: 정리가 끝난 익명 체험 계정만 (일반 계정·진행 중인 체험은 없음)", async () => {
    const ids = (await as<{ id: string }>(db, "service_role", "select public.svc_trial_users_to_delete(1000) id")).map((r) => r.id);
    expect(ids).toContain(V1.id);
    expect(ids).toContain(V2.id);
    expect(ids).not.toContain(P.id);
    expect(ids).not.toContain(G.id);
    const live = (await as<{ user_id: string }>(db, "superuser", "select user_id from private.trial_accounts where purged_at is null")).map((r) => r.user_id);
    for (const l of live) expect(ids).not.toContain(l);
    // 삭제하면 프로필·체험 행도 정리됨 (환자 행은 이미 없음)
    await as(db, "superuser", "delete from auth.users where id = $1", [V1.id]);
    expect((await as<{ n: number }>(db, "superuser", "select count(*)::int n from private.trial_accounts where user_id = $1", [V1.id]))[0].n).toBe(0);
  });
});

describe("되돌리기 (migration 12)", () => {
  it("체험 기록은 지워지고 구조는 migration 11 상태로, 기존 환자 데이터는 그대로", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const fresh = await createTestDb({ migrations: false });
    const { MIGRATIONS_DIR, migrationFiles } = await import("./support/db");
    const files = migrationFiles();
    const upto11 = files.filter((f) => f < "20261125090000");
    for (const f of upto11) await fresh.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    const snap = async () =>
      (
        await fresh.query<{ v: string }>(
          `select string_agg(x, '|' order by x) v from (
             select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' x from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
             union all select table_schema||'.'||table_name from information_schema.tables where table_schema in ('public','private')
             union all select tablename||'.'||policyname from pg_policies where schemaname in ('public','private')) q`,
        )
      ).rows[0].v;
    const before = await snap();
    const keep = await signUp(fresh, "rb12-keep@example.test");
    const pid = (
      await as<{ id: string }>(fresh, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '(가상) 유지') returning id", [
        keep.id,
      ])
    )[0].id;
    await as(fresh, keep, "insert into public.visit_questions (patient_id, text) values ($1, '(가상) 유지 질문')", [pid]);

    for (const f of files.filter((x) => x >= "20261125090000")) await fresh.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    const v = await signInAnonymously(fresh);
    const t = (await as<{ j: { patient_id: string } }>(fresh, v, "select public.start_trial() j"))[0].j;
    await fresh.exec(readFileSync(path.resolve(__dirname, "../rollback/20261125_down_12.sql"), "utf8"));

    expect(await snap()).toBe(before);
    expect((await fresh.query<{ n: number }>("select count(*)::int n from public.patients where id = $1", [t.patient_id])).rows[0].n).toBe(0);
    expect((await fresh.query<{ n: number }>("select count(*)::int n from public.prescriptions where patient_id = $1", [t.patient_id])).rows[0].n).toBe(0);
    expect((await fresh.query<{ n: number }>("select count(*)::int n from public.visit_questions where patient_id = $1", [pid])).rows[0].n).toBe(1);
    expect((await fresh.query<{ d: string | null }>("select disabled_at::text d from public.profiles where id = $1", [v.id])).rows[0].d).not.toBeNull();
  });
});
