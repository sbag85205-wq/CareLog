"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createSupabaseRepository, type SupabaseRepository } from "@/lib/repository/supabase";
import { ROLE_HOME, type AppRole } from "@/lib/roles";
import { getBrowserClient } from "@/lib/supabase/browser";

const noopSubscribe = () => () => {};

/**
 * 로그인 버전 화면 공통: 세션 확인 → 저장소 생성·불러오기 → 역할 확인
 * - 역할은 DB(profiles)의 값. 다른 역할 화면 주소로 들어오면 자기 역할의 화면으로 이동
 *   (화면 이동일 뿐이며, 실제 데이터 범위는 RLS가 세션 기준으로 결정)
 * @param expected 이 화면을 쓸 역할. null이면 역할 확인 없이 로그인만 요구 (초대 수락 화면 등)
 */
export function useDbApp(expected: AppRole | null, opts: { requireLogin?: boolean } = {}) {
  const router = useRouter();
  const requireLogin = opts.requireLogin ?? true;
  const [repo, setRepo] = useState<SupabaseRepository | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const start = useCallback(() => {
    let cancelled = false;
    void (async () => {
      const client = getBrowserClient();
      const user = client ? (await client.auth.getUser()).data.user : null;
      if (cancelled) return;
      if (!client || !user) {
        if (requireLogin) router.replace("/login");
        else setSignedOut(true);
        return;
      }
      setSignedOut(false);
      const r = createSupabaseRepository(client, user.id);
      setRepo(r);
      void r.load();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, requireLogin]);

  useEffect(() => start(), [start]);

  const snapshot = useSyncExternalStore(repo?.subscribe ?? noopSubscribe, () => repo?.getSnapshot() ?? null, () => null);
  const loadState = useSyncExternalStore(repo?.subscribe ?? noopSubscribe, () => repo?.getLoadState() ?? null, () => null);

  const role = snapshot?.viewer.role;
  const wrongRole = Boolean(expected && role && role !== expected);
  useEffect(() => {
    if (wrongRole && role) router.replace(ROLE_HOME[role]);
  }, [wrongRole, role, router]);

  const logout = useCallback(async () => {
    await fetch("/api/patient-auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    await getBrowserClient()?.auth.signOut();
    router.replace("/login");
  }, [router]);

  /** 로그인 직후 (같은 화면에서) 다시 시작 */
  const restart = useCallback(() => {
    setRepo(null);
    start();
  }, [start]);

  const ready = loadState?.state === "ready" && snapshot !== null && !wrongRole;
  return { repo, snapshot, loadState, ready, logout, signedOut, restart };
}
