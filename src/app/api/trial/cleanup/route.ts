import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAdminClient, isAdminConfigured } from "@/server/supabase/admin";
import { cleanupExpiredTrials } from "@/server/trial/cleanup";

/**
 * 만료된 공개 체험 정리 — Vercel Cron 전용 (Authorization: Bearer CRON_SECRET)
 * CRON_SECRET 이 없는 배포(기존 carelog 등)에서는 항상 거부
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization") ?? "";
  if (secret.length < 16) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ ok: false }, { status: 401 });
  if (!isSupabaseConfigured() || !isAdminConfigured()) return Response.json({ ok: false }, { status: 503 });
  try {
    const r = await cleanupExpiredTrials(getAdminClient());
    console.info(`[trial] cleanup purged=${r.purged} deleted=${r.deleted} skipped=${r.skipped}`);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error(`[trial] cleanup 실패: ${e instanceof Error ? e.message : "unknown"}`);
    return Response.json({ ok: false }, { status: 500 });
  }
}
