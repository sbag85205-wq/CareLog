/**
 * 3단계 환자 코드 로그인 — 서버 로직(service.ts) + migration 7 SQL 통합 테스트
 *
 * - DB: PGlite에 실제 migration 7개 적용, svc_* 함수는 service_role로 호출 (실서비스와 동일)
 * - Auth: 가짜 제공자 (비밀번호 저장·로그인·실패 주입). 실서비스는 Supabase Auth
 * - 가상 생년월일은 실행할 때마다 무작위 생성 (Git에 고정값을 남기지 않음)
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateLoginCode, PATIENT_AUTH_MESSAGES as M } from "@/lib/patient-auth/rules";
import {
  loginWithCode,
  setPasswordWithToken,
  verifyFirstAccess,
  type PatientAuthDb,
  type PatientAuthDeps,
  type PatientAuthProvider,
} from "@/server/patient-auth/service";
import { as, createTestDb, expectFail, signUp } from "./support/db";

type J = { ok: boolean; token?: string; expires_at?: string; auth_user_id?: string; email?: string };

function pgliteDb(db: PGlite): PatientAuthDb {
  const call = async (sql: string, params: unknown[]) => (await as<{ r: J }>(db, "service_role", sql, params))[0].r;
  return {
    async verifyFirstAccess(code, birth, ttl) {
      const r = await call("select public.svc_verify_first_access($1, $2::date, $3) r", [code, birth, ttl]);
      return r.ok ? { ok: true, token: r.token!, expiresAt: r.expires_at! } : { ok: false };
    },
    async beginPasswordSetup(token) {
      const r = await call("select public.svc_begin_password_setup($1) r", [token]);
      return r.ok ? { ok: true, authUserId: r.auth_user_id! } : { ok: false };
    },
    async completePasswordSetup(token) {
      const r = await call("select public.svc_complete_password_setup($1) r", [token]);
      return r.ok ? { ok: true, email: r.email! } : { ok: false };
    },
    async abortPasswordSetup(token) {
      await as(db, "service_role", "select public.svc_abort_password_setup($1)", [token]);
    },
    async loginLookup(code) {
      const r = await call("select public.svc_login_lookup($1) r", [code]);
      return r.ok ? { ok: true, email: r.email! } : { ok: false };
    },
    async recordLoginResult(code, success) {
      await as(db, "service_role", "select public.svc_record_login_result($1, $2)", [code, success]);
    },
  };
}

class FakeAuth implements PatientAuthProvider {
  passwords = new Map<string, string>();
  setPasswordCalls = 0;
  failNextSetPassword = false;
  session: string | null = null;
  constructor(private db: PGlite) {}
  async setPassword(id: string, pw: string) {
    this.setPasswordCalls += 1;
    await new Promise((r) => setTimeout(r, 5));
    if (this.failNextSetPassword) {
      this.failNextSetPassword = false;
      throw new Error("가상 네트워크 오류");
    }
    this.passwords.set(id, pw);
  }
  async signIn(email: string, pw: string) {
    const rows = await as<{ id: string }>(this.db, "superuser", "select id from auth.users where email = $1", [email]);
    const ok = !!rows[0] && this.passwords.get(rows[0].id) === pw;
    if (ok) this.session = rows[0].id;
    return ok;
  }
}

/** 실행마다 다른 가상 생년월일 (1950~1999), 그리고 그와 다른 날짜 */
function randomBirth() {
  const t = Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 50 * 365) * 86_400_000;
  const iso = new Date(t).toISOString().slice(0, 10);
  const other = new Date(t + 86_400_000 * (1 + Math.floor(Math.random() * 300))).toISOString().slice(0, 10);
  return { iso, other };
}

type Virtual = { uid: string; pid: string; code: string; birth: { iso: string; other: string } };
let db: PGlite;
let auth: FakeAuth;
let deps: PatientAuthDeps;
let A: Virtual, B: Virtual;

async function provision(db: PGlite, label: string): Promise<Virtual> {
  const u = await signUp(db, `patient-${label}-${Math.random().toString(36).slice(2)}@carelog.invalid`);
  const pid = (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, $2) returning id", [u.id, `가상 환자 ${label}`]))[0].id;
  const code = generateLoginCode();
  const birth = randomBirth();
  await as(db, "service_role", "select public.svc_register_patient_credential($1, $2, $3::date)", [pid, code, birth.iso]);
  return { uid: u.id, pid, code, birth };
}

async function firstSetup(v: Virtual, password: string) {
  const r = await verifyFirstAccess(deps, v.code, v.birth.iso);
  expect(r.ok).toBe(true);
  return setPasswordWithToken(deps, r.ok ? r.token : undefined, password, password);
}

const record = (pid: string, condition = 3) =>
  `select (public.upsert_health_record('${pid}', private.today_kst(), ${condition}::smallint, 2::smallint, 2::smallint, 3::smallint, 50::smallint, 'normal')).id`;

// DB는 파일당 1번 생성(migration 적용 비용), 테스트마다 새 가상 환자 A·B를 발급해 서로 격리
beforeAll(async () => {
  db = await createTestDb();
}, 180_000);

beforeEach(async () => {
  auth = new FakeAuth(db);
  deps = { db: pgliteDb(db), auth };
  A = await provision(db, "A");
  B = await provision(db, "B");
});

describe("최초 설정 → 로그인 → 기록 (가상 환자 A·B)", () => {
  it("A: 코드+생년월일 확인 → 비밀번호 설정(세션 발급) → 기록 저장 → 재로그인", async () => {
    const r = await firstSetup(A, "carelog2026a");
    expect(r).toEqual({ ok: true, signedIn: true, consumed: true });
    expect(auth.session).toBe(A.uid);

    // 세션으로 본인 기록 저장, 같은 한국 날짜 재저장은 1건 수정
    await as(db, { id: A.uid }, record(A.pid, 4));
    await as(db, { id: A.uid }, record(A.pid, 2));
    const rows = await as<{ condition: number }>(db, { id: A.uid }, "select condition from public.health_records where patient_id = $1", [A.pid]);
    expect(rows).toEqual([{ condition: 2 }]);

    // 재로그인 (소문자·공백 입력도 허용)
    auth.session = null;
    expect(await loginWithCode(deps, A.code.toLowerCase().replaceAll("-", " "), "carelog2026a")).toEqual({ ok: true });
    expect(auth.session).toBe(A.uid);
    expect(await as(db, { id: A.uid }, "select 1 from public.health_records where patient_id = $1", [A.pid])).toHaveLength(1);
  });

  it("A와 B는 서로의 기록을 조회·저장할 수 없음", async () => {
    await firstSetup(A, "carelog2026a");
    await firstSetup(B, "carelog2026b");
    await as(db, { id: B.uid }, record(B.pid));
    expect(await as(db, { id: A.uid }, "select 1 from public.health_records where patient_id = $1", [B.pid])).toEqual([]);
    expect(await expectFail(as(db, { id: A.uid }, record(B.pid)))).toMatch(/row-level security/);
  });
});

describe("잘못된 입력·반복 시도 (오류 문구로 원인을 드러내지 않음)", () => {
  it("잘못된 생년월일·없는 코드·형식 오류 → 모두 같은 문구", async () => {
    const wrong = await verifyFirstAccess(deps, A.code, A.birth.other);
    const unknown = await verifyFirstAccess(deps, generateLoginCode(), A.birth.iso);
    const malformed = await verifyFirstAccess(deps, "P001", A.birth.iso);
    for (const r of [wrong, unknown, malformed]) {
      expect(r).toEqual({ ok: false, status: 401, message: M.verifyFailed });
    }
    expect(JSON.stringify([wrong, unknown])).not.toContain(A.birth.iso);
  });

  it("생년월일 5회 오류 → 15분 잠금 (맞는 생년월일도 같은 문구로 거부), 잠금 해제 후 가능", async () => {
    for (let i = 0; i < 5; i++) await verifyFirstAccess(deps, A.code, A.birth.other);
    expect(await verifyFirstAccess(deps, A.code, A.birth.iso)).toEqual({ ok: false, status: 401, message: M.verifyFailed });
    await as(db, "superuser", "update private.patient_credentials set verify_locked_until = now() - interval '1 second' where patient_id = $1", [A.pid]);
    expect((await verifyFirstAccess(deps, A.code, A.birth.iso)).ok).toBe(true);
  });

  it("비밀번호 5회 오류 → 로그인 잠금 (맞는 비밀번호도 같은 문구)", async () => {
    await firstSetup(A, "carelog2026a");
    for (let i = 0; i < 5; i++) {
      expect(await loginWithCode(deps, A.code, "wrong-pass-1")).toEqual({ ok: false, status: 401, message: M.loginFailed });
    }
    expect(await loginWithCode(deps, A.code, "carelog2026a")).toEqual({ ok: false, status: 401, message: M.loginFailed });
    expect(await loginWithCode(deps, generateLoginCode(), "carelog2026a")).toEqual({ ok: false, status: 401, message: M.loginFailed });
  });

  it("비밀번호를 설정하기 전에는 로그인 불가", async () => {
    expect(await loginWithCode(deps, A.code, "anything123")).toEqual({ ok: false, status: 401, message: M.loginFailed });
  });

  it("비밀번호 규칙 위반은 구체적으로 안내하고 권한은 소모하지 않음", async () => {
    const v = await verifyFirstAccess(deps, A.code, A.birth.iso);
    const token = v.ok ? v.token : undefined;
    expect((await setPasswordWithToken(deps, token, "short1", "short1")).ok).toBe(false);
    expect(await setPasswordWithToken(deps, token, "onlyletters", "onlyletters")).toMatchObject({ status: 400 });
    expect(await setPasswordWithToken(deps, token, "carelog2026a", "carelog2026b")).toMatchObject({ status: 400 });
    expect(await setPasswordWithToken(deps, token, "carelog2026a", "carelog2026a")).toMatchObject({ ok: true });
  });
});

describe("일회용 설정 권한", () => {
  it("설정 완료 후 최초 확인 재시도 차단 → 생년월일로 비밀번호를 덮어쓸 수 없음", async () => {
    const v = await verifyFirstAccess(deps, A.code, A.birth.iso);
    const token = v.ok ? v.token : undefined;
    await setPasswordWithToken(deps, token, "carelog2026a", "carelog2026a");
    expect(await verifyFirstAccess(deps, A.code, A.birth.iso)).toEqual({ ok: false, status: 401, message: M.verifyFailed });
    expect(await setPasswordWithToken(deps, token, "hijack2026x", "hijack2026x")).toEqual({ ok: false, status: 401, message: M.setupExpired });
    expect(auth.passwords.get(A.uid)).toBe("carelog2026a");
  });

  it("만료된 설정 권한은 거부, 처음 이용하기를 다시 하면 새 권한 발급", async () => {
    const v = await verifyFirstAccess(deps, A.code, A.birth.iso);
    await as(db, "superuser", "update private.password_setup_tokens set expires_at = now() - interval '1 second' where patient_id = $1", [A.pid]);
    expect(await setPasswordWithToken(deps, v.ok ? v.token : undefined, "carelog2026a", "carelog2026a")).toEqual({ ok: false, status: 401, message: M.setupExpired });
    expect(auth.setPasswordCalls).toBe(0);
    expect((await firstSetup(A, "carelog2026a")).ok).toBe(true);
  });

  it("새로 확인하면 이전 권한은 무효", async () => {
    const v1 = await verifyFirstAccess(deps, A.code, A.birth.iso);
    const v2 = await verifyFirstAccess(deps, A.code, A.birth.iso);
    expect((await setPasswordWithToken(deps, v1.ok ? v1.token : undefined, "carelog2026a", "carelog2026a")).ok).toBe(false);
    expect((await setPasswordWithToken(deps, v2.ok ? v2.token : undefined, "carelog2026a", "carelog2026a")).ok).toBe(true);
  });

  it("동시 제출: 같은 권한으로 두 번 제출하면 하나만 성공", async () => {
    const v = await verifyFirstAccess(deps, A.code, A.birth.iso);
    const token = v.ok ? v.token : undefined;
    const results = await Promise.all([
      setPasswordWithToken(deps, token, "carelog2026a", "carelog2026a"),
      setPasswordWithToken(deps, token, "carelog2026z", "carelog2026z"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, status: 401, message: M.setupExpired }]);
    expect(auth.setPasswordCalls).toBe(1);
  });

  it("저장 실패 시 권한을 되돌려 같은 권한으로 다시 시도 가능", async () => {
    const v = await verifyFirstAccess(deps, A.code, A.birth.iso);
    const token = v.ok ? v.token : undefined;
    auth.failNextSetPassword = true;
    expect(await setPasswordWithToken(deps, token, "carelog2026a", "carelog2026a")).toEqual({ ok: false, status: 503, message: M.setupSaveFailed });
    expect(await loginWithCode(deps, A.code, "carelog2026a")).toMatchObject({ ok: false }); // 아직 미설정
    expect(await setPasswordWithToken(deps, token, "carelog2026a", "carelog2026a")).toMatchObject({ ok: true });
  });
});

describe("비밀번호 설정 전 차단과 계정 연결 보호", () => {
  it("비밀번호를 설정하지 않은 환자는 세션이 있어도 본인 기록 권한 없음", async () => {
    await as(db, "superuser", `insert into public.health_records (patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, recorded_in) values ($1, private.today_kst(), 3, 1, 2, 3, 50, 'good', 'outpatient')`, [A.pid]);
    expect(await as(db, { id: A.uid }, "select 1 from public.health_records where patient_id = $1", [A.pid])).toEqual([]);
    expect(await expectFail(as(db, { id: A.uid }, record(A.pid)))).toMatch(/row-level security/);
    await firstSetup(A, "carelog2026a");
    expect(await as(db, { id: A.uid }, "select 1 from public.health_records where patient_id = $1", [A.pid])).toHaveLength(1);
  });

  it("로그인한 사용자는 서버 전용 함수·코드 테이블을 쓸 수 없음 (다른 환자 코드를 자기 계정에 연결 불가)", async () => {
    await firstSetup(A, "carelog2026a");
    const calls = [
      ["select public.svc_register_patient_credential($1, $2, '2000-01-01')", [B.pid, generateLoginCode()]],
      ["select public.svc_verify_first_access($1, '2000-01-01')", [B.code]],
      ["select public.svc_login_lookup($1)", [B.code]],
      ["select public.svc_begin_password_setup($1)", ["0".repeat(64)]],
      ["select * from private.patient_credentials", []],
      ["select * from private.password_setup_tokens", []],
      ["update public.patients set profile_id = $1 where id = $2", [A.uid, B.pid]],
    ] as const;
    for (const actor of [{ id: A.uid }, "anon"] as const) {
      for (const [sql, params] of calls) {
        expect(await expectFail(as(db, actor, sql, [...params]))).toMatch(/permission denied/);
      }
    }
  });

  it("새 서버 전용 함수는 service_role만 실행, SECURITY DEFINER는 search_path 고정", async () => {
    const rows = await as<{ fn: string; anon: boolean; auth: boolean; svc: boolean; cfg: string[] | null }>(
      db, "superuser",
      `select p.proname fn, has_function_privilege('anon', p.oid, 'execute') anon,
              has_function_privilege('authenticated', p.oid, 'execute') auth,
              has_function_privilege('service_role', p.oid, 'execute') svc, p.proconfig cfg
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'svc\\_%'`,
    );
    expect(rows).toHaveLength(10); // migration 7의 7개 + 9 svc_mark_password_set + 12 체험 정리 2개 (svc_purge_expired_trials·svc_trial_users_to_delete)
    for (const r of rows) {
      expect(r).toMatchObject({ anon: false, auth: false, svc: true });
      expect(r.cfg).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=("")?$/)]));
    }
  });
});
