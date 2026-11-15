import { describe, expect, it } from "vitest";
import {
  checkPasswordPolicy,
  formatLoginCode,
  generateLoginCode,
  isLoginCodeFormat,
  LOGIN_CODE_ALPHABET,
  normalizeLoginCode,
  parseBirthDate8,
} from "./rules";

describe("환자 코드", () => {
  it("발급 코드는 혼동 문자 없는 12자리, XXXX-XXXX-XXXX 형식, 매번 다름", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateLoginCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect([...normalizeLoginCode(c)].every((ch) => LOGIN_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(c).not.toMatch(/[01ILO]/);
      expect(isLoginCodeFormat(c)).toBe(true);
    }
  });

  it("입력 정규화: 소문자·공백·하이픈 허용", () => {
    expect(normalizeLoginCode(" abcd-efgh jkmn ")).toBe("ABCDEFGHJKMN");
    expect(formatLoginCode("abcdefghjkmn")).toBe("ABCD-EFGH-JKMN");
    expect(isLoginCodeFormat("abcd efgh jkmn")).toBe(true);
  });

  it("표시용 demo_code(P001)나 짧은 값은 로그인 코드가 아님", () => {
    expect(isLoginCodeFormat("P001")).toBe(false);
    expect(isLoginCodeFormat("ABCD-EFGH-JKM0")).toBe(false); // 0은 사용하지 않는 문자
  });
});

describe("생년월일 8자리", () => {
  const today = "2026-11-15";
  it("유효한 날짜만 YYYY-MM-DD로", () => {
    expect(parseBirthDate8("19800229", today)).toBe("1980-02-29"); // 윤년
    expect(parseBirthDate8("19840229", today)).toBe("1984-02-29");
    expect(parseBirthDate8("19830229", today)).toBeNull();
    expect(parseBirthDate8("19991301", today)).toBeNull();
    expect(parseBirthDate8("1999-01-01", today)).toBeNull();
    expect(parseBirthDate8("1999011", today)).toBeNull();
    expect(parseBirthDate8("18991231", today)).toBeNull();
    expect(parseBirthDate8("20261116", today)).toBeNull(); // 미래
  });
});

describe("비밀번호 규칙", () => {
  it("8~72자, 영문+숫자, 확인 일치", () => {
    expect(checkPasswordPolicy("abc12", "abc12")).toMatch(/8자 이상/);
    expect(checkPasswordPolicy("abcdefgh", "abcdefgh")).toMatch(/영문과 숫자/);
    expect(checkPasswordPolicy("12345678", "12345678")).toMatch(/영문과 숫자/);
    expect(checkPasswordPolicy("carelog26", "carelog27")).toMatch(/다릅니다/);
    expect(checkPasswordPolicy("a1".repeat(40), "a1".repeat(40))).toMatch(/72자/);
    expect(checkPasswordPolicy("carelog26", "carelog26")).toBeNull();
  });
  it("환자 코드를 비밀번호에 넣을 수 없음", () => {
    expect(checkPasswordPolicy("xABCDEFGHJKMN1", "xABCDEFGHJKMN1", "ABCD-EFGH-JKMN")).toMatch(/환자 코드/);
  });
});
