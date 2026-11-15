"use client";

import { createContext, useContext } from "react";
import { repository as localRepository } from "@/lib/repository";
import type { CareLogRepository } from "@/lib/repository";

/**
 * 화면이 사용할 저장소. 기본값은 기존 가상 데이터 데모(localStorage) 저장소이며,
 * DB 모드 화면(/my)은 Supabase 저장소를 Provider로 넘깁니다.
 */
const RepositoryContext = createContext<CareLogRepository>(localRepository);

export const RepositoryProvider = RepositoryContext.Provider;

export function useRepository(): CareLogRepository {
  return useContext(RepositoryContext);
}
