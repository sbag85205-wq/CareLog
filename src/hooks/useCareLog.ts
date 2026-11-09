"use client";

import { useSyncExternalStore } from "react";
import { repository } from "@/lib/repository";

const getServerSnapshot = () => null;

/**
 * 전체 데이터 스냅샷을 구독합니다. 서버 렌더링/첫 하이드레이션 시에는 null을 반환하므로
 * 호출 측에서 로딩 상태를 처리하세요.
 */
export function useCareLogData() {
  return useSyncExternalStore(repository.subscribe, repository.getSnapshot, getServerSnapshot);
}

export { repository };
