import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Route Handler용 Supabase 클라이언트 — 로그인 성공 시 세션을 HTTP 쿠키로 설정
 * (Next 16: cookies()는 비동기, Route Handler에서만 set 가능)
 */
export async function createSessionClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options);
      },
    },
  });
}
