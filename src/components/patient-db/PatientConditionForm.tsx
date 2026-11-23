"use client";

import { useConditionDraft, type ConditionDraftProps } from "@/components/health/useConditionDraft";
import { Alert, CardHeading, ChipGroup, PButton, PCard, ScaleTiles, SegmentScale, TextArea } from "@/components/patient-ui/kit";
import { CONDITION_WORD, FATIGUE_WORD, SLEEP_WORD } from "@/components/patient-ui/labels";
import { DIGESTION_LABEL, MEAL_INTAKE_OPTIONS, SYMPTOM_OPTIONS } from "@/lib/labels";
import type { Digestion, Scale5 } from "@/types";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

const SCALE: Scale5[] = [1, 2, 3, 4, 5];

/**
 * 환자 DB 화면(/my)의 컨디션 기록 폼 — 저장·수정 로직은 데모 폼과 같은 useConditionDraft
 * aside: 저장 버튼 바로 위에 끼워 넣을 요소 (예: 최근 기록 카드)
 */
export function PatientConditionForm({ aside, ...props }: ConditionDraftProps & { aside?: ReactNode }) {
  const draft = useConditionDraft(props);
  const v = draft.values;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void draft.save();
      }}
    >
      <PCard tone="tint" aria-labelledby="cf-condition">
        <CardHeading id="cf-condition" title="오늘의 컨디션" sub="오늘은 몸과 마음이 어떤가요?" />
        <ScaleTiles
          ariaLabel="오늘 컨디션"
          value={v.condition}
          onChange={draft.set.condition}
          options={SCALE.map((s) => ({ value: s, label: CONDITION_WORD[s] }))}
        />
        <p className="mt-3 min-h-5 text-sm font-semibold text-brand-800" aria-live="polite">
          {v.condition ? (
            <span className="inline-flex items-center gap-1">
              <Check className="h-4 w-4" aria-hidden />
              {withObjectParticle(CONDITION_WORD[v.condition])} 선택했어요
            </span>
          ) : (
            <span className="font-medium text-ink-soft">숫자를 눌러 선택해 주세요</span>
          )}
        </p>
      </PCard>

      <PCard aria-labelledby="cf-body">
        <CardHeading id="cf-body" title="몸의 신호" />
        <div className="space-y-5">
          <SegmentScale label="통증" value={v.pain} max={10} zeroLabel="없음" onChange={draft.set.pain} />
          <SegmentScale
            label="피로도"
            value={v.fatigue}
            max={5}
            onChange={(n) => draft.set.fatigue(n as Scale5)}
            describe={(n) => FATIGUE_WORD[n]}
          />
          <Row label="수면">
            <ChipGroup
              ariaLabel="수면 상태"
              value={v.sleep}
              onChange={draft.set.sleep}
              options={SCALE.map((s) => ({ value: s, label: SLEEP_WORD[s] }))}
            />
          </Row>
        </div>
      </PCard>

      <PCard aria-labelledby="cf-meal">
        <CardHeading id="cf-meal" title="식사와 소화" />
        <div className="space-y-5">
          <Row label="식사량">
            <ChipGroup
              ariaLabel="식사량"
              value={v.mealIntake}
              onChange={draft.set.mealIntake}
              options={MEAL_INTAKE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Row>
          <Row label="소화">
            <ChipGroup
              ariaLabel="소화 상태"
              value={v.digestion}
              onChange={draft.set.digestion}
              options={(Object.keys(DIGESTION_LABEL) as Digestion[]).map((k) => ({ value: k, label: DIGESTION_LABEL[k] }))}
            />
          </Row>
        </div>
      </PCard>

      <PCard aria-labelledby="cf-symptom">
        <CardHeading id="cf-symptom" title="증상과 메모" />
        <ChipGroup
          ariaLabel="불편한 증상"
          value={v.symptoms}
          onChange={draft.set.toggleSymptom}
          options={SYMPTOM_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
        <p className="mt-2 mb-4 text-xs text-ink-soft">여러 개 선택할 수 있어요. 없으면 비워 두세요.</p>
        <TextArea
          label="메모"
          hideLabel
          value={v.memo}
          onChange={(e) => draft.set.memo(e.target.value)}
          rows={3}
          maxLength={500}
          counter
          placeholder="오늘 특별히 기억할 내용을 적어 주세요 (가상 데이터만 입력)"
        />
      </PCard>

      {aside}

      <div className="space-y-3 pt-1">
        <Alert>{draft.error}</Alert>
        <p className="text-center text-sm" aria-live="polite">
          {draft.saved ? (
            <span className="inline-flex items-center gap-1 font-bold text-brand-700">
              <Check className="h-4 w-4" aria-hidden /> 저장되었습니다. 다시 저장하면 수정돼요.
            </span>
          ) : draft.missing.length ? (
            <span className="text-ink-soft">아직 선택하지 않은 항목: {draft.missing.join(", ")}</span>
          ) : (
            <span className="text-ink-soft">모든 항목을 입력했어요</span>
          )}
        </p>
        <PButton type="submit" className="w-full" disabled={draft.missing.length > 0 || draft.pending}>
          {draft.pending ? "저장 중…" : draft.isEdit ? "기록 수정" : "기록 저장"}
        </PButton>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-start sm:gap-3">
      <span className="text-base font-bold text-ink sm:pt-2.5">{label}</span>
      {children}
    </div>
  );
}

/** 받침에 따라 을/를 */
function withObjectParticle(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasFinal ? "을" : "를"}`;
}
