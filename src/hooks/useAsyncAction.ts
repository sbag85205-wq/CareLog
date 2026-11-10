"use client";

import { useCallback, useRef, useState } from "react";
import { toUserMessage } from "@/lib/errors";

/**
 * 저장 버튼용 비동기 작업 훅
 * - 실행 중에는 같은 작업을 다시 실행하지 않음 (연타·중복 제출 방지)
 * - 실패하면 사용자 안내 문구를 error로 제공
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    if (inFlight.current) return { ok: false };
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      return { ok: true, value: await task() };
    } catch (e) {
      setError(toUserMessage(e));
      return { ok: false };
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}
