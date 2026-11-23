/**
 * 공개 체험 사이트 표시 — carelog-public(Vercel) 에서만 NEXT_PUBLIC_CARELOG_TRIAL_NOTICE=1
 * 기존 carelog 배포에는 이 값이 없으므로 안내 띠가 나타나지 않음 (빌드할 때 값이 고정됨)
 */
export function isTrialSite(flag: string | undefined = process.env.NEXT_PUBLIC_CARELOG_TRIAL_NOTICE): boolean {
  return flag === "1";
}

export const TRIAL_NOTICE = "체험용 공개 사이트예요. 실제 이름·연락처·건강정보는 입력하지 마세요. 체험 기록은 정기적으로 지워져요.";
