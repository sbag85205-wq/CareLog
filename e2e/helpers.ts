import { expect, type Page } from "@playwright/test";

/**
 * 콘솔 오류 수집 — 각 테스트 끝에서 0건인지 확인
 * @param expectedHttpErrors 테스트가 일부러 돌려주는 HTTP 오류 상태 (브라우저의 "Failed to load resource" 기록만 제외)
 */
export function trackConsoleErrors(page: Page, expectedHttpErrors: number[] = []) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const expected = expectedHttpErrors.some((s) =>
      m.text().startsWith(`Failed to load resource: the server responded with a status of ${s} `),
    );
    if (!expected) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return {
    expectNone: () => expect(errors, errors.join("\n")).toEqual([]),
  };
}

/** 가상 네트워크 조건 설정 (개발 서버에서만 동작, 페이지 로드 전에 적용) */
export async function setDevFlags(page: Page, flags: { latencyMs?: number; failWrites?: boolean }) {
  await page.addInitScript((f) => {
    if (f.latencyMs !== undefined) localStorage.setItem("carelog.dev.latencyMs", String(f.latencyMs));
    if (f.failWrites !== undefined) localStorage.setItem("carelog.dev.failWrites", f.failWrites ? "1" : "0");
  }, flags);
}

export async function openApp(page: Page) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByText("님, 안녕하세요").waitFor();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

export const tab = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

export async function switchMode(page: Page, mode: "통원" | "입원") {
  await page.getByRole("radio", { name: new RegExp(`${mode} 모드`) }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`${mode} 모드`) })).toHaveAttribute("aria-checked", "true");
}

export async function switchRole(page: Page, role: "환자" | "의료진" | "보호자") {
  await page.getByRole("tab", { name: role }).click();
}
