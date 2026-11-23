/**
 * 기능 스위치
 * WARD: 병동 흐름(통원·입원 전환, 병동·호실, 식사, 생활 요청). 새 버전(처방 이력 중심)에서는 화면에서 숨김.
 * 코드와 DB 기록은 그대로 보존 — 다시 켜려면 true 로 바꾸면 됨.
 */
export const FEATURES = {
  WARD: false,
} as const;
