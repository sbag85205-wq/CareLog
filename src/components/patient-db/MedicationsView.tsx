"use client";

import { Pencil, Pill, Plus, ScrollText, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { DrugSearch, type DrugItem } from "@/components/patient-db/DrugSearch";
import { PrescriptionImport } from "@/components/patient-db/PrescriptionImport";
import { Alert, Notice, PButton, PCard, SoftSheet, StatusPill, Switch, TextArea, TextField } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { MedicationInput, SupabaseRepository } from "@/lib/repository/supabase";
import type { Medication } from "@/types";

const EMPTY: MedicationInput = { name: "", dosage: "", schedule: "", caution: "", visibleToGuardian: false };

/**
 * 내 약 — 환자가 안내받은 약을 직접 기록 (가상 데이터, 식약처 API 연동 전)
 * editable=false: 의료진·보호자 읽기 전용 (보호자는 RLS가 공개 허용된 약만 돌려줌)
 */
export function MedicationsView({
  medications,
  patientId,
  repo,
  editable,
  title = "내 약",
  sub = "안내받은 약을 한곳에서 차분하게 확인해요.",
  demo = false,
}: {
  medications: Medication[];
  patientId: string;
  repo?: SupabaseRepository;
  editable: boolean;
  title?: string;
  sub?: string;
  /** 공개 데모: 예제 처방전 */
  demo?: boolean;
}) {
  const [editing, setEditing] = useState<{ id: string | null; input: MedicationInput } | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const action = useAsyncAction();

  return (
    <div className="space-y-5">
      <PageTitle
        title={title}
        sub={sub}
        action={
          editable && (
            <div className="flex flex-wrap gap-2">
              <PButton
                size="md"
                variant="secondary"
                icon={ScrollText}
                onClick={() => {
                  setImported(null);
                  setImporting(true);
                }}
              >
                {demo ? "예제 처방전 불러오기" : "처방전 불러오기"}
              </PButton>
              <PButton size="md" icon={Plus} onClick={() => setEditing({ id: null, input: EMPTY })}>
                약 추가
              </PButton>
            </div>
          )
        }
      />
      <PCard tone="tint">
        <p className="text-lg font-bold text-sage-900">복용 중인 약 {medications.length}개</p>
        <p className="mt-1 text-sm text-sage-800">
          가상 데이터예요. 실제 복용·변경·중단은 의료진과 상담해 주세요.
          {editable && " 보호자에게는 '보호자에게 공개'를 켠 약만 보여요."}
        </p>
      </PCard>
      <Alert>{action.error}</Alert>
      {imported !== null && !importing && <Notice>처방전에서 약 {imported}개를 등록했어요.</Notice>}

      {medications.length === 0 ? (
        <PCard tone="ivory">
          <p className="text-ink-soft">{editable ? "아직 등록한 약이 없어요. '약 추가'로 안내받은 약을 기록해 보세요." : "보여 줄 약이 없어요."}</p>
        </PCard>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="약 목록">
          {medications.map((m) => (
            <li key={m.id}>
              <PCard aria-label={m.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-lg font-bold break-words text-ink">
                      <Pill className="h-5 w-5 shrink-0 text-sage-600" aria-hidden />
                      {m.name}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">{[m.dosage, m.schedule].filter(Boolean).join(" · ") || "용량·복용 시간 미입력"}</p>
                    {m.source === "mfds" && <p className="mt-1 text-xs text-ink-soft">식약처 허가정보에서 선택한 제품</p>}
                  </div>
                  {!editable && m.visibleToGuardian && <StatusPill tone="outline">보호자 공개</StatusPill>}
                </div>
                {m.caution && <p className="mt-3 rounded-2xl bg-ivory px-4 py-3 text-sm break-words text-ink">{m.caution}</p>}
                {editable && repo && (
                  <div className="mt-4 space-y-2 border-t border-line pt-3">
                    <Switch
                      label="보호자에게 공개"
                      description="공유를 허용한 보호자만 볼 수 있어요"
                      checked={m.visibleToGuardian}
                      disabled={action.pending}
                      onChange={(v) => void action.run(() => repo.setMedicationVisibility(m.id, v))}
                    />
                    {confirmDelete === m.id ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-blush-50 p-3">
                        <span className="flex-1 text-sm font-semibold text-blush-700">이 약을 목록에서 삭제할까요?</span>
                        <PButton size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>
                          취소
                        </PButton>
                        <PButton
                          size="sm"
                          className="!bg-blush-700"
                          disabled={action.pending}
                          onClick={async () => {
                            const r = await action.run(() => repo.deleteMedication(m.id));
                            if (r.ok) setConfirmDelete(null);
                          }}
                        >
                          삭제
                        </PButton>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <PButton
                          size="sm"
                          variant="secondary"
                          icon={Pencil}
                          onClick={() =>
                            setEditing({ id: m.id, input: { name: m.name, dosage: m.dosage, schedule: m.schedule, caution: m.caution, externalItemSeq: m.externalItemSeq } })
                          }
                        >
                          수정
                        </PButton>
                        <PButton size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(m.id)} aria-label={`${m.name} 삭제`}>
                          삭제
                        </PButton>
                      </div>
                    )}
                  </div>
                )}
              </PCard>
            </li>
          ))}
        </ul>
      )}

      {editable && repo && (
        <SoftSheet open={importing} title={demo ? "예제 처방전 불러오기" : "처방전 불러오기"} onClose={() => setImporting(false)}>
          {importing && (
            <PrescriptionImport
              existing={medications}
              demo={demo}
              save={(inputs) => repo.addMedications(patientId, inputs)}
              onDone={(n) => setImported(n)}
            />
          )}
        </SoftSheet>
      )}
      {editable && repo && (
        <MedicationSheet
          state={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (!editing) return false;
            const r = await action.run(() =>
              editing.id ? repo.updateMedication(editing.id, input) : repo.addMedication(patientId, input),
            );
            return r.ok;
          }}
          pending={action.pending}
          error={action.error}
        />
      )}
    </div>
  );
}

function MedicationSheet({
  state,
  onClose,
  onSave,
  pending,
  error,
}: {
  state: { id: string | null; input: MedicationInput } | null;
  onClose: () => void;
  onSave: (i: MedicationInput) => Promise<boolean>;
  pending: boolean;
  error: string | null;
}) {
  return (
    <SoftSheet open={state !== null} title={state?.id ? "약 정보 수정" : "약 추가"} onClose={onClose}>
      {state && <MedicationForm key={state.id ?? "new"} initial={state.input} isNew={!state.id} onSave={onSave} onDone={onClose} pending={pending} error={error} />}
    </SoftSheet>
  );
}

function MedicationForm({
  initial,
  isNew,
  onSave,
  onDone,
  pending,
  error,
}: {
  initial: MedicationInput;
  isNew: boolean;
  onSave: (i: MedicationInput) => Promise<boolean>;
  onDone: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [v, setV] = useState(initial);
  // 식약처 검색으로 고른 제품 (약 이름만 채움). 이름을 직접 고치면 선택이 풀리고 직접 입력으로 저장
  const [picked, setPicked] = useState<DrugItem | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.name.trim()) return;
        if (await onSave(v)) onDone();
      }}
    >
      <PCard className="space-y-5">
        <DrugSearch
          onSelect={(it) => {
            setPicked(it);
            setV({ ...v, name: it.name.slice(0, 100), externalItemSeq: it.itemSeq || null });
          }}
        />
        {picked && (
          <Notice>
            선택한 제품: {picked.name} · {picked.company || "제조사 정보 없음"}
            {picked.category && ` · ${picked.category}`}
          </Notice>
        )}
        <TextField
          label="약 이름"
          value={v.name}
          maxLength={100}
          required
          onChange={(e) => {
            const name = e.target.value;
            if (picked && name !== picked.name.slice(0, 100)) setPicked(null);
            // 검색으로 고른 이름을 직접 고치면 품목기준코드를 지우고 직접 입력으로 저장
            const changedFromPick = picked ? name !== picked.name.slice(0, 100) : Boolean(v.externalItemSeq);
            setV({ ...v, name, ...(changedFromPick ? { externalItemSeq: null } : {}) });
          }}
          placeholder="검색하지 않고 직접 입력해도 돼요"
          helper="안내받은 약 이름을 그대로 적어 주세요."
        />
        <TextField label="1회 복용량 (안내받은 대로)" value={v.dosage} maxLength={50} onChange={(e) => setV({ ...v, dosage: e.target.value })} placeholder="예: 1회 1정" />
        <TextField label="복용 시간" value={v.schedule} maxLength={100} onChange={(e) => setV({ ...v, schedule: e.target.value })} placeholder="예: 아침 식후 30분" />
        <TextArea label="메모" value={v.caution} maxLength={500} counter rows={3} onChange={(e) => setV({ ...v, caution: e.target.value })} placeholder="예: 물과 함께 천천히 (가상 데이터만 입력)" />
        {isNew && (
          <Switch
            label="보호자에게 공개"
            description="기본은 비공개예요"
            checked={Boolean(v.visibleToGuardian)}
            onChange={(c) => setV({ ...v, visibleToGuardian: c })}
          />
        )}
      </PCard>
      <Alert>{error}</Alert>
      <PButton type="submit" className="w-full" disabled={!v.name.trim() || pending}>
        {pending ? "저장 중…" : isNew ? "약 추가" : "수정 저장"}
      </PButton>
    </form>
  );
}
