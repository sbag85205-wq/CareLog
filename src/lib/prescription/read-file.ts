"use client";

/**
 * 처방전 사진·PDF → 텍스트 (모두 이 브라우저 안에서 처리 — 파일·전체 텍스트를 서버로 보내지 않음)
 * - 텍스트 PDF: PDF.js로 글자를 그대로 추출
 * - 스캔 PDF(글자가 거의 없음)·사진: 이미지로 그려서 Tesseract.js OCR (한국어+영어)
 *   ※ OCR 엔진·언어 데이터는 처음 한 번 공개 CDN에서 내려받습니다 (처방전 이미지는 보내지 않음)
 */

export type ReadMethod = "pdf-text" | "pdf-ocr" | "image-ocr";
export interface ReadProgress {
  stage: "pdf" | "ocr-load" | "ocr";
  /** 0~1 */
  ratio: number;
}
export interface ReadResult {
  text: string;
  method: ReadMethod;
  pages?: number;
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 5;
const MAX_IMAGE_SIDE = 2200;

export class PrescriptionReadError extends Error {}

export function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export async function readPrescriptionFile(file: File, onProgress: (p: ReadProgress) => void = () => {}): Promise<ReadResult> {
  if (file.size > MAX_FILE_BYTES) throw new PrescriptionReadError("파일이 너무 커요 (15MB 이하).");
  if (isPdf(file)) return readPdf(file, onProgress);
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(file.name)) {
    const canvas = await imageToCanvas(file);
    const text = await ocr([canvas], onProgress);
    return { text, method: "image-ocr" };
  }
  throw new PrescriptionReadError("사진(JPG·PNG 등) 또는 PDF 파일을 골라 주세요.");
}

/* ───────────── PDF ───────────── */

type TextItem = { str: string; transform: number[]; width?: number; height?: number };

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  }
  return pdfjs;
}

/**
 * 같은 높이(y)의 글자 조각을 한 줄로 — 표의 한 행이 한 줄이 되도록.
 * 조각 사이가 실제로 붙어 있으면(글꼴이 바뀌어 조각이 나뉜 경우) 띄어쓰기 없이 잇고, 떨어져 있으면 한 칸 띄움.
 */
export function itemsToLines(items: TextItem[]): string[] {
  const rows: { y: number; parts: { x: number; w: number; h: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const part = { x, w: it.width ?? 0, h: Math.abs(it.height ?? it.transform[3] ?? 10) || 10, s: it.str };
    const row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (row) row.parts.push(part);
    else rows.push({ y, parts: [part] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      const parts = r.parts.sort((a, b) => a.x - b.x);
      let line = "";
      let end = -Infinity;
      for (const p of parts) {
        const gap = p.x - end;
        const glued = line && gap < p.h * 0.25 && !/\s$/.test(line) && !/^\s/.test(p.s);
        line += (line && !glued ? " " : "") + (glued ? p.s : p.s.trim());
        end = p.x + p.w;
      }
      return line.replace(/\s+/g, " ").trim();
    });
}

async function readPdf(file: File, onProgress: (p: ReadProgress) => void): Promise<ReadResult> {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new PrescriptionReadError("PDF를 열지 못했어요. 암호가 걸려 있거나 손상된 파일일 수 있어요.");
  }
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const lines: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items as TextItem[]));
    onProgress({ stage: "pdf", ratio: i / pages });
  }
  const text = lines.join("\n");
  if (text.replace(/\s/g, "").length >= 20) return { text, method: "pdf-text", pages };

  // 글자가 거의 없음 → 스캔 PDF: 페이지를 이미지로 그려 OCR
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_IMAGE_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    canvases.push(canvas);
  }
  return { text: await ocr(canvases, onProgress), method: "pdf-ocr", pages };
}

/* ───────────── 이미지 ───────────── */

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrescriptionReadError("사진을 열지 못했어요. JPG·PNG 사진으로 다시 시도해 주세요.");
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/**
 * OCR 전처리: 회색조 → 자동 임계값(Otsu)으로 흑백 → 표의 긴 가로·세로 선 제거
 * (처방전 표 선이 글자로 잘못 읽히는 것을 막음)
 */
export function cleanForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const gray = new Uint8Array(W * H);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < W * H; i++) {
    const g = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    gray[i] = g;
    hist[g]++;
  }
  const threshold = otsu(hist, W * H);
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) dark[i] = gray[i] < threshold ? 1 : 0;
  const kill = new Uint8Array(W * H);
  const minRunX = Math.max(40, Math.round(W * 0.08));
  const minRunY = Math.max(30, Math.round(H * 0.05));
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && dark[y * W + x]) run++;
      else {
        if (run >= minRunX) for (let k = x - run; k < x; k++) kill[y * W + k] = 1;
        run = 0;
      }
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y <= H; y++) {
      if (y < H && dark[y * W + x]) run++;
      else {
        if (run >= minRunY) for (let k = y - run; k < y; k++) kill[k * W + x] = 1;
        run = 0;
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    const v = dark[i] && !kill[i] ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold + 1;
}

/* ───────────── OCR ───────────── */

async function ocr(canvases: HTMLCanvasElement[], onProgress: (p: ReadProgress) => void): Promise<string> {
  onProgress({ stage: "ocr-load", ratio: 0 });
  const { createWorker, PSM } = await import("tesseract.js");
  const { parsePrescriptionText } = await import("./parse");
  let page = 0;
  const worker = await createWorker(["kor", "eng"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress({ stage: "ocr", ratio: (page + m.progress) / canvases.length });
      else onProgress({ stage: "ocr-load", ratio: m.progress });
    },
  });
  try {
    const out: string[] = [];
    for (; page < canvases.length; page++) {
      const cleaned = cleanForOcr(canvases[page]);
      // 표 형태의 처방전: 한 덩어리 글로 읽기(PSM 6) → 약 줄이 하나도 없으면 자동 배치로 다시
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
      let text = (await worker.recognize(cleaned)).data.text;
      if (parsePrescriptionText(text).length === 0) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        const alt = (await worker.recognize(cleaned)).data.text;
        if (parsePrescriptionText(alt).length > 0) text = alt;
      }
      out.push(text);
    }
    return out.join("\n");
  } catch {
    throw new PrescriptionReadError("글자를 읽지 못했어요. 밝은 곳에서 처방전이 화면에 꽉 차게 다시 찍어 주세요.");
  } finally {
    await worker.terminate();
  }
}
