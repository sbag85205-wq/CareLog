"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Alert, cn, Notice, PButton, StatusPill } from "@/components/patient-ui/kit";

/** 서버(/api/medications/search)가 돌려주는 식약처 의약품 제품 허가정보 (응답에 있는 범위만) */
export interface DrugItem {
  itemSeq: string;
  name: string;
  company: string;
  ingredient: string;
  category: string;
  productType: string;
  permitDate: string;
  canceled: boolean;
}

const fmtDate = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d);

/**
 * 식약처 의약품 검색 — 고르면 약 이름만 채움 (1회 복용량·복용 시간은 환자가 안내받은 대로 직접 입력)
 * 결과가 없거나 검색이 실패해도 아래 칸에 직접 입력해 저장 가능
 */
export function DrugSearch({ onSelect }: { onSelect: (item: DrugItem) => void }) {
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ q: string; items: DrugItem[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const query = q.trim();
    if (pending || query.length < 2) {
      if (query.length < 2) setError("약 이름을 2자 이상 입력해 주세요.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/medications/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }), // 검색어는 본문으로 (주소·접근 로그에 남지 않게)
        credentials: "same-origin",
        cache: "no-store",
      });
      const r = (await res.json()) as { ok: boolean; message?: string; items?: DrugItem[]; total?: number };
      if (!r.ok) setError(r.message ?? "식약처 검색을 사용할 수 없어요. 약 이름을 직접 입력해 저장할 수 있어요.");
      else setResult({ q: query, items: r.items ?? [], total: r.total ?? 0 });
    } catch {
      setError("식약처 검색에 연결하지 못했어요. 약 이름을 직접 입력해 저장할 수 있어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-[1.25rem] bg-ivory p-4">
      <label htmlFor="drug-search" className="block text-base font-bold text-ink">
        식약처 의약품 검색 <span className="text-sm font-medium text-ink-soft">(선택)</span>
      </label>
      <p className="mt-1 text-xs text-ink-soft">제품을 고르면 약 이름이 채워져요. 복용량·복용 시간은 안내받은 대로 직접 입력해 주세요.</p>
      <div className="mt-3 flex gap-2">
        <input
          id="drug-search"
          type="search"
          value={q}
          maxLength={40}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // 바깥 약 저장 폼이 제출되지 않게
              void search();
            }
          }}
          placeholder="예: 타이레놀"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
        />
        <PButton size="md" icon={Search} className="!min-h-12 shrink-0" onClick={() => void search()} disabled={pending}>
          {pending ? "검색 중…" : "검색"}
        </PButton>
      </div>

      <Alert className="mt-3">{error}</Alert>
      {result && result.items.length === 0 && (
        <Notice className="mt-3">‘{result.q}’ 검색 결과가 없어요. 아래 약 이름 칸에 직접 입력해 저장할 수 있어요.</Notice>
      )}
      {result && result.items.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-ink-soft" aria-live="polite">
            {result.total > result.items.length
              ? `${result.total.toLocaleString()}건 중 ${result.items.length}건을 보여요. 제품명을 더 자세히 입력하면 찾기 쉬워요.`
              : `${result.items.length}건 찾았어요. 이름이 비슷하면 제조사·주성분·허가일을 확인해 주세요.`}
          </p>
          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="식약처 검색 결과">
            {result.items.map((it) => (
              <li key={`${it.itemSeq}-${it.name}-${it.company}`}>
                <article
                  aria-label={`${it.name} · ${it.company}`}
                  className={cn("rounded-2xl border border-line bg-white p-3", it.canceled && "opacity-70")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold break-words text-ink">{it.name}</p>
                      <p className="text-sm text-ink-soft">{it.company || "제조사 정보 없음"}</p>
                    </div>
                    <PButton size="sm" variant="soft" onClick={() => onSelect(it)} aria-label={`${it.name} (${it.company}) 선택`}>
                      선택
                    </PButton>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {it.category && <StatusPill tone={it.category.includes("전문") ? "outline" : "sage"}>{it.category}</StatusPill>}
                    {it.canceled && <StatusPill tone="warn">허가 취하</StatusPill>}
                    {it.productType && <StatusPill tone="ivory">{it.productType}</StatusPill>}
                  </div>
                  {it.ingredient && <p className="mt-2 line-clamp-2 text-sm text-ink">주성분: {it.ingredient}</p>}
                  <p className="mt-1 text-xs text-ink-soft">
                    {it.permitDate && `허가 ${fmtDate(it.permitDate)}`}
                    {it.itemSeq && ` · 품목기준코드 ${it.itemSeq}`}
                  </p>
                </article>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.7rem] text-ink-soft">출처: 식품의약품안전처 의약품 제품 허가정보 (공공데이터포털). 복용 여부·방법은 의료진 안내를 따르세요.</p>
        </div>
      )}
    </div>
  );
}
