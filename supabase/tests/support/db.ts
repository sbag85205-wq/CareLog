/**
 * PGlite(WASM PostgreSQL) 기반 DB 테스트 도구 — Docker 없이 migration·RLS·RPC를 실제 SQL로 검증
 *
 * - 매 테스트 파일마다 새 DB: shim → supabase/migrations/*.sql (파일명 순) 적용
 * - as(user)로 Supabase와 같은 방식(role + request.jwt.claims)으로 로그인 사용자를 흉내 냄
 * - 모든 계정·데이터는 가상 데이터
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
export const MIGRATIONS_DIR = path.join(ROOT, "migrations");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

export async function createTestDb(opts: { migrations?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8"));
  if (opts.migrations === false) return db;
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (e) {
      throw new Error(`migration 실패: ${file}\n${(e as Error).message}`);
    }
  }
  return db;
}

export type Actor = { id: string; email?: string } | "anon" | "service_role" | "superuser";

/**
 * 지정한 사용자로 SQL 실행 (트랜잭션 단위, 끝나면 원래 역할로 복귀)
 * 오류가 나면 트랜잭션 전체가 롤백되므로 실패한 시도는 데이터에 흔적을 남기지 않음
 */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx: Transaction) => {
    if (actor === "anon") {
      await tx.query("set local role anon");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    } else if (actor === "service_role") {
      await tx.query("set local role service_role");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    } else if (actor !== "superuser") {
      await tx.query("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, role: "authenticated", email: actor.email }),
      ]);
    }
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

/** 실패해야 하는 시도 — 오류 메시지(또는 SQLSTATE 메시지 일부)를 돌려줌 */
export async function expectFail(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("실패해야 하는 작업이 성공했습니다 (권한 차단 누락)");
}

/** 가상 계정 생성 (Supabase Auth 가입과 동일하게 auth.users에 행 추가 → 트리거가 profile 생성) */
export async function signUp(
  db: PGlite,
  email: string,
  opts: { confirmed?: boolean; meta?: Record<string, unknown> } = {},
): Promise<{ id: string; email: string }> {
  const rows = await as<{ id: string }>(
    db,
    "superuser",
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, case when $2 then now() end, $3::jsonb) returning id`,
    [email, opts.confirmed ?? true, JSON.stringify(opts.meta ?? {})],
  );
  return { id: rows[0].id, email };
}
