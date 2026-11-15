import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PATIENT_AUTH_MESSAGES as M } from "@/lib/patient-auth/rules";
import { isAdminConfigured } from "@/server/supabase/admin";
import { createRateLimiter } from "./rate-limit";

/** 비밀번호 설정용 일회용 권한 쿠키 — JS에서 읽을 수 없고 이 API 경로로만 전송됨 */
export const SETUP_COOKIE = "carelog_pw_setup";
export const SETUP_COOKIE_PATH = "/api/patient-auth";

export const limiters = {
  verify: createRateLimiter(10, 10 * 60_000),
  setPassword: createRateLimiter(10, 10 * 60_000),
  login: createRateLimiter(20, 10 * 60_000),
};

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** 다른 사이트에서 보낸 요청 차단 (Origin이 있으면 Host와 같아야 함) */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** 공통 사전 검사 — 문제가 있으면 응답, 없으면 null */
export function guard(req: NextRequest): NextResponse | null {
  if (!isSupabaseConfigured() || !isAdminConfigured()) return json({ ok: false, message: M.notConfigured }, 503);
  if (!isSameOrigin(req)) return json({ ok: false, message: M.badRequest }, 403);
  return null;
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
