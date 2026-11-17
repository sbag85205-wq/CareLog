import { addDays, todayISO } from "@/lib/date";
import type { HealthRecord } from "@/types";

/** 최근 n일 기록 요약 (진료 준비 화면 — 데모·로그인 버전 공용) */
export function summarizeRecent(records: HealthRecord[], days: number, today: string = todayISO()) {
  const from = addDays(today, -(days - 1));
  const inRange = (d: string) => d >= from && d <= today;
  const recent = records.filter((r) => inRange(r.date));
  const avg = (k: "condition" | "pain" | "sleep") =>
    recent.length ? (recent.reduce((s, r) => s + r[k], 0) / recent.length).toFixed(1) : "-";
  const symptomCount = new Map<string, number>();
  recent.forEach((r) => r.symptoms.forEach((s) => symptomCount.set(s, (symptomCount.get(s) ?? 0) + 1)));
  const topSymptoms = [...symptomCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const worst = recent.reduce<HealthRecord | null>((w, r) => (!w || r.condition < w.condition ? r : w), null);
  return { count: recent.length, avgCondition: avg("condition"), avgPain: avg("pain"), avgSleep: avg("sleep"), topSymptoms, worst };
}
