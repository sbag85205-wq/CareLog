/**
 * 환자 화면용 쉬운 표현 (저장 값은 기존과 동일, 표시 문구만 다름)
 * 데모 화면·의료진 화면은 lib/labels.ts 의 표현을 그대로 사용합니다.
 */
export const CONDITION_WORD = ["", "힘들어요", "조금 지침", "보통", "좋아요", "아주 좋아요"] as const;
export const SLEEP_WORD = ["", "못 잤어요", "설쳤어요", "보통", "잘 잤어요", "푹 잤어요"] as const;
export const FATIGUE_WORD = ["", "거의 없음", "조금", "보통", "많음", "매우 많음"] as const;
