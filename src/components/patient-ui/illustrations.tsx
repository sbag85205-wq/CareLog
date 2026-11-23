"use client";

/**
 * CareLog Soft Glass 소품 — 기록 노트 · 약병 · 진료 기록지 · 몽글(마스코트) · 로고
 * matte clay 질감 · 왼쪽 위 광원 · 정면~3/4 시점 · 파스텔 톤 (디자인 2차 가이드)
 * 모두 직접 그린 SVG이며 장식용(aria-hidden)입니다. 인쇄에서는 숨김(no-print).
 * 쓰는 곳: 화면당 3D 1개(Hero 중간 크기, 그 외 소형). 카드·버튼·메뉴 아이콘은 2D 라인 아이콘(lucide).
 */
import { useId } from "react";
import { cn } from "@/components/ui/primitives";

type Props = { className?: string };

/** id 충돌 없는 그라데이션 이름 */
function useIds(...names: string[]) {
  const base = useId().replace(/:/g, "");
  return Object.fromEntries(names.map((n) => [n, `${base}-${n}`])) as Record<string, string>;
}

/** 로고: 둥근 사각형(블루→세이지) 위 구름 */
export function LogoMark({ className }: Props) {
  const id = useIds("bg", "hi");
  return (
    <svg viewBox="0 0 40 40" className={cn("no-print", className)} aria-hidden fill="none">
      <defs>
        <linearGradient id={id.bg} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6d8fd6" />
          <stop offset="1" stopColor="#6fae93" />
        </linearGradient>
        <linearGradient id={id.hi} x1="20" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id.bg})`} />
      <rect width="40" height="20" rx="11" fill={`url(#${id.hi})`} />
      <path
        d="M12.5 27.5h15.2a5 5 0 0 0 .6-9.96 6.6 6.6 0 0 0-12.7-1.3 4.7 4.7 0 0 0-3.1 11.26Z"
        fill="#fff"
      />
      <circle cx="17.6" cy="22.2" r="1.1" fill="#4f6ac6" />
      <circle cx="23" cy="22.2" r="1.1" fill="#4f6ac6" />
    </svg>
  );
}

export type MascotVariant = "default" | "happy" | "cheer" | "notebook";

/**
 * 몽글 — CareLog 대표 마스코트 (구름). 몸·윤곽선·볼터치·질감은 모든 변형이 같고, 표정·팔·소품만 다릅니다.
 * - default: 편안하게 웃는 기본 (홈 Hero)
 * - happy: 활짝 웃음 + 작은 체크 (약 등록이 실제로 저장된 뒤)
 * - cheer: 반짝이 + 두 팔 (오늘 정해 둔 시간대를 모두 기록했을 때)
 * - notebook: 작은 노트를 든 기록장 (기록이 하나도 없을 때)
 * 규칙: 장식 전용(aria-hidden) · 인쇄 제외(no-print) · 화면당 큰 마스코트 1개 · 불편 경험·주의사항·공유 권한·PDF에는 쓰지 않음.
 * animate: 완료 상태에서만 짧게 등장 (prefers-reduced-motion 이면 효과 없음 — globals.css .mascot-pop)
 */
export function CloudMascot({ className, variant = "default", animate = false }: Props & { variant?: MascotVariant; animate?: boolean }) {
  const id = useIds("body", "shine", "shadow", "note");
  const open = variant === "happy" || variant === "cheer";
  return (
    <svg
      viewBox="0 0 120 110"
      className={cn("no-print overflow-visible", animate && "mascot-pop", className)}
      aria-hidden
      focusable="false"
      fill="none"
      data-mascot={variant}
    >
      <defs>
        <linearGradient id={id.note} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ece7fd" />
          <stop offset="1" stopColor="#d6ccf7" />
        </linearGradient>
        <radialGradient id={id.body} cx="40%" cy="30%" r="75%">
          <stop stopColor="#ffffff" />
          <stop offset=".65" stopColor="#fdf9f1" />
          <stop offset="1" stopColor="#f3eadb" />
        </radialGradient>
        <radialGradient id={id.shine} cx="50%" cy="50%" r="50%">
          <stop stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id.shadow} cx="50%" cy="50%" r="50%">
          <stop stopColor="#8a99ad" stopOpacity=".28" />
          <stop offset="1" stopColor="#8a99ad" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="101" rx="34" ry="5" fill={`url(#${id.shadow})`} />
      <path d="M57 22c0-6 4-10 10-10" stroke="#a6cdea" strokeWidth="3.2" strokeLinecap="round" />
      {/* 팔: 기본·체크는 아래로, 응원은 위로, 노트는 노트를 잡음 */}
      {variant === "cheer" ? (
        <path d="M15 58l-8-11M105 58l8-11" stroke="#a6cdea" strokeWidth="3.2" strokeLinecap="round" />
      ) : variant !== "notebook" ? (
        <path d="M14 64l-4 9M106 64l4 9" stroke="#a6cdea" strokeWidth="3.2" strokeLinecap="round" />
      ) : null}
      <path
        d="M30 86h60c11 0 19-8 19-18 0-8-5-14-12-17 1-11-7-20-18-20-3 0-6 1-8 2-4-7-11-11-19-10-9 1-16 8-17 17-9 1-16 9-16 18 0 1 0 3 1 4-4 3-7 8-7 13 0 6 5 11 17 11Z"
        fill={`url(#${id.body})`}
        stroke="#a6cdea"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <ellipse cx="44" cy="40" rx="15" ry="8" fill={`url(#${id.shine})`} />
      <ellipse cx="46" cy="90" rx="8" ry="5.5" fill="#f6eee0" stroke="#a6cdea" strokeWidth="3" />
      <ellipse cx="74" cy="90" rx="8" ry="5.5" fill="#f6eee0" stroke="#a6cdea" strokeWidth="3" />
      <circle cx="48" cy="58" r="4.2" fill="#28343d" />
      <circle cx="72" cy="58" r="4.2" fill="#28343d" />
      <circle cx="49.4" cy="56.6" r="1.3" fill="#fff" />
      <circle cx="73.4" cy="56.6" r="1.3" fill="#fff" />
      {open ? (
        <>
          <path d="M54 64.2h12c0 4.2-2.7 6.8-6 6.8s-6-2.6-6-6.8Z" fill="#28343d" />
          <path d="M56.6 69.2c1-1.1 2.1-1.6 3.4-1.6s2.4.5 3.4 1.6c-1 .9-2.1 1.3-3.4 1.3s-2.4-.4-3.4-1.3Z" fill="#f3a296" />
        </>
      ) : (
        <path d="M55.5 66c2.6 2.4 6.4 2.4 9 0" stroke="#28343d" strokeWidth="2.6" strokeLinecap="round" />
      )}
      <ellipse cx="39" cy="66" rx="6" ry="3.6" fill="#f7b7a8" opacity=".55" />
      <ellipse cx="81" cy="66" rx="6" ry="3.6" fill="#f7b7a8" opacity=".55" />

      {variant === "notebook" && (
        <g>
          <rect x="43" y="71" width="34" height="23" rx="5" fill={`url(#${id.note})`} stroke="#b4a7ef" strokeWidth="2" />
          <rect x="49" y="78" width="22" height="2.6" rx="1.3" fill="#8f80dc" opacity=".55" />
          <rect x="49" y="84" width="15" height="2.6" rx="1.3" fill="#8f80dc" opacity=".55" />
          {/* 노트를 잡은 손 */}
          <ellipse cx="42" cy="82" rx="5" ry="4.2" fill="#f6eee0" stroke="#a6cdea" strokeWidth="2.6" />
          <ellipse cx="78" cy="82" rx="5" ry="4.2" fill="#f6eee0" stroke="#a6cdea" strokeWidth="2.6" />
        </g>
      )}
      {variant === "happy" && (
        <g>
          <circle cx="101" cy="29" r="11" fill="#76ac8e" stroke="#fff" strokeWidth="3" />
          <path d="M95.8 29.3l3.6 3.6 6.6-7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {variant === "cheer" && (
        <g>
          <path d="M18 12l2.2 5.8L26 20l-5.8 2.2L18 28l-2.2-5.8L10 20l5.8-2.2Z" fill="#f6cf6c" />
          <path d="M104 6l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6Z" fill="#b9aef2" />
          <circle cx="112" cy="26" r="2.2" fill="#a6cdea" />
          <circle cx="8" cy="34" r="1.8" fill="#b9aef2" />
        </g>
      )}
    </svg>
  );
}

/** 기록 노트 — 하트 맥박 표지 + 연필 (홈 Hero · 빈 경험 안내) */
export function NotebookIcon({ className }: Props) {
  const id = useIds("cover", "heart", "pencil", "page", "shadow", "gloss");
  return (
    <svg viewBox="0 0 160 160" className={cn("no-print", className)} aria-hidden fill="none">
      <defs>
        <linearGradient id={id.cover} x1="30" y1="20" x2="130" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f8c6bc" />
          <stop offset=".5" stopColor="#f0a698" />
          <stop offset="1" stopColor="#e28d80" />
        </linearGradient>
        <linearGradient id={id.heart} x1="60" y1="35" x2="100" y2="75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a9dcc0" />
          <stop offset="1" stopColor="#7fbf9c" />
        </linearGradient>
        <linearGradient id={id.pencil} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#f9dc8c" />
          <stop offset=".5" stopColor="#f6cf6c" />
          <stop offset="1" stopColor="#e9b84f" />
        </linearGradient>
        <linearGradient id={id.page} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fffaf0" />
          <stop offset="1" stopColor="#f3e8d4" />
        </linearGradient>
        <radialGradient id={id.shadow} cx="50%" cy="50%" r="50%">
          <stop stopColor="#7d8ca0" stopOpacity=".3" />
          <stop offset="1" stopColor="#7d8ca0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id.gloss} cx="30%" cy="20%" r="60%">
          <stop stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="82" cy="146" rx="48" ry="7" fill={`url(#${id.shadow})`} />
      <g transform="rotate(-8 80 80)">
        {/* 속지 */}
        <rect x="40" y="24" width="86" height="112" rx="12" fill={`url(#${id.page})`} stroke="#eadcc2" strokeWidth="2" />
        {/* 표지 */}
        <rect x="30" y="18" width="88" height="114" rx="13" fill={`url(#${id.cover})`} />
        <rect x="30" y="18" width="88" height="114" rx="13" fill={`url(#${id.gloss})`} />
        <rect x="30" y="18" width="15" height="114" rx="7.5" fill="#e79486" opacity=".7" />
        {/* 하트 + 맥박 */}
        <path
          d="M81 74c-15-9-22-17-22-26 0-7 5-12 11-12 5 0 8 3 11 7 3-4 6-7 11-7 6 0 11 5 11 12 0 9-7 17-22 26Z"
          fill={`url(#${id.heart})`}
        />
        <path d="M66 52h8l4-7 5 13 4-6h9" stroke="#fffdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* 메모 카드 */}
        <rect x="56" y="88" width="52" height="32" rx="7" fill="#fff8ec" />
        <circle cx="64" cy="97" r="3.2" fill="#8fc7a7" />
        <circle cx="64" cy="105" r="3.2" fill="#f0c27a" />
        <circle cx="64" cy="113" r="3.2" fill="#9cc8ee" />
        <rect x="71" y="95.5" width="26" height="3" rx="1.5" fill="#eadcc2" />
        <rect x="71" y="103.5" width="22" height="3" rx="1.5" fill="#eadcc2" />
        <rect x="71" y="111.5" width="18" height="3" rx="1.5" fill="#eadcc2" />
      </g>
      {/* 연필 */}
      <g transform="rotate(35 112 86)">
        <rect x="104" y="34" width="16" height="78" rx="4" fill={`url(#${id.pencil})`} />
        <rect x="107" y="38" width="3" height="70" rx="1.5" fill="#fff" opacity=".5" />
        <rect x="104" y="28" width="16" height="10" rx="3" fill="#f3e1bd" />
        <rect x="104" y="18" width="16" height="13" rx="5" fill="#f0a698" />
        <path d="M104 112h16l-8 16-8-16Z" fill="#f5dfc0" />
        <path d="M109.4 122.8h5.2L112 128l-2.6-5.2Z" fill="#46535e" />
      </g>
    </svg>
  );
}

/** 약병 — 블루 뚜껑 · 반투명 크림 병 (약 기록 빈 상태 · 등록 진입) */
export function BottleIcon({ className }: Props) {
  const id = useIds("cap", "body", "shadow", "gloss");
  return (
    <svg viewBox="0 0 160 160" className={cn("no-print", className)} aria-hidden fill="none">
      <defs>
        <linearGradient id={id.cap} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#9fc0ef" />
          <stop offset=".5" stopColor="#7ea6e6" />
          <stop offset="1" stopColor="#6a92d8" />
        </linearGradient>
        <linearGradient id={id.body} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#fffdf8" />
          <stop offset=".6" stopColor="#f7f1e6" />
          <stop offset="1" stopColor="#ebe2d2" />
        </linearGradient>
        <radialGradient id={id.shadow} cx="50%" cy="50%" r="50%">
          <stop stopColor="#7d8ca0" stopOpacity=".3" />
          <stop offset="1" stopColor="#7d8ca0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id.gloss} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="146" rx="42" ry="7" fill={`url(#${id.shadow})`} />
      <rect x="44" y="46" width="72" height="96" rx="18" fill={`url(#${id.body})`} stroke="#e6dccb" strokeWidth="2" />
      <rect x="52" y="54" width="10" height="78" rx="5" fill={`url(#${id.gloss})`} />
      <rect x="40" y="18" width="80" height="32" rx="10" fill={`url(#${id.cap})`} />
      {[50, 62, 74, 86, 98, 110].map((x) => (
        <rect key={x} x={x - 1.5} y="22" width="3" height="24" rx="1.5" fill="#fff" opacity=".28" />
      ))}
      <rect x="40" y="18" width="80" height="9" rx="4.5" fill="#fff" opacity=".25" />
      {/* 라벨 */}
      <rect x="54" y="76" width="52" height="38" rx="8" fill="#fff" />
      <rect x="62" y="85" width="22" height="4" rx="2" fill="#b9d8c6" />
      <rect x="62" y="94" width="34" height="3.5" rx="1.75" fill="#e4eaf0" />
      <rect x="62" y="102" width="28" height="3.5" rx="1.75" fill="#e4eaf0" />
      {/* 알약 */}
      <g transform="rotate(-30 122 126)">
        <rect x="108" y="119" width="30" height="14" rx="7" fill="#d9d2fb" />
        <rect x="123" y="119" width="15" height="14" rx="7" fill="#b9aef2" />
        <rect x="111" y="121.5" width="10" height="3" rx="1.5" fill="#fff" opacity=".6" />
      </g>
    </svg>
  );
}

/** 진료 기록지 — 클립보드 + 돋보기 (진료 준비 · 진료용 요약 카드) */
export function ClipboardIcon({ className }: Props) {
  const id = useIds("board", "paper", "clip", "lens", "shadow");
  return (
    <svg viewBox="0 0 160 160" className={cn("no-print", className)} aria-hidden fill="none">
      <defs>
        <linearGradient id={id.board} x1="30" y1="20" x2="130" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ddd6fb" />
          <stop offset="1" stopColor="#bfb3f1" />
        </linearGradient>
        <linearGradient id={id.paper} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fffdf9" />
          <stop offset="1" stopColor="#f6efe3" />
        </linearGradient>
        <linearGradient id={id.clip} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#b5d6f4" />
          <stop offset="1" stopColor="#86b4e2" />
        </linearGradient>
        <radialGradient id={id.lens} cx="35%" cy="30%" r="70%">
          <stop stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="1" stopColor="#dcecfb" stopOpacity=".55" />
        </radialGradient>
        <radialGradient id={id.shadow} cx="50%" cy="50%" r="50%">
          <stop stopColor="#7d8ca0" stopOpacity=".3" />
          <stop offset="1" stopColor="#7d8ca0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="146" rx="48" ry="7" fill={`url(#${id.shadow})`} />
      <g transform="rotate(-6 76 80)">
        <rect x="30" y="22" width="88" height="114" rx="13" fill={`url(#${id.board})`} />
        <rect x="38" y="32" width="72" height="96" rx="8" fill={`url(#${id.paper})`} />
        <rect x="56" y="14" width="36" height="16" rx="7" fill={`url(#${id.clip})`} />
        <rect x="60" y="16" width="20" height="4" rx="2" fill="#fff" opacity=".5" />
        {/* 십자 + 사람 */}
        <circle cx="54" cy="50" r="8" fill="#a9dcc0" />
        <path d="M54 45.5v9M49.5 50h9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="88" cy="46" r="5" fill="#f4b3a5" />
        <path d="M79 58c1-5 5-7 9-7s8 2 9 7" fill="#f4b3a5" />
        <rect x="46" y="68" width="40" height="4" rx="2" fill="#e4dccd" />
        <rect x="46" y="77" width="30" height="4" rx="2" fill="#e4dccd" />
        <path d="M46 102h10l4-8 6 16 5-10h12" stroke="#7fb0e0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* 돋보기 */}
      <path d="M118 120l18 18" stroke="#e48d7e" strokeWidth="9" strokeLinecap="round" />
      <circle cx="104" cy="106" r="20" fill={`url(#${id.lens})`} stroke="#f2b3a5" strokeWidth="6" />
      <path d="M94 98a12 12 0 0 1 9-6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
