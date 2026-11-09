/** 날짜 유틸 — 모든 날짜는 로컬 기준 YYYY-MM-DD 문자열로 다룹니다. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 오늘을 포함한 최근 n일 날짜 (오래된 순) */
export function lastNDates(n: number, end: string = todayISO()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatKoreanDate(iso: string, withWeekday = true): string {
  const d = parseISODate(iso);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return withWeekday ? `${base} (${WEEKDAYS[d.getDay()]})` : base;
}

export function formatShortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateTime(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export function weekdayOf(iso: string): number {
  return parseISODate(iso).getDay();
}
