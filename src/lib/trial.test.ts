import { describe, expect, it } from "vitest";
import { isTrialSite } from "./trial";

describe("공개 체험 사이트 표시", () => {
  it("값이 정확히 '1'일 때만 켜짐 (기존 배포는 값이 없어 꺼짐)", () => {
    expect(isTrialSite("1")).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes"]) expect(isTrialSite(v)).toBe(false);
  });
});
