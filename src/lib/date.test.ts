import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  byTimestampDesc,
  diffDays,
  formatDateTime,
  formatKoreanDate,
  lastNDates,
  normalizeTimestamp,
  seoulDateTimeToISO,
  timestampValue,
  todayISO,
  weekdayOf,
} from "./date";

afterEach(() => vi.useRealTimers());

describe("한국 날짜 (Asia/Seoul)", () => {
  it("UTC 15:00 이후는 한국에서 다음 날", () => {
    expect(todayISO(new Date("2026-11-10T14:59:00Z"))).toBe("2026-11-10");
    expect(todayISO(new Date("2026-11-10T15:00:00Z"))).toBe("2026-11-11");
  });

  it("실행 환경 시간대와 무관하게 오늘을 한국 기준으로 계산", () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T16:30:00Z") });
    expect(todayISO()).toBe("2026-11-11");
  });

  it("달력 날짜 계산은 월·연도 경계를 넘어도 정확", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-11-16", "2026-11-11")).toBe(5);
    expect(lastNDates(3, "2026-11-01")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("요일·표시 형식", () => {
    expect(weekdayOf("2026-11-11")).toBe(3);
    expect(formatKoreanDate("2026-11-11")).toBe("11월 11일 (수)");
    expect(formatKoreanDate("2026-11-11", false)).toBe("11월 11일");
  });
});

describe("저장 시각 (UTC ISO 8601)", () => {
  it("한국 시각을 UTC ISO로 변환", () => {
    expect(seoulDateTimeToISO("2026-11-11", 9, 10)).toBe("2026-11-11T00:10:00.000Z");
    expect(seoulDateTimeToISO("2026-11-11", 3)).toBe("2026-11-10T18:00:00.000Z");
  });

  it("v1의 시간대 없는 값은 한국 시각으로 해석", () => {
    expect(normalizeTimestamp("2026-11-11T09:10:00")).toBe("2026-11-11T00:10:00.000Z");
    expect(normalizeTimestamp("2026-11-11T09:10")).toBe("2026-11-11T00:10:00.000Z");
  });

  it("시간대가 있는 값은 UTC로 통일, 해석 불가 값은 그대로 보존", () => {
    expect(normalizeTimestamp("2026-11-11T00:20:00.000Z")).toBe("2026-11-11T00:20:00.000Z");
    expect(normalizeTimestamp("2026-11-11T09:20:00+09:00")).toBe("2026-11-11T00:20:00.000Z");
    expect(normalizeTimestamp("잘못된 값")).toBe("잘못된 값");
    expect(timestampValue("잘못된 값")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("화면 표시는 한국 시각", () => {
    expect(formatDateTime("2026-11-11T00:20:00.000Z")).toBe("11/11 09:20");
    expect(formatDateTime("2026-11-10T15:05:00.000Z")).toBe("11/11 00:05");
  });

  it("[버그 B1 회귀] 형식이 섞여 있어도 실제 시각 기준 최신순 정렬", () => {
    const items = [
      { id: "seed 09:10 (v1 형식)", createdAt: "2026-11-11T09:10:00" },
      { id: "new 09:20 (UTC Z)", createdAt: "2026-11-11T00:20:00.000Z" },
      { id: "seed 08:10 (v2)", createdAt: "2026-11-10T23:10:00.000Z" },
    ];
    expect(items.sort(byTimestampDesc((x) => x.createdAt)).map((x) => x.id)).toEqual([
      "new 09:20 (UTC Z)",
      "seed 09:10 (v1 형식)",
      "seed 08:10 (v2)",
    ]);
  });
});

describe("환자 화면 날짜 표시", () => {
  it("긴 날짜·요일, 기간용 날짜, 한국 시각", async () => {
    const { formatLongKoreanDate, formatDotDate, formatKoreanTime } = await import("./date");
    expect(formatLongKoreanDate("2026-11-15")).toBe("2026년 11월 15일 일요일");
    expect(formatLongKoreanDate("2026-11-15", false)).toBe("11월 15일 일요일");
    expect(formatDotDate("2026-11-09")).toBe("11.09");
    // UTC 11:10 → 한국 20:10
    expect(formatKoreanTime("2026-11-15T11:10:00.000Z")).toBe("오후 8:10");
    expect(formatKoreanTime("2026-11-14T23:05:00Z")).toBe("오전 8:05");
  });
});
