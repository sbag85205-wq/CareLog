"use client";

import { useState } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useRepository } from "@/hooks/repository-context";
import type { CareMode, Digestion, HealthRecord, MealIntake, Scale5 } from "@/types";

export interface ConditionDraftProps {
  patientId: string;
  date: string;
  mode: CareMode;
  existing?: HealthRecord;
  onSaved?: () => void;
}

/**
 * 컨디션 기록 입력 상태·저장 로직 (데모 폼과 환자 DB 화면 폼이 공유)
 * - 같은 환자·날짜에 기록이 있으면 수정, 없으면 새로 저장 (저장소의 upsertHealthRecord)
 * - 저장소는 RepositoryContext로 주입 (데모: localStorage / DB 모드: Supabase)
 * - 저장이 확정된 뒤에만 saved=true, 실패하면 입력값을 그대로 두고 오류 안내
 */
export function useConditionDraft({ patientId, date, mode, existing, onSaved }: ConditionDraftProps) {
  const [condition, setCondition] = useState<Scale5 | undefined>(existing?.condition);
  const [pain, setPain] = useState<number>(existing?.pain ?? 0);
  const [fatigue, setFatigue] = useState<Scale5 | undefined>(existing?.fatigue);
  const [sleep, setSleep] = useState<Scale5 | undefined>(existing?.sleep);
  const [mealIntake, setMealIntake] = useState<MealIntake | undefined>(existing?.mealIntake);
  const [digestion, setDigestion] = useState<Digestion | undefined>(existing?.digestion);
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms ?? []);
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [saved, setSaved] = useState(false);
  const saveAction = useAsyncAction();
  const repository = useRepository();

  const missing = [
    !condition && "컨디션",
    !fatigue && "피로도",
    !sleep && "수면",
    mealIntake === undefined && "식사량",
    !digestion && "소화 상태",
  ].filter(Boolean) as string[];

  async function save() {
    if (missing.length) return;
    const res = await saveAction.run(() =>
      repository.upsertHealthRecord({
        patientId,
        date,
        condition: condition!,
        pain,
        fatigue: fatigue!,
        sleep: sleep!,
        mealIntake: mealIntake!,
        digestion: digestion!,
        symptoms,
        memo: memo.trim(),
        recordedIn: existing?.recordedIn ?? mode,
      }),
    );
    if (!res.ok) return;
    setSaved(true);
    onSaved?.();
  }

  /** 입력을 바꾸면 "저장되었습니다" 표시를 지움 */
  const touch =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setSaved(false);
      setter(v);
    };

  const toggleSymptom = (s: string) =>
    setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return {
    values: { condition, pain, fatigue, sleep, mealIntake, digestion, symptoms, memo },
    set: {
      condition: touch(setCondition),
      pain: touch(setPain),
      fatigue: touch(setFatigue),
      sleep: touch(setSleep),
      mealIntake: touch(setMealIntake),
      digestion: touch(setDigestion),
      toggleSymptom: touch(toggleSymptom),
      memo: touch(setMemo),
    },
    missing,
    saved,
    save,
    pending: saveAction.pending,
    error: saveAction.error,
    isEdit: Boolean(existing),
  };
}
