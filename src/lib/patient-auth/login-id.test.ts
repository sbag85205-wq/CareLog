import { describe, expect, it } from "vitest";
import { emailToLoginId, isValidLoginId, loginIdToEmail, normalizeLoginId } from "./login-id";

describe("환자 로그인 아이디", () => {
  it("대소문자·앞뒤 공백 무시", () => {
    expect(normalizeLoginId("  MinJung01 ")).toBe("minjung01");
    expect(loginIdToEmail(" MinJung01")).toBe("minjung01@id.carelog.invalid");
  });
  it("형식 검사", () => {
    for (const ok of ["kim1", "minjung.01", "park_s-h", "a234567890123456789z"]) expect(isValidLoginId(ok), ok).toBe(true);
    for (const bad of ["", "abc", "1kim", "kim--1", "kim.", "kim 01", "김민정", "a2345678901234567890x", "kim@x"]) expect(isValidLoginId(bad), bad).toBe(false);
  });
  it("Auth 이메일에서 아이디 추출 (이전 방식 계정은 null)", () => {
    expect(emailToLoginId("minjung01@id.carelog.invalid")).toBe("minjung01");
    expect(emailToLoginId("patient-1b2c@carelog.invalid")).toBeNull();
    expect(emailToLoginId(null)).toBeNull();
  });
});
