import { describe, expect, it } from "vitest";
import { createRateLimiter, withMinDuration } from "./rate-limit";

describe("요청 횟수 제한", () => {
  it("시간창 안에서 한도를 넘으면 거부, 시간창이 지나면 다시 허용", () => {
    let t = 0;
    const rl = createRateLimiter(3, 1000, () => t);
    expect([rl.hit("ip1"), rl.hit("ip1"), rl.hit("ip1"), rl.hit("ip1")]).toEqual([true, true, true, false]);
    expect(rl.hit("ip2")).toBe(true); // 키별로 분리
    t = 1001;
    expect(rl.hit("ip1")).toBe(true);
  });
});

describe("최소 응답 시간", () => {
  it("빨리 끝난 작업도 지정 시간 이상 걸림", async () => {
    const started = Date.now();
    expect(await withMinDuration(120, async () => "done")).toBe("done");
    expect(Date.now() - started).toBeGreaterThanOrEqual(110);
  });
});
