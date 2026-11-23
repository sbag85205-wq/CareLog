"use client";

import { MessageSquarePlus, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, ChipGroup, cn, PButton, PCard, TextArea } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/date";
import { suggestTags, summarize } from "@/lib/rx/experience-tagger";
import { dotDate, EXPERIENCE_TAGS, TAG_GROUP_LABEL, tagLabel, type Prescription, type RxNote, type TagGroup } from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { TagPills } from "./RxParts";

const toggle = (list: string[], t: string) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
const GROUP_TONE: Record<TagGroup, string> = { good: "text-brand-800", after: "text-blush-700", process: "text-blush-700", note: "text-ink-soft" };

/** 태그 고르기 — 도움이 된 점 · 복용 후 느낀 불편함 · 복용 과정의 불편함 (여러 개, 함께 선택 가능) */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2.5">
      {(Object.keys(EXPERIENCE_TAGS) as TagGroup[]).map((g) => (
        <div key={g}>
          <p className={cn("mb-1 text-xs font-bold", GROUP_TONE[g])}>{TAG_GROUP_LABEL[g]}</p>
          <ChipGroup
            ariaLabel={TAG_GROUP_LABEL[g]}
            value={value}
            onChange={(t) => onChange(toggle(value, t))}
            options={EXPERIENCE_TAGS[g].map((t) => ({ value: t as string, label: tagLabel(t) }))}
          />
        </div>
      ))}
    </div>
  );
}

function TargetPicker({
  value,
  onChange,
  items,
  kind,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; name: string }[];
  kind: Prescription["kind"];
}) {
  if (items.length <= 1 && kind === "otc") return null;
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-ink-soft">어느 약에 대한 기록인가요?</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base"
        aria-label="기록 대상"
      >
        <option value="">{kind === "otc" ? "이 등록 전체" : "처방 전체 (함께 먹은 약 모두 · 어느 약 때문인지 모를 때)"}</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 자동 정리 상자 — 규칙 기반 · 이 기기 안에서만, 원본 메모는 그대로 */
function SuggestBox({
  memo,
  tags,
  setTags,
  accepted,
  onAccept,
}: {
  memo: string;
  tags: string[];
  setTags: (t: string[]) => void;
  accepted: boolean;
  onAccept: (suggested: string[]) => void;
}) {
  const suggested = useMemo(() => suggestTags(memo), [memo]);
  if (!memo.trim()) return null;
  return (
    <div className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-3" aria-label="자동 정리 제안">
      <p className="flex items-center gap-1.5 text-sm font-bold text-brand-800">
        <Sparkles className="h-4 w-4" aria-hidden /> 자동 정리 제안
      </p>
      <p className="text-xs text-ink-soft">메모의 말을 규칙으로 읽어 태그를 제안해요 (이 기기 안에서만 · 외부 AI 사용 안 함). 제안은 확인 후 고칠 수 있어요.</p>
      {suggested.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">메모에서 고를 만한 태그를 찾지 못했어요. 아래에서 직접 골라 주세요.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TagPills tags={suggested} small />
          </div>
          <PButton
            size="sm"
            variant={accepted && suggested.every((t) => tags.includes(t)) ? "ghost" : "soft"}
            className="mt-2"
            onClick={() => {
              setTags([...new Set([...tags, ...suggested])]);
              onAccept(suggested);
            }}
          >
            {accepted && suggested.every((t) => tags.includes(t)) ? "제안을 담았어요 ✓" : "제안 태그 담기"}
          </PButton>
        </>
      )}
    </div>
  );
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 복용 경험 남기기 — 원본 메모 + 확인한 태그 + (선택) 자동 정리 */
export function NoteEditor({
  p,
  items,
  store,
  presetItemId = "",
  onSaved,
}: {
  p: Prescription;
  items: { id: string; name: string }[];
  store: RxStore;
  presetItemId?: string;
  onSaved?: () => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [target, setTarget] = useState(presetItemId || (p.kind === "otc" && items.length === 1 ? items[0].id : ""));
  const [takenOn, setTakenOn] = useState(todayLocal);
  const [accepted, setAccepted] = useState<string[] | null>(null);
  const [summary, setSummary] = useState("");
  const action = useAsyncAction();
  const itemName = items.find((i) => i.id === target)?.name;

  return (
    <PCard className="space-y-3" aria-label="복용 경험 남기기">
      <TargetPicker value={target} onChange={setTarget} items={items} kind={p.kind} />
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-soft">복용한 날 (모르면 비워 두세요)</span>
        <input
          type="date"
          value={takenOn}
          onChange={(e) => setTakenOn(e.target.value)}
          className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base"
          aria-label="복용한 날"
        />
      </label>
      <TextArea
        label="느낀 점 (자유롭게)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={3}
        maxLength={1000}
        counter
        placeholder="예: 지난번에 먹었을 때 속이 쓰렸어. (가상 데이터만 입력)"
      />
      <SuggestBox
        memo={memo}
        tags={tags}
        setTags={setTags}
        accepted={accepted !== null}
        onAccept={(s) => {
          setAccepted(s);
          setSummary(summarize(s, { itemName, wholeRecord: !target }));
        }}
      />
      <TagPicker value={tags} onChange={setTags} />
      {accepted && (
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-brand-800">자동 정리한 요약 (규칙 기반 · 고칠 수 있어요)</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            maxLength={500}
            aria-label="자동 정리한 요약"
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-[0.95rem] text-ink"
          />
        </label>
      )}
      <Alert>{action.error}</Alert>
      <PButton
        size="md"
        className="w-full"
        disabled={(tags.length === 0 && !memo.trim()) || action.pending}
        onClick={async () => {
          const r = await action.run(() =>
            store.addNote({
              prescriptionId: p.id,
              patientId: p.patientId,
              itemId: target || null,
              takenOn: /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn : null,
              tags,
              memo,
              suggestedTags: accepted ?? [],
              summary: accepted ? summary.trim() : "",
              summarySource: accepted && summary.trim() ? "rule" : "",
            }),
          );
          if (r.ok) {
            setTags([]);
            setMemo("");
            setAccepted(null);
            setSummary("");
            onSaved?.();
          }
        }}
      >
        복용 경험 저장
      </PButton>
    </PCard>
  );
}

/** 저장된 복용 경험 한 건 — 원본 메모와 자동 정리를 나눠서 표시 */
export function NoteCard({
  note: n,
  targetName,
  items,
  kind,
  store,
  onQuestion,
}: {
  note: RxNote;
  targetName: string;
  items: { id: string; name: string }[];
  kind: Prescription["kind"];
  store: RxStore | null;
  onQuestion?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState(n.tags);
  const [memo, setMemo] = useState(n.memo);
  const [summary, setSummary] = useState(n.summary);
  const [takenOn, setTakenOn] = useState(n.takenOn ?? "");
  const [target, setTarget] = useState(n.itemId ?? "");
  const action = useAsyncAction();
  const edited = n.updatedAt.slice(0, 16) !== n.createdAt.slice(0, 16);
  return (
    <PCard className="!p-4" aria-label={`복용 경험: ${targetName}`}>
      <p className="text-xs text-ink-soft">
        <span className="font-bold text-brand-800">환자가 직접 남긴 경험</span> · {targetName}
        {n.takenOn && ` · 복용한 날 ${dotDate(n.takenOn)}`} · 작성 {formatDateTime(n.createdAt)}
        {edited && ` · 수정 ${formatDateTime(n.updatedAt)}`}
      </p>
      {editing && store ? (
        <div className="mt-3 space-y-3">
          <TargetPicker value={target} onChange={setTarget} items={items} kind={kind} />
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-soft">복용한 날</span>
            <input
              type="date"
              value={takenOn}
              onChange={(e) => setTakenOn(e.target.value)}
              className="h-12 w-full rounded-xl border border-line bg-white px-3"
            />
          </label>
          <TagPicker value={tags} onChange={setTags} />
          <TextArea label="느낀 점 (원본 메모)" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} maxLength={1000} counter />
          {(n.summary || n.summarySource) && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-brand-800">자동 정리한 요약 (지우려면 비워 두세요)</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-xl border border-line bg-white px-3 py-2"
                aria-label="자동 정리한 요약"
              />
            </label>
          )}
          <Alert>{action.error}</Alert>
          <div className="flex gap-2">
            <PButton
              size="sm"
              disabled={(tags.length === 0 && !memo.trim()) || action.pending}
              onClick={async () => {
                const r = await action.run(() =>
                  store.updateNote(n.id, {
                    itemId: target || null,
                    tags,
                    memo,
                    takenOn: /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn : null,
                    summary: summary.trim(),
                  }),
                );
                if (r.ok) setEditing(false);
              }}
            >
              수정 저장
            </PButton>
            <PButton size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </PButton>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2">
            <TagPills tags={n.tags} />
          </div>
          {n.memo && (
            <div className="mt-2">
              <p className="text-[0.7rem] font-bold text-ink-soft">내가 쓴 메모 (원본)</p>
              <p className="break-words whitespace-pre-line text-ink">{n.memo}</p>
            </div>
          )}
          {n.summary && (
            <div className="mt-2 rounded-xl bg-brand-50 px-3 py-2" aria-label="자동 정리">
              <p className="flex items-center gap-1 text-[0.7rem] font-bold text-brand-800">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> 자동 정리 ({n.summarySource === "ai" ? "AI" : "규칙 기반"}) · 원본 메모는 그대로 보관
              </p>
              <p className="text-sm text-ink">{n.summary}</p>
            </div>
          )}
          {(store || onQuestion) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onQuestion && (
                <PButton size="sm" variant="soft" icon={MessageSquarePlus} onClick={onQuestion}>
                  다음 진료 질문에 담기
                </PButton>
              )}
              {store && (
                <>
                  <PButton size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                    수정
                  </PButton>
                  <PButton size="sm" variant="ghost" icon={Trash2} onClick={() => void action.run(() => store.deleteNote(n.id))} aria-label="복용 경험 삭제">
                    삭제
                  </PButton>
                </>
              )}
            </div>
          )}
          <Alert className="mt-2">{action.error}</Alert>
        </>
      )}
    </PCard>
  );
}
