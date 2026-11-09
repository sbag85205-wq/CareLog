"use client";

import { Angry, CheckCircle2, Frown, Laugh, Meh, Save, Smile } from "lucide-react";
import { useState } from "react";
import { Button, ChoiceGroup, cn } from "@/components/ui/primitives";
import { repository } from "@/hooks/useCareLog";
import {
  CONDITION_FACE,
  DIGESTION_LABEL,
  FATIGUE_LABEL,
  MEAL_INTAKE_OPTIONS,
  SLEEP_LABEL,
  SYMPTOM_OPTIONS,
} from "@/lib/labels";
import type { CareMode, Digestion, HealthRecord, MealIntake, Scale5 } from "@/types";

const FACES = [Angry, Frown, Meh, Smile, Laugh];
const SCALE: Scale5[] = [1, 2, 3, 4, 5];

interface Props {
  patientId: string;
  date: string;
  mode: CareMode;
  existing?: HealthRecord;
  onSaved?: () => void;
  compact?: boolean;
}

/**
 * 오늘의 컨디션 기록 폼 (통원·입원 공용).
 * 같은 환자·날짜에 기록이 있으면 수정, 없으면 새로 저장합니다.
 * 부모에서 key를 바꿔 주면 초기값이 다시 설정됩니다.
 */
export function ConditionForm({ patientId, date, mode, existing, onSaved }: Props) {
  const [condition, setCondition] = useState<Scale5 | undefined>(existing?.condition);
  const [pain, setPain] = useState<number>(existing?.pain ?? 0);
  const [fatigue, setFatigue] = useState<Scale5 | undefined>(existing?.fatigue);
  const [sleep, setSleep] = useState<Scale5 | undefined>(existing?.sleep);
  const [mealIntake, setMealIntake] = useState<MealIntake | undefined>(existing?.mealIntake);
  const [digestion, setDigestion] = useState<Digestion | undefined>(existing?.digestion);
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms ?? []);
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [saved, setSaved] = useState(false);

  const missing = [
    !condition && "컨디션",
    !fatigue && "피로도",
    !sleep && "수면",
    mealIntake === undefined && "식사량",
    !digestion && "소화 상태",
  ].filter(Boolean) as string[];

  async function save() {
    if (missing.length) return;
    await repository.upsertHealthRecord({
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
    });
    setSaved(true);
    onSaved?.();
  }

  const toggleSymptom = (s: string) =>
    setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setSaved(false);
    setter(v);
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="오늘 컨디션" hint="1 매우 나쁨 · 5 매우 좋음">
        <ChoiceGroup
          ariaLabel="오늘 컨디션"
          value={condition}
          onChange={touch(setCondition)}
          options={SCALE.map((v) => {
            const Icon = FACES[v - 1];
            return {
              value: v,
              label: (
                <span className="flex flex-col items-center">
                  <Icon className="h-7 w-7" aria-hidden />
                  <span className="mt-1 text-sm">{v}점</span>
                </span>
              ),
              sub: CONDITION_FACE[v],
            };
          })}
        />
      </Field>

      <Field label="통증" hint="0 없음 · 10 매우 심함">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={pain}
            onChange={(e) => touch(setPain)(Number(e.target.value))}
            aria-label="통증 점수"
            className="h-3 flex-1 cursor-pointer accent-teal-500"
          />
          <span
            className={cn(
              "w-16 rounded-2xl py-2 text-center text-xl font-bold",
              pain >= 7 ? "bg-rose-50 text-rose-700" : pain >= 4 ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-700",
            )}
          >
            {pain}
          </span>
        </div>
        <div className="mt-1 flex justify-between px-1 text-xs text-slate-400">
          <span>0</span>
          <span>5</span>
          <span>10</span>
        </div>
      </Field>

      <div className="grid gap-6 lg:grid-cols-2">
        <Field label="피로도" hint="1 거의 없음 · 5 매우 많음">
          <ChoiceGroup
            ariaLabel="피로도"
            size="sm"
            columns="grid-cols-5"
            value={fatigue}
            onChange={touch(setFatigue)}
            options={SCALE.map((v) => ({ value: v, label: `${v}`, sub: FATIGUE_LABEL[v] }))}
          />
        </Field>
        <Field label="수면 상태" hint="1 매우 나쁨 · 5 매우 좋음">
          <ChoiceGroup
            ariaLabel="수면 상태"
            size="sm"
            columns="grid-cols-5"
            value={sleep}
            onChange={touch(setSleep)}
            options={SCALE.map((v) => ({ value: v, label: `${v}`, sub: SLEEP_LABEL[v] }))}
          />
        </Field>
      </div>

      <Field label="식사량">
        <ChoiceGroup
          ariaLabel="식사량"
          size="sm"
          columns="grid-cols-5"
          value={mealIntake}
          onChange={touch(setMealIntake)}
          options={MEAL_INTAKE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </Field>

      <Field label="소화 상태">
        <ChoiceGroup
          ariaLabel="소화 상태"
          size="sm"
          columns="grid-cols-3 sm:grid-cols-6"
          value={digestion}
          onChange={touch(setDigestion)}
          options={(Object.keys(DIGESTION_LABEL) as Digestion[]).map((k) => ({ value: k, label: DIGESTION_LABEL[k] }))}
        />
      </Field>

      <Field label="불편한 증상" hint="여러 개 선택 가능">
        <ChoiceGroup
          ariaLabel="불편한 증상"
          size="sm"
          columns="grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
          value={symptoms}
          onChange={touch(toggleSymptom)}
          options={SYMPTOM_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
      </Field>

      <Field label="메모">
        <textarea
          value={memo}
          onChange={(e) => touch(setMemo)(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="오늘 특별히 기억할 내용을 적어 주세요 (가상 데이터만 입력)"
          className="w-full rounded-2xl border-2 border-slate-200 p-3 text-base outline-none focus:border-teal-400"
        />
      </Field>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500" aria-live="polite">
          {saved ? (
            <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> 저장되었습니다 (이 브라우저에만 저장되는 데모 기록)
            </span>
          ) : missing.length ? (
            <>아직 선택하지 않은 항목: {missing.join(", ")}</>
          ) : (
            "모든 항목을 입력했어요"
          )}
        </p>
        <Button type="submit" size="lg" icon={Save} disabled={missing.length > 0}>
          {existing ? "기록 수정" : "기록 저장"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-base font-bold text-slate-800">{label}</span>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
