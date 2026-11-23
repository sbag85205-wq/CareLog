import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cleanupExpiredTrials } = await import("./cleanup");

function fakeAdmin(users: Record<string, { is_anonymous: boolean } | null>, list: string[]) {
  const deleted: string[] = [];
  const rpcs: string[] = [];
  const admin = {
    rpc: async (fn: string) => {
      rpcs.push(fn);
      return fn === "svc_purge_expired_trials" ? { data: 3, error: null } : { data: list, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: users[id] ? { id, ...users[id] } : null }, error: null }),
        deleteUser: async (id: string) => (deleted.push(id), { error: null }),
      },
    },
  };
  return { admin: admin as never, deleted, rpcs };
}

describe("만료 체험 정리", () => {
  it("DB 정리 함수 → 익명 계정만 Auth 삭제 (목록에 일반 계정이 섞여도 지우지 않음)", async () => {
    const f = fakeAdmin({ a1: { is_anonymous: true }, a2: { is_anonymous: true }, real: { is_anonymous: false }, gone: null }, ["a1", "real", "a2", "gone"]);
    const r = await cleanupExpiredTrials(f.admin);
    expect(f.rpcs).toEqual(["svc_purge_expired_trials", "svc_trial_users_to_delete"]);
    expect(f.deleted).toEqual(["a1", "a2"]);
    expect(r).toEqual({ purged: 3, deleted: 2, skipped: 2 });
  });
});

describe("정리 경로 인증", () => {
  it("CRON_SECRET 이 없거나 다르면 401, 맞으면 실행", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
    vi.doMock("@/server/supabase/admin", () => ({ isAdminConfigured: () => true, getAdminClient: () => fakeAdmin({}, []).admin }));
    const { GET } = await import("@/app/api/trial/cleanup/route");
    const req = (auth?: string) => ({ headers: new Headers(auth ? { authorization: auth } : {}) }) as never;
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer anything"))).status).toBe(401); // 기존 배포(값 없음)는 항상 거부
    process.env.CRON_SECRET = "test-cron-secret-0123456789";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong-secret-0123456789xx"))).status).toBe(401);
    expect((await GET(req("Bearer test-cron-secret-0123456789"))).status).toBe(200);
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });
});
