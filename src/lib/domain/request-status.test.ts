import { describe, expect, it } from "vitest";
import { checkRequestTransition, nextRequestStatus } from "./request-status";

describe("생활 요청 상태 전이 (접수 → 직원 확인 → 처리 완료)", () => {
  it("정상 흐름만 허용", () => {
    expect(checkRequestTransition("received", "received", "acknowledged")).toEqual({ ok: true });
    expect(checkRequestTransition("acknowledged", "acknowledged", "completed")).toEqual({ ok: true });
    expect(nextRequestStatus("received")).toBe("acknowledged");
    expect(nextRequestStatus("acknowledged")).toBe("completed");
    expect(nextRequestStatus("completed")).toBeNull();
  });

  it("[버그 B2 회귀] 처리 완료 → 접수 역행 거부", () => {
    const r = checkRequestTransition("completed", "completed", "received");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("invalid_transition");
  });

  it("단계 건너뛰기·같은 상태 반복 거부", () => {
    expect(checkRequestTransition("received", "received", "completed").ok).toBe(false);
    expect(checkRequestTransition("acknowledged", "acknowledged", "acknowledged").ok).toBe(false);
    expect(checkRequestTransition("acknowledged", "acknowledged", "received").ok).toBe(false);
  });

  it("화면이 본 상태와 실제 상태가 다르면(중복 클릭) stale_state", () => {
    const r = checkRequestTransition("acknowledged", "received", "acknowledged");
    expect(r.ok === false && r.code).toBe("stale_state");
  });
});
