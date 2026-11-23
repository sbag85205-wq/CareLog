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

/** 공개 데모(/demo) 열기 — 로그인 없이 환자 홈 */
export async function openApp(page: Page) {
  await hideDevOverlay(page);
  await page.goto("/demo", { waitUntil: "networkidle" });
  await page.getByText("님, 안녕하세요").first().waitFor();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

/** 화면 메뉴 (모바일 하단 탭 / PC 왼쪽 메뉴 — 보이는 쪽) */
export const menu = (page: Page, name: string) => page.getByRole("navigation", { name: "메뉴" }).getByRole("button", { name, exact: true });

/** 통원·입원 전환 (확인 창 포함) */
export async function switchMode(page: Page, mode: "통원" | "입원") {
  await page.getByRole("group", { name: "이용 모드" }).getByRole("button", { name: mode }).click();
  const dlg = page.getByRole("dialog", { name: `${mode} 모드로 바꾸기` });
  await dlg.getByRole("button", { name: `${mode}으로 바꾸기` }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText(`${mode} 중`, { exact: true })).toBeVisible();
}

export async function switchRole(page: Page, role: "환자" | "의료진" | "보호자") {
  await page.getByRole("tablist", { name: "데모 역할" }).getByRole("tab", { name: role }).click();
  await expect(page.getByRole("tablist", { name: "데모 역할" }).getByRole("tab", { name: role })).toHaveAttribute("aria-selected", "true");
}

/** 개발 서버의 Next.js 개발 도구 배지가 모바일 하단 메뉴(홈)를 가리지 않게 숨김 (테스트 전용) */
export async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const add = () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(st);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add);
  });
}
