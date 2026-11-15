/**
 * 날짜·시각 유틸
 *
 * 두 종류의 값을 엄격히 구분합니다.
 * 1) 달력 날짜 (YYYY-MM-DD) — 일일 건강기록·식사·진료일 등. **한국 시간(Asia/Seoul) 기준의 날짜**입니다.
 *    날짜 계산은 시간대 영향을 받지 않도록 UTC 자정으로 계산합니다.
 * 2) 저장 시각 (타임스탬프) — createdAt/updatedAt 등. **항상 UTC ISO 8601 ("...Z")** 로 저장하고,
 *    정렬은 문자열이 아니라 실제 시각(Date.parse)으로 비교합니다. 화면에는 한국 시간으로 표시합니다.
 */

export const APP_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_HOURS = 9; // 한국은 일광절약시간 없음

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* ───────────── 달력 날짜 (Asia/Seoul) ───────────── */

/** 임의 시각을 한국 날짜(YYYY-MM-DD)로 */
export function toSeoulDate(instant: Date | number | string): string {
  return ymdFormatter.format(new Date(instant));
}

/** @deprecated toSeoulDate 사용 (기존 호출 호환용) */
export const toISODate = (d: Date) => toSeoulDate(d);

/** 오늘 (한국 날짜) */
export function todayISO(now: Date = new Date()): string {
  return toSeoulDate(now);
}

/** 달력 날짜 → UTC 자정 Date (계산 전용, 표시는 getUTC* 사용) */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatCalendar(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatCalendar(d);
}

/** 오늘을 포함한 최근 n일 날짜 (오래된 순) */
export function lastNDates(n: number, end: string = todayISO()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayOf(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

export function formatKoreanDate(iso: string, withWeekday = true): string {
  const d = parseISODate(iso);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return withWeekday ? `${base} (${WEEKDAYS[d.getUTCDay()]})` : base;
}

export function formatShortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/* ───────────── 저장 시각 (UTC ISO 8601) ───────────── */

/** 현재 시각 (UTC ISO 8601) */
export function nowISO(now: Date = new Date()): string {
  return now.toISOString();
}

/** 한국 날짜 + 시:분 → UTC ISO 8601 (가상 데이터 생성용) */
export function seoulDateTimeToISO(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - KST_OFFSET_HOURS, minute)).toISOString();
}

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * 저장된 시각 문자열을 UTC ISO 8601로 정규화합니다.
 * - 이미 시간대(Z 또는 +09:00 등)가 있으면 그대로 UTC로 변환
 * - 시간대가 없는 값(v1 가상 데이터, 예: "2026-11-11T09:10:00")은 **한국 시간**으로 해석
 * - 해석할 수 없으면 원래 값을 그대로 반환 (데이터 손실 방지)
 */
export function normalizeTimestamp(value: string): string {
  if (HAS_OFFSET.test(value)) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? value : new Date(t).toISOString();
  }
  if (NAIVE_DATETIME.test(value)) {
    const t = Date.parse(`${value}+09:00`);
    return Number.isNaN(t) ? value : new Date(t).toISOString();
  }
  return value;
}

/** 정렬용 시각 값. 해석 불가한 값은 가장 오래된 것으로 취급 */
export function timestampValue(value: string): number {
  const t = Date.parse(normalizeTimestamp(value));
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** 최신순 정렬 비교 함수 */
export function byTimestampDesc<T>(get: (item: T) => string) {
  return (a: T, b: T) => timestampValue(get(b)) - timestampValue(get(a));
}

/** 타임스탬프 → "11/11 09:10" (한국 시간) */
export function formatDateTime(isoDateTime: string): string {
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(new Date(timestampValue(isoDateTime))).map((p) => [p.type, p.value]),
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

const WEEKDAY_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/** "2026년 11월 15일 일요일" (withYear=false → "11월 15일 일요일") */
export function formatLongKoreanDate(iso: string, withYear = true): string {
  const d = parseISODate(iso);
  const md = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WEEKDAY_FULL[d.getUTCDay()]}`;
  return withYear ? `${d.getUTCFullYear()}년 ${md}` : md;
}

/** "11.09" — 기간 표시용 */
export function formatDotDate(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
}

/** 저장 시각(UTC ISO) → "오후 8:10" (한국 시간, 실행 환경의 ICU 언어 데이터와 무관) */
export function formatKoreanTime(isoDateTime: string): string {
  const parts = Object.fromEntries(
    dateTimeFormatter.formatToParts(new Date(timestampValue(isoDateTime))).map((p) => [p.type, p.value]),
  );
  const h = Number(parts.hour) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}:${parts.minute}`;
}
