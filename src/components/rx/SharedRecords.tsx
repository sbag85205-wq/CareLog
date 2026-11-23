"use client";

import { PCard, StatusPill } from "@/components/patient-ui/kit";
import { categoryLabel } from "@/lib/rx/categories";
import { dotDate, KIND_LABEL, SHARE_FIELD_LABEL, type SharedRecord } from "@/lib/rx/model";
import { TagPills } from "./RxParts";

/** 공유받은 기록 한 건 — 받은 항목만 있음 (없는 항목은 화면에도 없음) · 읽기 전용 */
export function SharedRecordCard({ r }: { r: SharedRecord }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-4" aria-label={`공유받은 기록: ${r.items.map((i) => i.name).join(", ")}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <StatusPill tone={r.kind === "otc" ? "ivory" : "outline"} className="!px-2.5 !py-0.5 !text-xs">
          {KIND_LABEL[r.kind]}
        </StatusPill>
        {dotDate(r.date)}
        {r.department !== undefined && r.department && ` · ${r.department}`}
        {r.clinic && ` · ${r.clinic}`}
      </p>
      <ul className="mt-2 space-y-1.5">
        {r.items.map((i, idx) => (
          <li key={idx}>
            <p className="font-bold text-ink">{i.name}</p>
            {(i.ingredients || i.strength) && (
              <p className="text-sm text-ink-soft">
                {[i.ingredients && `성분 ${i.ingredients}`, i.strength && `함량 ${i.strength}`].filter(Boolean).join(" · ")}
              </p>
            )}
            {i.howto && <p className="text-sm text-ink-soft">복용 방법 {i.howto}</p>}
            <p className="text-xs text-ink-soft">
              {i.categories
                .filter((c) => c !== "unclassified")
                .map(categoryLabel)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      {r.notes && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs font-bold text-brand-800">본인이 남긴 복용 경험</p>
          {r.notes.length === 0 && <p className="text-sm text-ink-soft">남긴 경험이 없어요.</p>}
          {r.notes.map((n, idx) => (
            <div key={idx} className="rounded-xl bg-ivory p-2.5 text-sm">
              <p className="text-xs text-ink-soft">
                {n.target}
                {n.takenOn && ` · ${dotDate(n.takenOn)}`}
              </p>
              <TagPills tags={n.tags} small />
              {n.memo && <p className="mt-1 text-ink">{n.memo}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[0.7rem] text-ink-soft">
        보이는 항목: 제품명·날짜{r.fields.length ? `, ${r.fields.map((f) => SHARE_FIELD_LABEL[f]).join(", ")}` : ""}
        {r.expiresAt ? ` · ${dotDate(r.expiresAt)}까지` : ""}
      </p>
    </article>
  );
}

/** 공유받은 사람 화면 — 공유받은 약 기록 목록 */
export function SharedRecordsList({ records }: { records: SharedRecord[] }) {
  return (
    <section aria-labelledby="g-rx" className="space-y-3">
      <div className="px-1">
        <h2 id="g-rx" className="text-xl font-bold text-ink">
          공유받은 약 기록
        </h2>
        <p className="text-sm text-ink-soft">상대가 고른 기록과 항목만 보여요. 읽기만 할 수 있어요. 약을 권하거나 판단하는 용도가 아니에요.</p>
      </div>
      {records.length === 0 ? (
        <PCard tone="ivory">
          <p className="text-sm text-ink-soft">공유받은 약 기록이 없어요.</p>
        </PCard>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.shareId}>
              <SharedRecordCard r={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
