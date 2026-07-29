# Plan 1 — Nền tảng + pipeline sinh puzzle + màn chơi (local)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ra được app chạy hoàn chỉnh không cần backend: upload một tấm tranh → thuật toán cắt thành vùng có số → tinh chỉnh → tô tới 100%, tất cả lưu trong IndexedDB.

**Architecture:** Toàn bộ thuật toán nằm trong `src/core/` — TypeScript thuần, không DOM, không `window`, vào là mảng số ra là mảng số, nên test được bằng Vitest trong milliseconds. `src/worker/` là lớp mỏng bọc `core/` vào Web Worker. `src/render/` vẽ canvas theo layer và biết DOM nhưng không biết React. `src/ui/` là React. Pipeline 7 stage bắt buộc **deterministic**: cùng ảnh + cùng params ⇒ byte-identical.

**Tech Stack:** Vite · React · TypeScript · Vitest · fake-indexeddb · @testing-library/react · WebAudio · Web Worker · IndexedDB (`idb`)

**Spec:** [docs/superpowers/specs/2026-07-27-pokemon-color-by-number-design.md](../specs/2026-07-27-pokemon-color-by-number-design.md)

## Global Constraints

Mọi task đều phải tuân các ràng buộc này, không nhắc lại trong từng task:

- **Luật phụ thuộc `core/`**: file nào trong `src/core/` **không được** import từ `src/ui/`, `src/data/`, `src/render/`, `src/worker/`, và **không được** chạm `window`, `document`, `Image`, `Canvas`, `fetch`, `crypto`. Vi phạm là lỗi review, không phải góp ý.
- **Deterministic**: mọi hàm trong `core/` không dùng `Math.random()`, `Date.now()`, `new Date()`, hay thứ tự lặp của `Set`/`Map` phụ thuộc chèn không xác định. Cùng input ⇒ byte-identical output. Có test riêng chốt điều này (Task 15).
- **Gzip không thuộc `core/`**: `core/codec` trả về `Uint8Array` thô. Nén/giải nén bằng `CompressionStream`/`DecompressionStream` nằm ở `src/data/compress.ts` (Task 21).
- **Ngôn ngữ UI**: tiếng Việt, hardcode chuỗi, không dựng i18n.
- **Giá trị mặc định** (copy nguyên từ spec): `maxDim` 1400 (cho phép 800–2000) · `k` 12 (cho phép 6–24) · `smoothing` 2 lượt bilateral (cho phép 0–3) · bilateral σ_không_gian 3, σ_màu 25 · median 3×3 chạy 2 lượt · k-means cap 20 vòng · `mergeDeltaE` 6 · `minLabelRadius` 7px · gộp vùng vụn lặp tối đa 8 lượt rồi force-merge · bisection `minArea` tối đa 6 vòng, mục tiêu ±25% · timeout pipeline 60s · file upload tối đa 15 MB · cảnh báo khi > 2000 vùng hoặc < 20 vùng.
- **Preset**: Dễ = `k` 8, mục tiêu ~200 vùng · Vừa = `k` 12, ~500 vùng · Khó = `k` 16, ~1000 vùng.
- **Connectivity**: tách vùng dùng **4-hướng**, không phải 8-hướng.
- **Không có Undo khi tô** (đã chặn tô sai nên không thể sai). Chỉ có "Tô lại từ đầu".
- **Commit sau mỗi task**, message tiếng Việt theo Conventional Commits, kèm dòng `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Chạy test**: `npx vitest run <path>` cho một file, `npm test` cho toàn bộ. `npm run typecheck` phải xanh trước khi commit.

## File Structure

```
src/
  core/
    types.ts                        T2   toàn bộ type dùng chung của core
    color/srgb-lab.ts               T3   sRGB↔Lab
    color/delta-e.ts                T3   khoảng cách màu CIE76
    filters/median.ts               T4   median 3×3 khử noise
    filters/bilateral.ts            T5   làm phẳng gradient, giữ cạnh
    quantize/median-cut.ts          T6   khởi tạo centroid deterministic
    quantize/kmeans.ts              T7   k-means trong Lab
    quantize/quantize.ts            T7   API Stage 2, palette sort ổn định
    regions/connected-components.ts T8   gán nhãn 4-hướng, stack tường minh
    regions/adjacency.ts            T9   độ dài biên chung từng cặp vùng
    regions/merge-small.ts          T10  Stage 4 — núm chất lượng chính
    regions/distance-transform.ts   T11  chamfer 2 lượt
    regions/label-anchor.ts         T11  chỗ đặt số + bán kính nội tiếp
    regions/outline.ts              T12  mask viền 1px
    regions/region-runs.ts          T12  pixel-run mỗi vùng (để tô nhanh)
    codec/rle.ts                    T13  RLE theo dòng
    codec/bitset.ts                 T13  bitset tiến độ
    codec/puzzle-format.ts          T14  encode/decode nhị phân
    engine/paint-engine.ts          T16  trạng thái tô + tryPaint
    pipeline.ts                     T15  xâu Stage 0→7 + bisection minArea
  worker/
    protocol.ts                     T17  kiểu message worker ↔ UI
    generate.worker.ts              T17  vỏ mỏng gọi pipeline
  render/
    viewport.ts                     T18  transform, zoom, pan, fit
    layers.ts                       T19  layer base + outline
    label-layer.ts                  T19  vẽ số theo scale hiện tại
    highlight.ts                    T19  tint vùng chưa tô của màu đang chọn
  audio/synth.ts                    T20  WebAudio, không file asset
  data/
    compress.ts                     T21  gzip/gunzip
    decode-image.ts                 T21  file → RGBA (createImageBitmap)
    validate-upload.ts              T21  kiểm tra file trước khi nhận
    local-cache.ts                  T22  IndexedDB: puzzle, tiến độ, thumbnail
  ui/
    hooks/use-generate.ts           T23  gọi worker, theo dõi progress
    hooks/use-paint.ts              T25  bind PaintEngine vào React
    components/*                    T23–T27
  routes/
    new.tsx                         T23  upload + preview + tinh chỉnh
    play.tsx                        T25–T27
    library.tsx                     T28
  App.tsx                           T28  routing + shell
  main.tsx                          T1
```

---

### Task 1: Scaffold dự án + bộ test chạy được

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`
- Create: `src/core/__tests__/harness.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: script `npm test`, `npm run typecheck`, `npm run dev`, `npm run build`; alias `@/` → `src/`

- [ ] **Step 1: Tạo project bằng Vite**

```bash
cd d:/ss/pokemon-color
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom fake-indexeddb
npm install idb
```

Nếu Vite hỏi vì thư mục không rỗng, chọn **"Ignore files and continue"** (đang có `docs/` và `.git`).

- [ ] **Step 2: Cấu hình Vite + Vitest**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    setupFiles: [],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/routes/**', 'jsdom'],
      ['src/render/**', 'jsdom'],
      ['src/data/**', 'jsdom'],
      ['src/audio/**', 'jsdom'],
    ],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

Môi trường mặc định là `node` để test `core/` chạy nhanh nhất; chỉ những thư mục cần DOM mới dùng jsdom.

- [ ] **Step 3: Thêm script vào `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.app.json"
  }
}
```

- [ ] **Step 4: Thêm alias vào `tsconfig.app.json`**

Trong `compilerOptions`, thêm:

```json
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```

- [ ] **Step 5: Viết test smoke để chứng minh bộ test chạy**

`src/core/__tests__/harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('bộ test', () => {
  it('chạy được và có typed arrays', () => {
    const a = new Uint32Array([1, 2, 3])
    expect(Array.from(a)).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 6: Chạy test + typecheck**

Run: `npm test` → Expected: 1 passed
Run: `npm run typecheck` → Expected: không lỗi
Run: `npm run dev` rồi mở trang → Expected: trang mặc định Vite hiện ra, không lỗi console

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Vitest

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Type dùng chung của `core/`

**Files:**
- Create: `src/core/types.ts`
- Test: `src/core/__tests__/types.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: toàn bộ type mà Task 3–16 dùng. **Mọi task sau phải dùng đúng tên và đúng kiểu ở đây, không được tự đặt lại.**

- [ ] **Step 1: Viết file type**

`src/core/types.ts`:

```ts
/** sRGB 0..255 */
export type Rgb = readonly [number, number, number]
/** CIE Lab, L 0..100, a/b khoảng -128..127 */
export type Lab = readonly [number, number, number]

/** Ảnh RGBA phẳng, độ dài = width*height*4 */
export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Kết quả Stage 2 */
export interface QuantizeResult {
  /** độ dài width*height, giá trị 0..palette.length-1 */
  labels: Uint8Array
  /** đã sắp ổn định theo L, rồi a, rồi b tăng dần */
  palette: Rgb[]
}

export interface RegionMeta {
  id: number
  colorIndex: number
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** chỗ đặt số; -1 khi chưa tính (Stage 5 sẽ điền) */
  anchorX: number
  anchorY: number
  /** bán kính nội tiếp tại anchor, px */
  anchorR: number
  /** false ⇒ vùng quá nhỏ, không in số */
  hasLabel: boolean
}

/** Trường vùng: bản đồ pixel → id vùng, kèm metadata */
export interface RegionField {
  /** độ dài width*height, giá trị 0..regions.length-1 */
  regionMap: Uint32Array
  regions: RegionMeta[]
  width: number
  height: number
}

/** Pixel-run mỗi vùng, lưu phẳng để tô nhanh không cần quét cả ảnh */
export interface RegionRuns {
  /** độ dài regionCount+1; run của vùng i là [offsets[i], offsets[i+1]) */
  offsets: Uint32Array
  y: Uint32Array
  x0: Uint32Array
  /** bao gồm cả x1 (inclusive) */
  x1: Uint32Array
}

export interface PipelineParams {
  maxDim: number
  k: number
  /** 'auto' ⇒ dò bằng bisection để số vùng ≈ targetRegions */
  minArea: number | 'auto'
  targetRegions: number
  /** số lượt bilateral, 0..3 */
  smoothing: number
  mergeDeltaE: number
  minLabelRadius: number
}

export const DEFAULT_PARAMS: PipelineParams = {
  maxDim: 1400,
  k: 12,
  minArea: 'auto',
  targetRegions: 500,
  smoothing: 2,
  mergeDeltaE: 6,
  minLabelRadius: 7,
}

export type PresetName = 'de' | 'vua' | 'kho'

export const PRESETS: Record<PresetName, Pick<PipelineParams, 'k' | 'targetRegions'>> = {
  de: { k: 8, targetRegions: 200 },
  vua: { k: 12, targetRegions: 500 },
  kho: { k: 16, targetRegions: 1000 },
}

/** Puzzle hoàn chỉnh, đủ để chơi */
export interface Puzzle {
  width: number
  height: number
  palette: Rgb[]
  regionMap: Uint32Array
  regions: RegionMeta[]
  runs: RegionRuns
  /** mask viền 1px, độ dài width*height, giá trị 0 hoặc 255 */
  outline: Uint8Array
}

export type PipelineStage =
  | 'chuan-hoa'
  | 'lam-phang'
  | 'quantize'
  | 'tach-vung'
  | 'gop-vung-vun'
  | 'dat-so'
  | 've-vien'
  | 'dong-goi'

export const STAGE_LABELS: Record<PipelineStage, string> = {
  'chuan-hoa': 'Chuẩn hoá ảnh',
  'lam-phang': 'Làm phẳng',
  quantize: 'Gom màu',
  'tach-vung': 'Tách vùng',
  'gop-vung-vun': 'Gộp vùng vụn',
  'dat-so': 'Đặt số',
  've-vien': 'Vẽ viền',
  'dong-goi': 'Đóng gói',
}

export interface StageProgress {
  stage: PipelineStage
  /** 0..1 trong nội bộ stage, hoặc 1 khi stage xong */
  ratio: number
}

export type ProgressFn = (p: StageProgress) => void
```

- [ ] **Step 2: Viết test khoá các hằng số khỏi bị sửa vô tình**

`src/core/__tests__/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, PRESETS, STAGE_LABELS } from '@/core/types'

describe('hằng số mặc định', () => {
  it('khớp giá trị trong spec', () => {
    expect(DEFAULT_PARAMS).toEqual({
      maxDim: 1400,
      k: 12,
      minArea: 'auto',
      targetRegions: 500,
      smoothing: 2,
      mergeDeltaE: 6,
      minLabelRadius: 7,
    })
  })

  it('có đúng 3 preset khớp spec', () => {
    expect(PRESETS).toEqual({
      de: { k: 8, targetRegions: 200 },
      vua: { k: 12, targetRegions: 500 },
      kho: { k: 16, targetRegions: 1000 },
    })
  })

  it('có nhãn tiếng Việt cho đủ 8 stage', () => {
    expect(Object.keys(STAGE_LABELS)).toHaveLength(8)
  })
})
```

- [ ] **Step 3: Chạy test**

Run: `npx vitest run src/core/__tests__/types.test.ts`
Expected: 3 passed

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/core/__tests__/types.test.ts
git commit -m "feat(core): type và hằng số dùng chung

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Chuyển đổi màu sRGB ↔ Lab và khoảng cách màu

**Files:**
- Create: `src/core/color/srgb-lab.ts`, `src/core/color/delta-e.ts`
- Test: `src/core/color/__tests__/srgb-lab.test.ts`, `src/core/color/__tests__/delta-e.test.ts`

**Interfaces:**
- Consumes: `Rgb`, `Lab` (Task 2)
- Produces:
  - `rgbToLab(r: number, g: number, b: number): Lab`
  - `labToRgb(L: number, a: number, bb: number): Rgb`
  - `rgbaToLabArray(data: Uint8ClampedArray): Float32Array` — độ dài `data.length/4*3`
  - `deltaE76(a: Lab, b: Lab): number`

**Vì sao Lab:** khoảng cách trong RGB không phản ánh cảm nhận mắt người, nên quantize trong RGB sẽ gom sai màu. Toàn bộ Stage 2 và ngưỡng `mergeDeltaE` làm việc trong Lab.

- [ ] **Step 1: Viết test cho srgb-lab**

`src/core/color/__tests__/srgb-lab.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { labToRgb, rgbToLab, rgbaToLabArray } from '@/core/color/srgb-lab'

describe('rgbToLab', () => {
  it('trắng → L=100, a=0, b=0', () => {
    const [L, a, b] = rgbToLab(255, 255, 255)
    expect(L).toBeCloseTo(100, 1)
    expect(a).toBeCloseTo(0, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  it('đen → L=0', () => {
    const [L, a, b] = rgbToLab(0, 0, 0)
    expect(L).toBeCloseTo(0, 1)
    expect(a).toBeCloseTo(0, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  it('đỏ thuần → giá trị D65 đã biết', () => {
    const [L, a, b] = rgbToLab(255, 0, 0)
    expect(L).toBeCloseTo(53.24, 1)
    expect(a).toBeCloseTo(80.09, 1)
    expect(b).toBeCloseTo(67.2, 1)
  })

  it('xanh lá thuần → giá trị D65 đã biết', () => {
    const [L, a, b] = rgbToLab(0, 255, 0)
    expect(L).toBeCloseTo(87.73, 1)
    expect(a).toBeCloseTo(-86.18, 1)
    expect(b).toBeCloseTo(83.18, 1)
  })
})

describe('labToRgb', () => {
  it('đi vòng về đúng giá trị gốc', () => {
    for (const rgb of [
      [255, 255, 255],
      [0, 0, 0],
      [255, 0, 0],
      [12, 200, 77],
      [128, 128, 128],
    ] as const) {
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2])
      const back = labToRgb(lab[0], lab[1], lab[2])
      expect(back[0]).toBeCloseTo(rgb[0], 0)
      expect(back[1]).toBeCloseTo(rgb[1], 0)
      expect(back[2]).toBeCloseTo(rgb[2], 0)
    }
  })

  it('kẹp về 0..255 khi Lab nằm ngoài gamut', () => {
    const out = labToRgb(50, 120, -120)
    for (const c of out) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
})

describe('rgbaToLabArray', () => {
  it('trả về 3 kênh cho mỗi pixel, bỏ qua alpha', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255])
    const lab = rgbaToLabArray(data)
    expect(lab).toHaveLength(6)
    expect(lab[0]).toBeCloseTo(53.24, 1)
    expect(lab[3]).toBeCloseTo(0, 1)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là nó fail**

Run: `npx vitest run src/core/color`
Expected: FAIL — `Failed to resolve import "@/core/color/srgb-lab"`

- [ ] **Step 3: Implement srgb-lab**

`src/core/color/srgb-lab.ts`:

```ts
import type { Lab, Rgb } from '@/core/types'

// Điểm trắng D65
const XN = 95.047
const YN = 100.0
const ZN = 108.883

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, Math.round(s * 255)))
}

function fLab(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function fLabInv(t: number): number {
  const t3 = t * t * t
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const rl = srgbToLinear(r) * 100
  const gl = srgbToLinear(g) * 100
  const bl = srgbToLinear(b) * 100

  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / XN
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / YN
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / ZN

  const fx = fLab(x)
  const fy = fLab(y)
  const fz = fLab(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToRgb(L: number, a: number, bb: number): Rgb {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - bb / 200

  const x = (fLabInv(fx) * XN) / 100
  const y = (fLabInv(fy) * YN) / 100
  const z = (fLabInv(fz) * ZN) / 100

  const rl = x * 3.2406 + y * -1.5372 + z * -0.4986
  const gl = x * -0.9689 + y * 1.8758 + z * 0.0415
  const bl = x * 0.0557 + y * -0.204 + z * 1.057

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)]
}

/** Chuyển cả ảnh RGBA sang Lab phẳng [L,a,b, L,a,b, ...]. Bỏ qua alpha. */
export function rgbaToLabArray(data: Uint8ClampedArray): Float32Array {
  const n = data.length / 4
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const [L, a, b] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    out[i * 3] = L
    out[i * 3 + 1] = a
    out[i * 3 + 2] = b
  }
  return out
}
```

- [ ] **Step 4: Viết test cho delta-e**

`src/core/color/__tests__/delta-e.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deltaE76 } from '@/core/color/delta-e'

describe('deltaE76', () => {
  it('màu giống nhau → 0', () => {
    expect(deltaE76([50, 10, -20], [50, 10, -20])).toBe(0)
  })

  it('là khoảng cách Euclid trong Lab', () => {
    expect(deltaE76([50, 0, 0], [53, 4, 0])).toBeCloseTo(5, 6)
  })

  it('đối xứng', () => {
    const a = [30, -12, 44] as const
    const b = [61, 8, -3] as const
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10)
  })
})
```

- [ ] **Step 5: Implement delta-e**

`src/core/color/delta-e.ts`:

```ts
import type { Lab } from '@/core/types'

/**
 * CIE76 — khoảng cách Euclid trong Lab.
 * Đủ cho việc gom màu ở Stage 2 và ngưỡng mergeDeltaE ở Stage 4;
 * không cần CIEDE2000 vì ta so sánh các màu palette cách nhau khá xa.
 */
export function deltaE76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/core/color`
Expected: all passed (10 tests)

- [ ] **Step 7: Commit**

```bash
git add src/core/color
git commit -m "feat(core): chuyển đổi sRGB↔Lab và khoảng cách màu CIE76

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Median filter 3×3 (Stage 1, phần khử noise)

**Files:**
- Create: `src/core/filters/median.ts`
- Test: `src/core/filters/__tests__/median.test.ts`

**Interfaces:**
- Consumes: `RgbaImage` (Task 2)
- Produces: `median3x3(img: RgbaImage, passes: number): RgbaImage` — trả ảnh mới, không sửa input

**Vì sao cần:** noise JPEG và dithering làm Stage 3 nổ ra hàng nghìn blob 1-pixel. Median diệt sạch nhiễu muối tiêu mà không làm nhoè cạnh như box blur.

- [ ] **Step 1: Viết test**

`src/core/filters/__tests__/median.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { median3x3 } from '@/core/filters/median'
import type { RgbaImage } from '@/core/types'

function solid(w: number, h: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { data, width: w, height: h }
}

function px(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

describe('median3x3', () => {
  it('xoá pixel nhiễu đơn lẻ trong vùng phẳng', () => {
    const img = solid(5, 5, [10, 20, 30])
    const c = (2 * 5 + 2) * 4
    img.data[c] = 250
    img.data[c + 1] = 250
    img.data[c + 2] = 250

    const out = median3x3(img, 1)
    expect(px(out, 2, 2)).toEqual([10, 20, 30])
  })

  it('không đổi vùng hoàn toàn phẳng', () => {
    const img = solid(4, 4, [77, 88, 99])
    const out = median3x3(img, 2)
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
  })

  it('giữ cạnh dọc sắc nét', () => {
    const img = solid(6, 6, [0, 0, 0])
    for (let y = 0; y < 6; y++) {
      for (let x = 3; x < 6; x++) {
        const i = (y * 6 + x) * 4
        img.data[i] = 255
        img.data[i + 1] = 255
        img.data[i + 2] = 255
      }
    }
    const out = median3x3(img, 1)
    expect(px(out, 2, 3)).toEqual([0, 0, 0])
    expect(px(out, 3, 3)).toEqual([255, 255, 255])
  })

  it('không sửa ảnh input', () => {
    const img = solid(4, 4, [5, 5, 5])
    img.data[0] = 200
    const before = Array.from(img.data)
    median3x3(img, 1)
    expect(Array.from(img.data)).toEqual(before)
  })

  it('passes = 0 trả về bản sao y nguyên', () => {
    const img = solid(3, 3, [1, 2, 3])
    img.data[4] = 199
    const out = median3x3(img, 0)
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
    expect(out.data).not.toBe(img.data)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/filters/__tests__/median.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

> ⚠️ Bản `median3x3` dưới đây lấy median **từng kênh độc lập** (marginal median) và vì vậy **bịa ra màu chưa từng tồn tại trong ảnh gốc** ở biên hai vùng màu — xem Task 30 ("Median không được bịa màu") để biết chi tiết và bản sửa (snap về màu gốc trong cửa sổ, chữ ký hàm không đổi).

`src/core/filters/median.ts`:

```ts
import type { RgbaImage } from '@/core/types'

/** median của 9 phần tử bằng mạng sắp xếp cục bộ — nhanh hơn sort() */
function median9(v: number[]): number {
  v.sort((a, b) => a - b)
  return v[4]
}

/**
 * Median 3×3 từng kênh, biên kẹp (clamp) toạ độ.
 * Alpha giữ nguyên vì Stage 0 đã ghép alpha lên nền trắng.
 */
export function median3x3(img: RgbaImage, passes: number): RgbaImage {
  const { width: w, height: h } = img
  let src = new Uint8ClampedArray(img.data)

  for (let p = 0; p < passes; p++) {
    const dst = new Uint8ClampedArray(src)
    const buf: number[] = new Array(9)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy))
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx))
              buf[n++] = src[(yy * w + xx) * 4 + c]
            }
          }
          dst[(y * w + x) * 4 + c] = median9(buf)
        }
      }
    }
    src = dst
  }

  return { data: src, width: w, height: h }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/filters/__tests__/median.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/filters/median.ts src/core/filters/__tests__/median.test.ts
git commit -m "feat(core): median filter 3x3 khử noise

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bilateral filter (Stage 1, phần làm phẳng gradient)

**Files:**
- Create: `src/core/filters/bilateral.ts`
- Test: `src/core/filters/__tests__/bilateral.test.ts`

**Interfaces:**
- Consumes: `RgbaImage` (Task 2)
- Produces: `bilateral(img: RgbaImage, passes: number, sigmaSpace?: number, sigmaColor?: number): RgbaImage` — mặc định `sigmaSpace = 3`, `sigmaColor = 25`

**Vì sao cần:** bầu trời/nước/bóng đổ trong tranh là gradient mượt. Nếu không làm phẳng, quantize sẽ cắt gradient thành hàng chục dải mỏng và Stage 3 ra vùng vụn hình dải băng. Bilateral làm phẳng gradient **mà không phá cạnh**, vì trọng số giảm theo cả khoảng cách không gian lẫn khác biệt màu.

- [ ] **Step 1: Viết test**

`src/core/filters/__tests__/bilateral.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bilateral } from '@/core/filters/bilateral'
import type { RgbaImage } from '@/core/types'

function make(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

function px(img: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

describe('bilateral', () => {
  it('không đổi vùng hoàn toàn phẳng', () => {
    const img = make(8, 8, () => [100, 110, 120])
    const out = bilateral(img, 1)
    expect(px(out, 4, 4)).toEqual([100, 110, 120])
  })

  it('giữ độ tương phản của cạnh mạnh', () => {
    // nửa trái đen, nửa phải trắng
    const img = make(16, 16, (x) => (x < 8 ? [0, 0, 0] : [255, 255, 255]))
    const out = bilateral(img, 2)
    const left = px(out, 6, 8)[0]
    const right = px(out, 9, 8)[0]
    // giữ được > 90% tương phản gốc
    expect(right - left).toBeGreaterThan(255 * 0.9)
  })

  it('làm phẳng gradient thoải: độ lệch giữa 2 pixel kề giảm', () => {
    // gradient dốc 1 đơn vị mỗi pixel theo x
    const img = make(32, 8, (x) => [x * 4, x * 4, x * 4])
    const out = bilateral(img, 3, 3, 25)

    let before = 0
    let after = 0
    for (let x = 8; x < 24; x++) {
      before += Math.abs(px(img, x + 1, 4)[0] - px(img, x, 4)[0])
      after += Math.abs(px(out, x + 1, 4)[0] - px(out, x, 4)[0])
    }
    expect(after).toBeLessThan(before)
  })

  it('không sửa ảnh input', () => {
    const img = make(6, 6, (x, y) => [x * 10, y * 10, 50])
    const before = Array.from(img.data)
    bilateral(img, 2)
    expect(Array.from(img.data)).toEqual(before)
  })

  it('passes = 0 trả bản sao y nguyên', () => {
    const img = make(4, 4, (x) => [x, x, x])
    const out = bilateral(img, 0)
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
    expect(out.data).not.toBe(img.data)
  })

  it('deterministic', () => {
    const img = make(20, 20, (x, y) => [(x * 7 + y * 3) % 256, (x * 11) % 256, (y * 13) % 256])
    const a = bilateral(img, 2)
    const b = bilateral(img, 2)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/filters/__tests__/bilateral.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/filters/bilateral.ts`:

```ts
import type { RgbaImage } from '@/core/types'

/**
 * Bilateral filter trên RGB.
 * Trọng số = gauss(khoảng cách không gian) * gauss(khác biệt màu).
 * Bán kính = ceil(2*sigmaSpace) — quá 2σ thì trọng số không còn đáng kể.
 *
 * Chạy trên RGB (không phải Lab) là có chủ ý: sigmaColor 25 được hiệu chỉnh
 * theo thang 0..255, và đây là bước tiền xử lý nên không cần đúng cảm nhận
 * màu như Stage 2.
 */
export function bilateral(
  img: RgbaImage,
  passes: number,
  sigmaSpace = 3,
  sigmaColor = 25,
): RgbaImage {
  const { width: w, height: h } = img
  let src = new Uint8ClampedArray(img.data)
  if (passes <= 0) return { data: src, width: w, height: h }

  const radius = Math.max(1, Math.ceil(sigmaSpace * 2))
  const size = radius * 2 + 1

  // bảng trọng số không gian, tính trước
  const spatial = new Float32Array(size * size)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      spatial[(dy + radius) * size + (dx + radius)] =
        Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace))
    }
  }

  // bảng trọng số màu theo bình phương khác biệt, tính trước cho 0..255*255*3
  const colorLut = new Float32Array(256 * 3)
  for (let d = 0; d < colorLut.length; d++) {
    colorLut[d] = Math.exp(-(d * d) / (2 * sigmaColor * sigmaColor))
  }

  for (let p = 0; p < passes; p++) {
    const dst = new Uint8ClampedArray(src.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ci = (y * w + x) * 4
        const cr = src[ci]
        const cg = src[ci + 1]
        const cb = src[ci + 2]

        let sr = 0
        let sg = 0
        let sb = 0
        let sw = 0

        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue

            const ni = (yy * w + xx) * 4
            const nr = src[ni]
            const ng = src[ni + 1]
            const nb = src[ni + 2]

            // khác biệt màu dùng khoảng cách Chebyshev để tra LUT 1 chiều
            const diff = Math.max(
              Math.abs(nr - cr),
              Math.abs(ng - cg),
              Math.abs(nb - cb),
            )

            const wgt =
              spatial[(dy + radius) * size + (dx + radius)] * colorLut[diff]

            sr += nr * wgt
            sg += ng * wgt
            sb += nb * wgt
            sw += wgt
          }
        }

        dst[ci] = Math.round(sr / sw)
        dst[ci + 1] = Math.round(sg / sw)
        dst[ci + 2] = Math.round(sb / sw)
        dst[ci + 3] = src[ci + 3]
      }
    }
    src = dst
  }

  return { data: src, width: w, height: h }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/filters/__tests__/bilateral.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/filters/bilateral.ts src/core/filters/__tests__/bilateral.test.ts
git commit -m "feat(core): bilateral filter làm phẳng gradient giữ cạnh

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Median-cut (khởi tạo centroid deterministic cho Stage 2)

**Files:**
- Create: `src/core/quantize/median-cut.ts`
- Test: `src/core/quantize/__tests__/median-cut.test.ts`

**Interfaces:**
- Consumes: `Lab` (Task 2)
- Produces: `medianCut(lab: Float32Array, k: number): Float32Array` — nhận mảng Lab phẳng (`n*3`), trả về `k*3` centroid

**Vì sao không dùng k-means++ ngẫu nhiên:** k-means++ cần PRNG. Median-cut hoàn toàn deterministic mà vẫn cho centroid rải đều theo phân bố màu thật, nên dùng nó làm khởi tạo thì bỏ được PRNG khỏi toàn bộ pipeline. Đây là điều kiện để replay `edits` log về sau (spec §9).

- [ ] **Step 1: Viết test**

`src/core/quantize/__tests__/median-cut.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { medianCut } from '@/core/quantize/median-cut'
import { rgbToLab } from '@/core/color/srgb-lab'

function labArrayOf(colors: [number, number, number][], repeat: number): Float32Array {
  const out = new Float32Array(colors.length * repeat * 3)
  let i = 0
  for (const c of colors) {
    const lab = rgbToLab(c[0], c[1], c[2])
    for (let r = 0; r < repeat; r++) {
      out[i++] = lab[0]
      out[i++] = lab[1]
      out[i++] = lab[2]
    }
  }
  return out
}

describe('medianCut', () => {
  it('trả về đúng k centroid', () => {
    const lab = labArrayOf([[255, 0, 0], [0, 255, 0], [0, 0, 255]], 10)
    expect(medianCut(lab, 3)).toHaveLength(9)
    expect(medianCut(lab, 5)).toHaveLength(15)
  })

  it('với 3 màu rời rạc và k=3, mỗi centroid trùng một màu', () => {
    const reds = rgbToLab(255, 0, 0)
    const greens = rgbToLab(0, 255, 0)
    const blues = rgbToLab(0, 0, 255)
    const lab = labArrayOf([[255, 0, 0], [0, 255, 0], [0, 0, 255]], 20)

    const c = medianCut(lab, 3)
    const found = [0, 1, 2].map((i) => [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]])

    for (const target of [reds, greens, blues]) {
      const near = found.some(
        (f) =>
          Math.abs(f[0] - target[0]) < 1 &&
          Math.abs(f[1] - target[1]) < 1 &&
          Math.abs(f[2] - target[2]) < 1,
      )
      expect(near).toBe(true)
    }
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const lab = new Float32Array(300)
    for (let i = 0; i < 100; i++) {
      lab[i * 3] = (i * 7) % 100
      lab[i * 3 + 1] = ((i * 13) % 200) - 100
      lab[i * 3 + 2] = ((i * 29) % 200) - 100
    }
    expect(Array.from(medianCut(lab, 8))).toEqual(Array.from(medianCut(lab, 8)))
  })

  it('k lớn hơn số màu riêng biệt vẫn trả đủ k centroid', () => {
    const lab = labArrayOf([[0, 0, 0], [255, 255, 255]], 5)
    expect(medianCut(lab, 6)).toHaveLength(18)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/quantize/__tests__/median-cut.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

> ⚠️ **Code dưới đây CÓ BUG — đã phát hiện và sửa lúc thực thi (commit `3118164`).** Việc cắt tại **count-median** (`sorted.length >> 1`) rơi vào giữa một dải pixel có giá trị trục **bằng nhau**, nên nhát cắt không tách được gì: cả hai hộp con đều còn chứa giá trị đó. Với 3 cụm màu rời rạc kích thước bằng nhau và `k=3`, kết quả ra hộp `15/15/30` và hai trong ba centroid là **màu pha**, không phải màu thuần — Test 2 fail. Lỗi này chắc chắn xảy ra với mọi số cụm lẻ ≥3 có kích thước bằng nhau, và ảnh pixel-art/sprite thì đầy dải màu phẳng như vậy.
>
> **Cách sửa đã áp dụng:** cắt tại **biên giá trị gần median nhất** (`nearestValueBoundary`) thay vì tại count-median. Chỉ quét `j` trong `[1, length-1]` nên không bao giờ sinh hộp rỗng; tie giữa hai biên cách đều được phá bằng so sánh `<` khi quét tăng dần nên chỉ số nhỏ hơn thắng ⇒ vẫn deterministic. Hộp có `spread <= 0` đã bị lọc trước khi tới đây nên trường hợp "trục rộng nhất chỉ có một giá trị" không thể xảy ra.
>
> Nếu thực thi lại task này, hãy đọc code đã commit thay vì code dưới đây.

`src/core/quantize/median-cut.ts`:

```ts
interface Box {
  /** index pixel (không phải offset trong mảng phẳng) */
  idx: Uint32Array
  /** kênh nào có biên độ lớn nhất: 0=L, 1=a, 2=b */
  axis: number
  spread: number
}

function boxOf(lab: Float32Array, idx: Uint32Array): Box {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < idx.length; i++) {
    const p = idx[i] * 3
    for (let c = 0; c < 3; c++) {
      const v = lab[p + c]
      if (v < min[c]) min[c] = v
      if (v > max[c]) max[c] = v
    }
  }
  let axis = 0
  let spread = -1
  for (let c = 0; c < 3; c++) {
    const s = max[c] - min[c]
    if (s > spread) {
      spread = s
      axis = c
    }
  }
  return { idx, axis, spread }
}

/**
 * Median cut trong Lab. Lặp: chọn hộp có biên độ lớn nhất, cắt tại trung vị
 * của kênh rộng nhất, tới khi có k hộp. Centroid = trung bình mỗi hộp.
 *
 * Hoàn toàn deterministic: không PRNG, không phụ thuộc thứ tự Map/Set.
 * Khi hết hộp cắt được (ít màu riêng biệt hơn k), nhân bản centroid cuối
 * để vẫn trả đủ k — Stage 2 sẽ để k-means hợp nhất các centroid trùng.
 */
export function medianCut(lab: Float32Array, k: number): Float32Array {
  const n = lab.length / 3
  const all = new Uint32Array(n)
  for (let i = 0; i < n; i++) all[i] = i

  let boxes: Box[] = [boxOf(lab, all)]

  while (boxes.length < k) {
    // chọn hộp biên độ lớn nhất còn cắt được; so sánh có tie-break theo
    // chỉ số để deterministic
    let best = -1
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].idx.length < 2 || boxes[i].spread <= 0) continue
      if (best === -1 || boxes[i].spread > boxes[best].spread) best = i
    }
    if (best === -1) break

    const box = boxes[best]
    const axis = box.axis
    const sorted = Array.from(box.idx).sort((p, q) => {
      const d = lab[p * 3 + axis] - lab[q * 3 + axis]
      return d !== 0 ? d : p - q
    })
    const mid = sorted.length >> 1
    const left = new Uint32Array(sorted.slice(0, mid))
    const right = new Uint32Array(sorted.slice(mid))

    boxes.splice(best, 1, boxOf(lab, left), boxOf(lab, right))
  }

  const out = new Float32Array(k * 3)
  for (let i = 0; i < k; i++) {
    const box = boxes[Math.min(i, boxes.length - 1)]
    let sL = 0
    let sa = 0
    let sb = 0
    for (let j = 0; j < box.idx.length; j++) {
      const p = box.idx[j] * 3
      sL += lab[p]
      sa += lab[p + 1]
      sb += lab[p + 2]
    }
    const m = box.idx.length || 1
    out[i * 3] = sL / m
    out[i * 3 + 1] = sa / m
    out[i * 3 + 2] = sb / m
  }
  return out
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/quantize/__tests__/median-cut.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/quantize/median-cut.ts src/core/quantize/__tests__/median-cut.test.ts
git commit -m "feat(core): median-cut khởi tạo centroid deterministic

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: k-means trong Lab + API Stage 2

**Files:**
- Create: `src/core/quantize/kmeans.ts`, `src/core/quantize/quantize.ts`
- Test: `src/core/quantize/__tests__/kmeans.test.ts`, `src/core/quantize/__tests__/quantize.test.ts`

**Interfaces:**
- Consumes: `medianCut` (Task 6), `rgbaToLabArray`/`labToRgb` (Task 3), `QuantizeResult`, `RgbaImage` (Task 2)
- Produces:
  - `kmeansLab(lab: Float32Array, k: number, maxIters?: number): { labels: Uint8Array; centroids: Float32Array }` — `maxIters` mặc định 20
  - `quantize(img: RgbaImage, k: number): QuantizeResult` — palette **đã sắp ổn định** theo L, rồi a, rồi b tăng dần

**Vì sao phải sắp palette:** thứ tự centroid do median-cut sinh ra phụ thuộc hình dạng cây cắt, khó đọc và khó test. Sắp cố định theo (L, a, b) làm `colorIndex` ổn định và có nghĩa: số nhỏ = màu tối. Bắt buộc sắp **sau** k-means và ánh xạ lại `labels` theo bảng đổi chỉ số.

- [ ] **Step 1: Viết test cho kmeans**

`src/core/quantize/__tests__/kmeans.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { kmeansLab } from '@/core/quantize/kmeans'

/** 3 cụm rời nhau rõ rệt trong Lab */
function threeClusters(): Float32Array {
  const pts: number[] = []
  const centers = [
    [20, 0, 0],
    [50, 60, 40],
    [90, -40, 70],
  ]
  for (const c of centers) {
    for (let i = 0; i < 30; i++) {
      pts.push(c[0] + (i % 3) * 0.1, c[1] + (i % 2) * 0.1, c[2] + (i % 5) * 0.1)
    }
  }
  return new Float32Array(pts)
}

describe('kmeansLab', () => {
  it('gán đúng 3 cụm rời nhau', () => {
    const { labels, centroids } = kmeansLab(threeClusters(), 3)
    expect(centroids).toHaveLength(9)
    expect(labels).toHaveLength(90)

    // 30 điểm đầu cùng một nhãn, 30 tiếp theo nhãn khác, v.v.
    const g1 = new Set(Array.from(labels.slice(0, 30)))
    const g2 = new Set(Array.from(labels.slice(30, 60)))
    const g3 = new Set(Array.from(labels.slice(60, 90)))
    expect(g1.size).toBe(1)
    expect(g2.size).toBe(1)
    expect(g3.size).toBe(1)
    expect(new Set([...g1, ...g2, ...g3]).size).toBe(3)
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const lab = threeClusters()
    const a = kmeansLab(lab, 4)
    const b = kmeansLab(lab, 4)
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels))
    expect(Array.from(a.centroids)).toEqual(Array.from(b.centroids))
  })

  it('mọi nhãn nằm trong [0, k)', () => {
    const { labels } = kmeansLab(threeClusters(), 5)
    for (const l of labels) {
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThan(5)
    }
  })

  it('không vượt maxIters', () => {
    // chỉ kiểm tra là hàm dừng và không treo với maxIters nhỏ
    const { labels } = kmeansLab(threeClusters(), 3, 1)
    expect(labels).toHaveLength(90)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/quantize/__tests__/kmeans.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement kmeans**

`src/core/quantize/kmeans.ts`:

```ts
import { medianCut } from '@/core/quantize/median-cut'

/**
 * k-means (Lloyd) trong Lab, khởi tạo bằng median-cut nên không cần PRNG.
 * Dừng khi không có nhãn nào đổi, hoặc hết maxIters.
 * Cụm rỗng giữ nguyên centroid cũ (không tái khởi tạo ngẫu nhiên) để
 * bảo toàn tính deterministic.
 */
export function kmeansLab(
  lab: Float32Array,
  k: number,
  maxIters = 20,
): { labels: Uint8Array; centroids: Float32Array } {
  const n = lab.length / 3
  const centroids = medianCut(lab, k)
  const labels = new Uint8Array(n)

  const sums = new Float64Array(k * 3)
  const counts = new Uint32Array(k)

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false

    for (let i = 0; i < n; i++) {
      const L = lab[i * 3]
      const a = lab[i * 3 + 1]
      const b = lab[i * 3 + 2]

      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dL = L - centroids[c * 3]
        const da = a - centroids[c * 3 + 1]
        const db = b - centroids[c * 3 + 2]
        const d = dL * dL + da * da + db * db
        // `<` chứ không `<=` ⇒ tie luôn về centroid có chỉ số nhỏ hơn
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (labels[i] !== best) {
        labels[i] = best
        changed = true
      }
    }

    sums.fill(0)
    counts.fill(0)
    for (let i = 0; i < n; i++) {
      const c = labels[i]
      sums[c * 3] += lab[i * 3]
      sums[c * 3 + 1] += lab[i * 3 + 1]
      sums[c * 3 + 2] += lab[i * 3 + 2]
      counts[c]++
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue
      centroids[c * 3] = sums[c * 3] / counts[c]
      centroids[c * 3 + 1] = sums[c * 3 + 1] / counts[c]
      centroids[c * 3 + 2] = sums[c * 3 + 2] / counts[c]
    }

    if (!changed) break
  }

  return { labels, centroids }
}
```

- [ ] **Step 4: Viết test cho quantize**

`src/core/quantize/__tests__/quantize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { quantize } from '@/core/quantize/quantize'
import { rgbToLab } from '@/core/color/srgb-lab'
import type { RgbaImage } from '@/core/types'

/** ảnh 3 dải ngang: đỏ, xanh lá, xanh dương */
function threeBands(): RgbaImage {
  const w = 9
  const h = 9
  const data = new Uint8ClampedArray(w * h * 4)
  const bands: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ]
  for (let y = 0; y < h; y++) {
    const c = bands[Math.floor(y / 3)]
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

describe('quantize', () => {
  it('palette có đúng k phần tử', () => {
    expect(quantize(threeBands(), 3).palette).toHaveLength(3)
    expect(quantize(threeBands(), 6).palette).toHaveLength(6)
  })

  it('labels có đúng width*height phần tử', () => {
    const r = quantize(threeBands(), 3)
    expect(r.labels).toHaveLength(81)
  })

  it('3 dải màu rời nhau → 3 nhãn khác nhau, mỗi dải một nhãn', () => {
    const { labels } = quantize(threeBands(), 3)
    const band = (y: number) => new Set(Array.from(labels.slice(y * 9, y * 9 + 9)))
    expect(band(1).size).toBe(1)
    expect(band(4).size).toBe(1)
    expect(band(7).size).toBe(1)
    expect(new Set([...band(1), ...band(4), ...band(7)]).size).toBe(3)
  })

  it('palette sắp tăng dần theo L, rồi a, rồi b', () => {
    const { palette } = quantize(threeBands(), 3)
    const labs = palette.map((p) => rgbToLab(p[0], p[1], p[2]))
    for (let i = 1; i < labs.length; i++) {
      const prev = labs[i - 1]
      const cur = labs[i]
      const cmp =
        prev[0] !== cur[0] ? prev[0] - cur[0]
        : prev[1] !== cur[1] ? prev[1] - cur[1]
        : prev[2] - cur[2]
      expect(cmp).toBeLessThanOrEqual(0)
    }
  })

  it('labels trỏ đúng màu palette sau khi sắp lại', () => {
    const img = threeBands()
    const { labels, palette } = quantize(img, 3)
    // pixel giữa dải đỏ phải trỏ tới màu palette gần đỏ nhất
    const idx = 1 * 9 + 4
    const chosen = palette[labels[idx]]
    expect(chosen[0]).toBeGreaterThan(chosen[1])
    expect(chosen[0]).toBeGreaterThan(chosen[2])
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const img = threeBands()
    const a = quantize(img, 5)
    const b = quantize(img, 5)
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels))
    expect(a.palette).toEqual(b.palette)
  })
})
```

- [ ] **Step 5: Implement quantize**

`src/core/quantize/quantize.ts`:

```ts
import { labToRgb, rgbaToLabArray, rgbToLab } from '@/core/color/srgb-lab'
import { kmeansLab } from '@/core/quantize/kmeans'
import type { QuantizeResult, Rgb, RgbaImage } from '@/core/types'

function compareLab(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

/**
 * Stage 2 — gom ảnh về k màu.
 * Palette được sắp ổn định theo (L, a, b) tăng dần và labels được ánh xạ lại
 * theo thứ tự mới, nên colorIndex có nghĩa (số nhỏ = màu tối) và ổn định
 * giữa các lần chạy.
 */
export function quantize(img: RgbaImage, k: number): QuantizeResult {
  const lab = rgbaToLabArray(img.data)
  const { labels, centroids } = kmeansLab(lab, k)

  const rgbPalette: Rgb[] = []
  for (let c = 0; c < k; c++) {
    rgbPalette.push(
      labToRgb(centroids[c * 3], centroids[c * 3 + 1], centroids[c * 3 + 2]),
    )
  }

  // sắp theo Lab của màu RGB đã kẹp gamut, để thứ tự khớp đúng cái test kiểm
  const order = rgbPalette
    .map((rgb, i) => ({ i, lab: rgbToLab(rgb[0], rgb[1], rgb[2]) }))
    .sort((p, q) => compareLab(p.lab, q.lab) || p.i - q.i)

  const remap = new Uint8Array(k)
  order.forEach((o, newIndex) => {
    remap[o.i] = newIndex
  })

  const outLabels = new Uint8Array(labels.length)
  for (let i = 0; i < labels.length; i++) outLabels[i] = remap[labels[i]]

  return {
    labels: outLabels,
    palette: order.map((o) => rgbPalette[o.i]),
  }
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/core/quantize`
Expected: 10 passed

- [ ] **Step 7: Commit**

```bash
git add src/core/quantize
git commit -m "feat(core): k-means trong Lab và API quantize Stage 2

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Tách vùng — connected components 4-hướng (Stage 3)

**Files:**
- Create: `src/core/regions/connected-components.ts`
- Test: `src/core/regions/__tests__/connected-components.test.ts`

**Interfaces:**
- Consumes: `RegionField`, `RegionMeta` (Task 2)
- Produces: `labelRegions(labels: Uint8Array, width: number, height: number): RegionField`
  - `regions[i].id === i` luôn đúng; `anchorX`/`anchorY`/`anchorR` = `-1` và `hasLabel` = `false` (Stage 5 mới điền)

**Hai cái bẫy phải tránh:**
1. **Dùng stack tường minh, không đệ quy.** Ảnh 1400×1000 có vùng nền liền 500k pixel; flood fill đệ quy sẽ tràn call stack và crash worker.
2. **4-hướng, không 8-hướng.** 8-hướng làm hai vùng chỉ chạm nhau ở góc bị dính thành một, sinh ra vùng hình xúc xích rất khó tô.

- [ ] **Step 1: Viết test**

`src/core/regions/__tests__/connected-components.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'

/** dựng labels từ chuỗi ký tự cho dễ đọc; mỗi ký tự là một colorIndex */
function fromRows(rows: string[]): { labels: Uint8Array; width: number; height: number } {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    expect(row.length).toBe(width)
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return { labels, width, height }
}

describe('labelRegions', () => {
  it('3 khối phẳng → 3 vùng, diện tích và bbox chính xác', () => {
    const { labels, width, height } = fromRows([
      'aaabbb',
      'aaabbb',
      'cccccc',
      'cccccc',
    ])
    const f = labelRegions(labels, width, height)

    expect(f.regions).toHaveLength(3)
    expect(f.regions.map((r) => r.area).sort((a, b) => a - b)).toEqual([6, 6, 12])

    const byArea = [...f.regions].sort((a, b) => b.area - a.area)
    expect(byArea[0]).toMatchObject({ area: 12, minX: 0, maxX: 5, minY: 2, maxY: 3 })
  })

  it('id vùng liên tục từ 0', () => {
    const { labels, width, height } = fromRows(['ab', 'ba'])
    const f = labelRegions(labels, width, height)
    expect(f.regions.map((r) => r.id)).toEqual([0, 1, 2, 3])
  })

  it('4-hướng: hai khối chỉ chạm nhau ở góc là HAI vùng', () => {
    const { labels, width, height } = fromRows([
      'aab',
      'aab',
      'bba',
      'bba',
    ])
    const f = labelRegions(labels, width, height)
    // 'a' xuất hiện ở góc trên-trái và góc dưới-phải, chỉ chạm chéo
    const aRegions = f.regions.filter((r) => r.colorIndex === 0)
    expect(aRegions).toHaveLength(2)
  })

  it('colorIndex của vùng khớp label gốc', () => {
    const labels = new Uint8Array([0, 0, 5, 5])
    const f = labelRegions(labels, 4, 1)
    expect(f.regions.map((r) => r.colorIndex)).toEqual([0, 5])
  })

  it('bất biến: mọi pixel thuộc đúng 1 vùng và tổng diện tích = w*h', () => {
    const { labels, width, height } = fromRows([
      'aabbcc',
      'aabbcc',
      'ddaacc',
      'ddaabb',
    ])
    const f = labelRegions(labels, width, height)

    expect(f.regionMap).toHaveLength(width * height)
    const total = f.regions.reduce((s, r) => s + r.area, 0)
    expect(total).toBe(width * height)

    const counted = new Uint32Array(f.regions.length)
    for (const id of f.regionMap) counted[id]++
    expect(Array.from(counted)).toEqual(f.regions.map((r) => r.area))
  })

  it('vùng nền lớn không tràn stack', () => {
    const w = 600
    const h = 600
    const labels = new Uint8Array(w * h) // toàn bộ cùng màu
    const f = labelRegions(labels, w, h)
    expect(f.regions).toHaveLength(1)
    expect(f.regions[0].area).toBe(w * h)
  })

  it('anchor chưa tính ⇒ -1 và hasLabel false', () => {
    const f = labelRegions(new Uint8Array([0]), 1, 1)
    expect(f.regions[0]).toMatchObject({ anchorX: -1, anchorY: -1, anchorR: -1, hasLabel: false })
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/regions/__tests__/connected-components.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/regions/connected-components.ts`:

```ts
import type { RegionField, RegionMeta } from '@/core/types'

const UNASSIGNED = 0xffffffff

/**
 * Stage 3 — gán nhãn thành phần liên thông 4-hướng trên mảng colorIndex.
 *
 * Dùng stack tường minh (Uint32Array cấp sẵn bằng số pixel) thay vì đệ quy:
 * một vùng nền có thể chứa hàng trăm nghìn pixel và đệ quy sẽ tràn call stack.
 */
export function labelRegions(
  labels: Uint8Array,
  width: number,
  height: number,
): RegionField {
  const n = width * height
  const regionMap = new Uint32Array(n).fill(UNASSIGNED)
  const regions: RegionMeta[] = []
  const stack = new Uint32Array(n)

  for (let seed = 0; seed < n; seed++) {
    if (regionMap[seed] !== UNASSIGNED) continue

    const id = regions.length
    const colorIndex = labels[seed]

    let area = 0
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1

    let top = 0
    stack[top++] = seed
    regionMap[seed] = id

    while (top > 0) {
      const p = stack[--top]
      const x = p % width
      const y = (p - x) / width

      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      // 4-hướng: trái, phải, trên, dưới
      if (x > 0) {
        const q = p - 1
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
      if (x + 1 < width) {
        const q = p + 1
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
      if (y > 0) {
        const q = p - width
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
      if (y + 1 < height) {
        const q = p + width
        if (regionMap[q] === UNASSIGNED && labels[q] === colorIndex) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
    }

    regions.push({
      id,
      colorIndex,
      area,
      minX,
      minY,
      maxX,
      maxY,
      anchorX: -1,
      anchorY: -1,
      anchorR: -1,
      hasLabel: false,
    })
  }

  return { regionMap, regions, width, height }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/regions/__tests__/connected-components.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/regions/connected-components.ts src/core/regions/__tests__/connected-components.test.ts
git commit -m "feat(core): tách vùng bằng connected components 4-hướng

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Bảng kề kèm độ dài biên chung

**Files:**
- Create: `src/core/regions/adjacency.ts`
- Test: `src/core/regions/__tests__/adjacency.test.ts`

**Interfaces:**
- Consumes: `RegionField` (Task 2)
- Produces:
  - `type Adjacency = Map<number, Map<number, number>>` — `adj.get(a).get(b)` = số cạnh pixel chung giữa vùng `a` và `b`
  - `buildAdjacency(field: RegionField): Adjacency`
  - `longestNeighbor(adj: Adjacency, id: number): number | null` — láng giềng có biên chung dài nhất; tie-break theo id nhỏ hơn để deterministic

**Vì sao cần độ dài biên chứ không chỉ "có kề hay không":** Stage 4 gộp vùng vụn vào láng giềng **chung biên dài nhất**. Nếu gộp vào láng giềng đầu tiên gặp được thì một đốm nhỏ nằm ở ranh giới giữa thân Pokémon và bầu trời sẽ bị hút vào bầu trời một cách ngẫu nhiên, tạo lỗ màu sai giữa thân.

- [ ] **Step 1: Viết test**

`src/core/regions/__tests__/adjacency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildAdjacency, longestNeighbor } from '@/core/regions/adjacency'
import { labelRegions } from '@/core/regions/connected-components'
import type { RegionField } from '@/core/types'

function field(rows: string[]): RegionField {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return labelRegions(labels, width, height)
}

describe('buildAdjacency', () => {
  it('hai hình chữ nhật kề nhau: độ dài biên chung = số cạnh pixel', () => {
    // 8 dòng, cắt dọc ở x=3 ⇒ biên chung dài 8
    const f = field(Array.from({ length: 8 }, () => 'aaabbb'))
    const adj = buildAdjacency(f)
    expect(adj.get(0)!.get(1)).toBe(8)
    expect(adj.get(1)!.get(0)).toBe(8)
  })

  it('vùng không kề nhau thì không có trong bảng', () => {
    const f = field([
      'abc',
      'abc',
    ])
    const adj = buildAdjacency(f)
    // a và c cách nhau bởi b
    expect(adj.get(0)!.has(2)).toBe(false)
  })

  it('chỉ tính kề 4-hướng, không tính chạm chéo', () => {
    const f = field([
      'ab',
      'ba',
    ])
    const adj = buildAdjacency(f)
    const aTopLeft = f.regionMap[0]
    const aBottomRight = f.regionMap[3]
    expect(aTopLeft).not.toBe(aBottomRight)
    expect(adj.get(aTopLeft)?.has(aBottomRight) ?? false).toBe(false)
  })

  it('không tự kề chính mình', () => {
    const f = field(['aaa', 'aaa'])
    const adj = buildAdjacency(f)
    expect(adj.get(0)?.has(0) ?? false).toBe(false)
  })
})

describe('longestNeighbor', () => {
  it('chọn láng giềng có biên chung dài nhất, không phải cái gặp trước', () => {
    // 'x' là đốm 1 pixel: kề 'a' 1 cạnh (bên trái), kề 'b' 3 cạnh (trên/dưới/phải)
    const f = field([
      'abb',
      'axb',
      'abb',
    ])
    const adj = buildAdjacency(f)
    const xId = f.regionMap[1 * 3 + 1]
    const aId = f.regionMap[0]
    const bId = f.regionMap[1]

    expect(adj.get(xId)!.get(aId)).toBe(1)
    expect(adj.get(xId)!.get(bId)).toBe(3)
    expect(longestNeighbor(adj, xId)).toBe(bId)
  })

  it('tie thì chọn id nhỏ hơn (deterministic)', () => {
    const f = field(['ab'])
    const adj = buildAdjacency(f)
    // cả hai chỉ kề nhau nên không có tie thật; kiểm tra bằng bảng dựng tay
    const manual = new Map([[9, new Map([[3, 5], [7, 5]])]])
    expect(longestNeighbor(manual, 9)).toBe(3)
  })

  it('vùng không có láng giềng → null', () => {
    const f = field(['aa', 'aa'])
    const adj = buildAdjacency(f)
    expect(longestNeighbor(adj, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/regions/__tests__/adjacency.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/regions/adjacency.ts`:

```ts
import type { RegionField } from '@/core/types'

/** adj.get(a).get(b) = số cạnh pixel chung giữa vùng a và b (đối xứng) */
export type Adjacency = Map<number, Map<number, number>>

function bump(adj: Adjacency, a: number, b: number): void {
  let ma = adj.get(a)
  if (!ma) {
    ma = new Map()
    adj.set(a, ma)
  }
  ma.set(b, (ma.get(b) ?? 0) + 1)
}

/**
 * Dựng bảng kề 4-hướng kèm độ dài biên chung.
 * Chỉ quét cạnh phải và cạnh dưới của mỗi pixel — đủ để phủ hết mọi cạnh
 * đúng một lần, rồi ghi cả hai chiều cho đối xứng.
 */
export function buildAdjacency(field: RegionField): Adjacency {
  const { regionMap, width, height } = field
  const adj: Adjacency = new Map()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const a = regionMap[p]

      if (x + 1 < width) {
        const b = regionMap[p + 1]
        if (a !== b) {
          bump(adj, a, b)
          bump(adj, b, a)
        }
      }
      if (y + 1 < height) {
        const b = regionMap[p + width]
        if (a !== b) {
          bump(adj, a, b)
          bump(adj, b, a)
        }
      }
    }
  }

  return adj
}

/**
 * Láng giềng có biên chung dài nhất. Tie-break theo id nhỏ hơn để kết quả
 * không phụ thuộc thứ tự chèn vào Map ⇒ deterministic.
 */
export function longestNeighbor(adj: Adjacency, id: number): number | null {
  const m = adj.get(id)
  if (!m || m.size === 0) return null

  let bestId = -1
  let bestLen = -1
  for (const [other, len] of m) {
    if (len > bestLen || (len === bestLen && other < bestId)) {
      bestLen = len
      bestId = other
    }
  }
  return bestId === -1 ? null : bestId
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/regions/__tests__/adjacency.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/regions/adjacency.ts src/core/regions/__tests__/adjacency.test.ts
git commit -m "feat(core): bảng kề kèm độ dài biên chung

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Gộp vùng vụn (Stage 4 — núm chất lượng chính của sản phẩm)

**Files:**
- Create: `src/core/regions/merge-small.ts`
- Test: `src/core/regions/__tests__/merge-small.test.ts`

**Interfaces:**
- Consumes: `buildAdjacency`, `longestNeighbor` (Task 9), `labelRegions` (Task 8), `deltaE76` (Task 3), `rgbToLab` (Task 3), `RegionField`, `Rgb` (Task 2)
- Produces:
  - `mergeSmallRegions(field: RegionField, palette: Rgb[], minArea: number, mergeDeltaE: number): RegionField`
  - id vùng trong kết quả được **nén lại liên tục 0..n-1**

**Đây là task quan trọng nhất về chất lượng.** Nó biến 6000 blob thành ~400 vùng tô được. Thuật toán:

1. Lặp tối đa 8 lượt. Mỗi lượt: dựng adjacency, lấy danh sách vùng `area < minArea` **sắp theo diện tích tăng dần rồi theo id** (deterministic), gộp mỗi cái vào `longestNeighbor`.
2. Sau vòng lặp, nếu còn vùng nhỏ (vì gộp xong lại sinh ra cái nhỏ mới, hoặc vùng nhỏ chỉ kề vùng nhỏ), **force-merge**: gộp bất kể ngưỡng, tới khi không còn vùng nhỏ nào có láng giềng.
3. Cuối cùng: gộp cặp vùng kề nhau nếu `deltaE76` giữa hai màu palette < `mergeDeltaE`.
4. Nén id.

- [ ] **Step 1: Viết test**

`src/core/regions/__tests__/merge-small.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { mergeSmallRegions } from '@/core/regions/merge-small'
import type { RegionField, Rgb } from '@/core/types'

function field(rows: string[]): RegionField {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return labelRegions(labels, width, height)
}

/** palette cách xa nhau để deltaE không kích hoạt gộp ngoài ý muốn */
const FAR: Rgb[] = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
]

describe('mergeSmallRegions', () => {
  it('đốm 1 pixel bị hấp thụ vào láng giềng biên dài nhất', () => {
    const f = field([
      'abb',
      'axb',
      'abb',
    ])
    const bId = f.regionMap[1] // vùng 'b'
    const bColor = f.regions[bId].colorIndex

    const out = mergeSmallRegions(f, FAR, 2, 0)

    // pixel giữa giờ mang màu của 'b'
    const centerRegion = out.regions[out.regionMap[1 * 3 + 1]]
    expect(centerRegion.colorIndex).toBe(bColor)
  })

  it('bất biến: sau khi gộp không còn vùng nào nhỏ hơn minArea', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
      'ccccdddd',
      'ccpcddqd',
      'ccccdddd',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)
    for (const r of out.regions) {
      expect(r.area).toBeGreaterThanOrEqual(4)
    }
  })

  it('bất biến: tổng diện tích được bảo toàn', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)
    const total = out.regions.reduce((s, r) => s + r.area, 0)
    expect(total).toBe(8 * 3)
  })

  it('bất biến: id được nén liên tục 0..n-1 và regionMap chỉ chứa id hợp lệ', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)

    expect(out.regions.map((r) => r.id)).toEqual(out.regions.map((_, i) => i))
    for (const id of out.regionMap) {
      expect(id).toBeLessThan(out.regions.length)
    }

    const counted = new Uint32Array(out.regions.length)
    for (const id of out.regionMap) counted[id]++
    expect(Array.from(counted)).toEqual(out.regions.map((r) => r.area))
  })

  it('vùng đủ lớn không bị gộp', () => {
    const f = field([
      'aaaabbbb',
      'aaaabbbb',
      'aaaabbbb',
    ])
    const out = mergeSmallRegions(f, FAR, 4, 0)
    expect(out.regions).toHaveLength(2)
  })

  it('gộp cặp kề nhau khi màu quá gần theo deltaE', () => {
    const near: Rgb[] = [
      [100, 100, 100],
      [102, 101, 100], // gần như trùng
      [0, 200, 0],
    ]
    const f = field([
      'aabbcc',
      'aabbcc',
      'aabbcc',
    ])
    const out = mergeSmallRegions(f, near, 1, 6)
    // 'a' và 'b' nhập lại thành 1 ⇒ còn 2 vùng
    expect(out.regions).toHaveLength(2)
  })

  it('không gộp theo màu khi mergeDeltaE = 0', () => {
    const near: Rgb[] = [
      [100, 100, 100],
      [102, 101, 100],
      [0, 200, 0],
    ]
    const f = field([
      'aabbcc',
      'aabbcc',
      'aabbcc',
    ])
    const out = mergeSmallRegions(f, near, 1, 0)
    expect(out.regions).toHaveLength(3)
  })

  it('force-merge: vùng nhỏ chỉ kề vùng nhỏ vẫn được xử lý', () => {
    // toàn bộ ảnh là các đốm nhỏ xen kẽ, minArea rất lớn
    const f = field([
      'ababab',
      'bababa',
      'ababab',
    ])
    const out = mergeSmallRegions(f, FAR, 100, 0)
    // không thể còn nhiều vùng nhỏ; kết thúc bằng 1 vùng duy nhất
    expect(out.regions).toHaveLength(1)
    expect(out.regions[0].area).toBe(18)
  })

  it('deterministic — chạy 2 lần ra y hệt', () => {
    const f = field([
      'aaaabbbb',
      'aaxabbyb',
      'aaaabbbb',
      'ccccdddd',
    ])
    const a = mergeSmallRegions(f, FAR, 4, 0)
    const b = mergeSmallRegions(f, FAR, 4, 0)
    expect(Array.from(a.regionMap)).toEqual(Array.from(b.regionMap))
    expect(a.regions).toEqual(b.regions)
  })

  it('không sửa field input', () => {
    const f = field(['aaxa', 'aaaa'])
    const before = Array.from(f.regionMap)
    mergeSmallRegions(f, FAR, 3, 0)
    expect(Array.from(f.regionMap)).toEqual(before)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/regions/__tests__/merge-small.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/regions/merge-small.ts`:

```ts
import { deltaE76 } from '@/core/color/delta-e'
import { rgbToLab } from '@/core/color/srgb-lab'
import { buildAdjacency, longestNeighbor } from '@/core/regions/adjacency'
import type { RegionField, RegionMeta, Rgb } from '@/core/types'

const MAX_PASSES = 8

/** union-find với nén đường đi; đại diện luôn là id nhỏ nhất ⇒ deterministic */
class DisjointSet {
  private parent: Uint32Array

  constructor(n: number) {
    this.parent = new Uint32Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }

  find(x: number): number {
    let root = x
    while (this.parent[root] !== root) root = this.parent[root]
    while (this.parent[x] !== root) {
      const next = this.parent[x]
      this.parent[x] = root
      x = next
    }
    return root
  }

  /** hợp nhất, giữ id nhỏ hơn làm đại diện */
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    if (ra < rb) this.parent[rb] = ra
    else this.parent[ra] = rb
  }
}

/**
 * Áp union-find lên regionMap và dựng lại metadata, nén id liên tục.
 * `colorOf` quyết định colorIndex của vùng mới: lấy của vùng gốc có diện
 * tích lớn nhất trong nhóm (vùng nhỏ bị hấp thụ nên phải nhận màu của cái to).
 */
function rebuild(
  field: RegionField,
  ds: DisjointSet,
): RegionField {
  const { regionMap, regions, width, height } = field

  // với mỗi nhóm, tìm vùng gốc có area lớn nhất để lấy colorIndex
  const bestArea = new Map<number, { area: number; colorIndex: number; id: number }>()
  for (const r of regions) {
    const root = ds.find(r.id)
    const cur = bestArea.get(root)
    if (
      !cur ||
      r.area > cur.area ||
      (r.area === cur.area && r.id < cur.id)
    ) {
      bestArea.set(root, { area: r.area, colorIndex: r.colorIndex, id: r.id })
    }
  }

  // nén id theo thứ tự root tăng dần ⇒ deterministic
  const roots = Array.from(bestArea.keys()).sort((a, b) => a - b)
  const newId = new Map<number, number>()
  roots.forEach((root, i) => newId.set(root, i))

  const outMap = new Uint32Array(regionMap.length)
  const outRegions: RegionMeta[] = roots.map((root, i) => ({
    id: i,
    colorIndex: bestArea.get(root)!.colorIndex,
    area: 0,
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
    anchorX: -1,
    anchorY: -1,
    anchorR: -1,
    hasLabel: false,
  }))

  for (let p = 0; p < regionMap.length; p++) {
    const id = newId.get(ds.find(regionMap[p]))!
    outMap[p] = id
    const r = outRegions[id]
    const x = p % width
    const y = (p - x) / width
    r.area++
    if (x < r.minX) r.minX = x
    if (x > r.maxX) r.maxX = x
    if (y < r.minY) r.minY = y
    if (y > r.maxY) r.maxY = y
  }

  return { regionMap: outMap, regions: outRegions, width, height }
}

/**
 * Stage 4 — gộp vùng vụn.
 *
 * 1. Tối đa 8 lượt: gộp mọi vùng area < minArea vào láng giềng chung biên
 *    dài nhất. Mỗi lượt dựng lại field vì việc gộp thay đổi cả diện tích
 *    lẫn quan hệ kề.
 * 2. Force-merge: nếu vẫn còn vùng nhỏ (vùng nhỏ chỉ kề vùng nhỏ), tiếp tục
 *    gộp bất kể ngưỡng tới khi không còn vùng nhỏ nào có láng giềng.
 * 3. Gộp cặp kề nhau có deltaE76 giữa hai màu palette < mergeDeltaE.
 */
export function mergeSmallRegions(
  field: RegionField,
  palette: Rgb[],
  minArea: number,
  mergeDeltaE: number,
): RegionField {
  let cur: RegionField = {
    regionMap: new Uint32Array(field.regionMap),
    regions: field.regions.map((r) => ({ ...r })),
    width: field.width,
    height: field.height,
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const small = cur.regions
      .filter((r) => r.area < minArea)
      .sort((a, b) => a.area - b.area || a.id - b.id)
    if (small.length === 0) break

    const adj = buildAdjacency(cur)
    const ds = new DisjointSet(cur.regions.length)
    let merged = false
    for (const r of small) {
      const target = longestNeighbor(adj, r.id)
      if (target === null) continue
      ds.union(r.id, target)
      merged = true
    }
    if (!merged) break
    cur = rebuild(cur, ds)
  }

  // force-merge cho phần còn sót
  for (;;) {
    const small = cur.regions
      .filter((r) => r.area < minArea)
      .sort((a, b) => a.area - b.area || a.id - b.id)
    if (small.length === 0) break

    const adj = buildAdjacency(cur)
    const ds = new DisjointSet(cur.regions.length)
    let merged = false
    for (const r of small) {
      const target = longestNeighbor(adj, r.id)
      if (target === null) continue
      ds.union(r.id, target)
      merged = true
      break // gộp một cái mỗi vòng để tránh gộp chuỗi khó đoán
    }
    if (!merged) break
    cur = rebuild(cur, ds)
  }

  // gộp theo màu quá gần nhau
  if (mergeDeltaE > 0) {
    const labs = palette.map((p) => rgbToLab(p[0], p[1], p[2]))
    for (;;) {
      const adj = buildAdjacency(cur)
      const ds = new DisjointSet(cur.regions.length)
      let merged = false

      // duyệt theo id tăng dần ⇒ deterministic
      for (const r of cur.regions) {
        const m = adj.get(r.id)
        if (!m) continue
        const others = Array.from(m.keys()).sort((a, b) => a - b)
        for (const other of others) {
          if (other <= r.id) continue
          const ca = cur.regions[r.id].colorIndex
          const cb = cur.regions[other].colorIndex
          if (ca === cb) continue
          if (!labs[ca] || !labs[cb]) continue
          if (deltaE76(labs[ca], labs[cb]) < mergeDeltaE) {
            ds.union(r.id, other)
            merged = true
          }
        }
      }

      if (!merged) break
      cur = rebuild(cur, ds)
    }
  }

  return cur
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/regions/__tests__/merge-small.test.ts`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/regions/merge-small.ts src/core/regions/__tests__/merge-small.test.ts
git commit -m "feat(core): gộp vùng vụn theo biên chung dài nhất và deltaE

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Distance transform + chỗ đặt số (Stage 5)

**Files:**
- Create: `src/core/regions/distance-transform.ts`, `src/core/regions/label-anchor.ts`
- Test: `src/core/regions/__tests__/distance-transform.test.ts`, `src/core/regions/__tests__/label-anchor.test.ts`

**Interfaces:**
- Consumes: `RegionField`, `RegionMeta` (Task 2)
- Produces:
  - `chamferDistance(mask: Uint8Array, w: number, h: number): Float32Array` — `mask[i] = 1` là trong vùng; trả khoảng cách tới biên gần nhất (pixel ngoài vùng = 0)
  - `computeAnchors(field: RegionField, minLabelRadius: number): RegionField` — trả field mới với `anchorX/anchorY/anchorR/hasLabel` đã điền

**Bẫy phải tránh — không dùng centroid.** Centroid của vùng hình chữ C, hình vành khuyên, hoặc hình chữ L nằm **ngoài** vùng, nên số sẽ được in lên vùng khác. Thay vào đó lấy *pole of inaccessibility*: điểm xa biên nhất, tìm bằng distance transform. `anchorR` = khoảng cách tại điểm đó = bán kính hình tròn lớn nhất nội tiếp vùng, dùng luôn làm tiêu chí "có đủ chỗ ghi số không".

- [ ] **Step 1: Viết test cho distance transform**

`src/core/regions/__tests__/distance-transform.test.ts`:

> ⚠️ **Assertion dưới đây SAI — đã phát hiện và sửa lúc thực thi (final fix wave, Task giữ nguyên code triển khai).** Test `'biên ảnh cũng tính là biên vùng'` kỳ vọng `d[1 * 3 + 1]` gần bằng **1**, nhưng giá trị đúng là **2**. Vùng chiếm trọn ảnh 3×3, tâm ở toạ độ (1,1); khoảng cách chamfer tới biên NGOÀI vùng gần nhất (biên ảnh, vốn cũng tính là biên vùng — đúng như comment trong test) là **2** pixel theo cả bốn hướng trực giao, không phải 1. Công thức `(n+1)/2` cho khoảng-cách-tâm-tới-biên của một khối n×n đặc đã được neo sẵn bởi test `'tâm hình vuông 5×5 có khoảng cách 3'` ngay phía dưới trong CÙNG file này (n=5 ⇒ (5+1)/2=3, khớp code); áp cùng công thức cho n=3 ⇒ (3+1)/2=**2**. Bản thân assertion — không phải code triển khai `chamferDistance` ở Step 3 — là điểm sai lệch.
>
> Nếu thực thi lại task này, sửa `expect(d[1 * 3 + 1]).toBeCloseTo(1, 5)` thành `expect(d[1 * 3 + 1]).toBeCloseTo(2, 5)`.

```ts
import { describe, expect, it } from 'vitest'
import { chamferDistance } from '@/core/regions/distance-transform'

function maskFromRows(rows: string[]): { mask: Uint8Array; w: number; h: number } {
  const h = rows.length
  const w = rows[0].length
  const mask = new Uint8Array(w * h)
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) mask[y * w + x] = row[x] === '#' ? 1 : 0
  })
  return { mask, w, h }
}

describe('chamferDistance', () => {
  it('pixel ngoài vùng có khoảng cách 0', () => {
    const { mask, w, h } = maskFromRows(['.#.', '.#.'])
    const d = chamferDistance(mask, w, h)
    expect(d[0]).toBe(0)
    expect(d[2]).toBe(0)
  })

  it('pixel sát biên có khoảng cách 1', () => {
    const { mask, w, h } = maskFromRows([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ])
    const d = chamferDistance(mask, w, h)
    expect(d[1 * 5 + 1]).toBeCloseTo(1, 5)
  })

  it('tâm hình vuông 5×5 có khoảng cách 3', () => {
    const rows = [
      '.......',
      '.#####.',
      '.#####.',
      '.#####.',
      '.#####.',
      '.#####.',
      '.......',
    ]
    const { mask, w, h } = maskFromRows(rows)
    const d = chamferDistance(mask, w, h)
    expect(d[3 * 7 + 3]).toBeCloseTo(3, 5)
  })

  it('biên ảnh cũng tính là biên vùng', () => {
    // vùng chiếm trọn ảnh 3×3 ⇒ tâm cách biên 2 (công thức (n+1)/2, n=3),
    // không phải vô cực
    const { mask, w, h } = maskFromRows(['###', '###', '###'])
    const d = chamferDistance(mask, w, h)
    expect(d[1 * 3 + 1]).toBeCloseTo(2, 5)
  })

  it('đường 1px dày có khoảng cách tối đa 1', () => {
    const { mask, w, h } = maskFromRows([
      '.....',
      '#####',
      '.....',
    ])
    const d = chamferDistance(mask, w, h)
    let max = 0
    for (const v of d) max = Math.max(max, v)
    expect(max).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/regions/__tests__/distance-transform.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement distance transform**

`src/core/regions/distance-transform.ts`:

```ts
const D_ORTHO = 1
const D_DIAG = Math.SQRT2

/**
 * Chamfer distance transform 2 lượt (thuận + nghịch).
 * Trả về khoảng cách từ mỗi pixel trong mask tới pixel ngoài mask gần nhất.
 * Pixel ngoài mask = 0.
 *
 * Biên ảnh được coi như nằm ngoài mask: vùng chiếm trọn ảnh vẫn có khoảng
 * cách hữu hạn, nhờ vậy anchorR luôn phản ánh "còn bao nhiêu chỗ để ghi số".
 */
export function chamferDistance(
  mask: Uint8Array,
  w: number,
  h: number,
): Float32Array {
  const d = new Float32Array(w * h)
  const INF = Number.MAX_SAFE_INTEGER

  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0

  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0 // ngoài ảnh = ngoài vùng
    return d[y * w + x]
  }

  // lượt thuận: trên→dưới, trái→phải
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]
      v = Math.min(v, at(x - 1, y) + D_ORTHO)
      v = Math.min(v, at(x, y - 1) + D_ORTHO)
      v = Math.min(v, at(x - 1, y - 1) + D_DIAG)
      v = Math.min(v, at(x + 1, y - 1) + D_DIAG)
      d[i] = v
    }
  }

  // lượt nghịch: dưới→trên, phải→trái
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]
      v = Math.min(v, at(x + 1, y) + D_ORTHO)
      v = Math.min(v, at(x, y + 1) + D_ORTHO)
      v = Math.min(v, at(x + 1, y + 1) + D_DIAG)
      v = Math.min(v, at(x - 1, y + 1) + D_DIAG)
      d[i] = v
    }
  }

  return d
}
```

- [ ] **Step 4: Viết test cho label-anchor**

`src/core/regions/__tests__/label-anchor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { computeAnchors } from '@/core/regions/label-anchor'
import type { RegionField } from '@/core/types'

function field(rows: string[]): RegionField {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return labelRegions(labels, width, height)
}

describe('computeAnchors', () => {
  it('hình vuông đặc: anchor ở tâm, bán kính ≈ nửa cạnh', () => {
    const rows = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 11 }, (_, x) =>
        x >= 1 && x <= 9 && y >= 1 && y <= 9 ? 'a' : 'b',
      ).join(''),
    )
    const out = computeAnchors(field(rows), 3)
    const aId = out.regionMap[5 * 11 + 5]
    const a = out.regions[aId]

    expect(a.anchorX).toBe(5)
    expect(a.anchorY).toBe(5)
    expect(a.anchorR).toBeCloseTo(5, 0)
    expect(a.hasLabel).toBe(true)
  })

  it('BẪY CENTROID: hình chữ C — anchor phải nằm TRONG vùng', () => {
    // 'a' là hình chữ C mở về bên phải; centroid của nó rơi vào lỗ 'b'
    const rows = [
      'aaaaaaa',
      'aaaaaaa',
      'aabbbbb',
      'aabbbbb',
      'aabbbbb',
      'aaaaaaa',
      'aaaaaaa',
    ]
    const f = field(rows)
    const out = computeAnchors(f, 1)

    for (const r of out.regions) {
      const idAtAnchor = out.regionMap[r.anchorY * 7 + r.anchorX]
      expect(idAtAnchor).toBe(r.id)
    }
  })

  it('bất biến: anchor của MỌI vùng luôn nằm trong vùng đó', () => {
    const rows = [
      'aabbccdd',
      'abbccdda',
      'bbccddaa',
      'bccddaab',
      'ccddaabb',
      'cddaabbc',
    ]
    const out = computeAnchors(field(rows), 1)
    for (const r of out.regions) {
      const id = out.regionMap[r.anchorY * 8 + r.anchorX]
      expect(id).toBe(r.id)
    }
  })

  it('vùng mỏng 1px → hasLabel false', () => {
    const rows = [
      'bbbbb',
      'aaaaa',
      'bbbbb',
    ]
    const out = computeAnchors(field(rows), 7)
    const aId = out.regionMap[1 * 5 + 2]
    expect(out.regions[aId].hasLabel).toBe(false)
    expect(out.regions[aId].anchorR).toBeLessThan(7)
  })

  it('hasLabel = anchorR >= minLabelRadius', () => {
    const rows = Array.from({ length: 21 }, (_, y) =>
      Array.from({ length: 21 }, (_, x) =>
        x >= 1 && x <= 19 && y >= 1 && y <= 19 ? 'a' : 'b',
      ).join(''),
    )
    const big = computeAnchors(field(rows), 7)
    const aId = big.regionMap[10 * 21 + 10]
    expect(big.regions[aId].anchorR).toBeGreaterThanOrEqual(7)
    expect(big.regions[aId].hasLabel).toBe(true)

    const strict = computeAnchors(field(rows), 100)
    expect(strict.regions[aId].hasLabel).toBe(false)
  })

  it('deterministic và không sửa field input', () => {
    const f = field(['aab', 'abb', 'bba'])
    const before = f.regions.map((r) => ({ ...r }))
    const a = computeAnchors(f, 2)
    const b = computeAnchors(f, 2)
    expect(a.regions).toEqual(b.regions)
    expect(f.regions).toEqual(before)
  })
})
```

- [ ] **Step 5: Implement label-anchor**

`src/core/regions/label-anchor.ts`:

```ts
import { chamferDistance } from '@/core/regions/distance-transform'
import type { RegionField, RegionMeta } from '@/core/types'

/**
 * Stage 5 — tìm chỗ đặt số cho từng vùng.
 *
 * Dùng "pole of inaccessibility" (điểm xa biên nhất) thay vì centroid: centroid
 * của vùng hình chữ C hay vành khuyên nằm NGOÀI vùng, sẽ in số lên vùng khác.
 *
 * Chỉ chạy distance transform trên bbox của từng vùng (cộng viền 1px) để
 * không phải quét cả ảnh cho mỗi vùng — với ~500 vùng thì đây là khác biệt
 * giữa vài chục ms và vài chục giây.
 */
export function computeAnchors(
  field: RegionField,
  minLabelRadius: number,
): RegionField {
  const { regionMap, regions, width, height } = field
  const out: RegionMeta[] = regions.map((r) => ({ ...r }))

  for (const r of out) {
    // bbox nới ra 1px mỗi phía để biên vùng luôn nằm trong mask cục bộ
    const x0 = Math.max(0, r.minX - 1)
    const y0 = Math.max(0, r.minY - 1)
    const x1 = Math.min(width - 1, r.maxX + 1)
    const y1 = Math.min(height - 1, r.maxY + 1)
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1

    const mask = new Uint8Array(bw * bh)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (regionMap[y * width + x] === r.id) {
          mask[(y - y0) * bw + (x - x0)] = 1
        }
      }
    }

    const dist = chamferDistance(mask, bw, bh)

    let bestI = -1
    let bestD = -1
    for (let i = 0; i < dist.length; i++) {
      // `>` chứ không `>=` ⇒ tie luôn về index nhỏ hơn (deterministic)
      if (dist[i] > bestD) {
        bestD = dist[i]
        bestI = i
      }
    }

    if (bestI < 0) {
      r.anchorX = r.minX
      r.anchorY = r.minY
      r.anchorR = 0
      r.hasLabel = false
      continue
    }

    const bx = bestI % bw
    const by = (bestI - bx) / bw
    r.anchorX = x0 + bx
    r.anchorY = y0 + by
    r.anchorR = bestD
    r.hasLabel = bestD >= minLabelRadius
  }

  return { regionMap, regions: out, width, height }
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/core/regions/__tests__/distance-transform.test.ts src/core/regions/__tests__/label-anchor.test.ts`
Expected: 11 passed

- [ ] **Step 7: Commit**

```bash
git add src/core/regions/distance-transform.ts src/core/regions/label-anchor.ts src/core/regions/__tests__/distance-transform.test.ts src/core/regions/__tests__/label-anchor.test.ts
git commit -m "feat(core): distance transform và chỗ đặt số tránh bẫy centroid

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Mask viền + pixel-run mỗi vùng (Stage 6)

**Files:**
- Create: `src/core/regions/outline.ts`, `src/core/regions/region-runs.ts`
- Test: `src/core/regions/__tests__/outline.test.ts`, `src/core/regions/__tests__/region-runs.test.ts`

**Interfaces:**
- Consumes: `RegionField`, `RegionRuns` (Task 2)
- Produces:
  - `buildOutline(field: RegionField): Uint8Array` — độ dài `w*h`, giá trị `255` tại pixel biên, `0` còn lại
  - `buildRegionRuns(field: RegionField): RegionRuns`

**Vì sao cần region-runs:** tô một vùng phải vẽ đúng pixel của vùng đó. Nếu mỗi lần tô lại quét cả `regionMap` 1.4M phần tử thì kéo-tô qua 50 vùng sẽ đứng máy. Runs cho phép tô bằng vài lệnh `fillRect` trên đúng các đoạn ngang của vùng.

- [ ] **Step 1: Viết test cho outline**

`src/core/regions/__tests__/outline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { buildOutline } from '@/core/regions/outline'
import type { RegionField } from '@/core/types'

function field(rows: string[]): RegionField {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return labelRegions(labels, width, height)
}

describe('buildOutline', () => {
  it('một vùng duy nhất → không có viền', () => {
    const o = buildOutline(field(['aaa', 'aaa']))
    expect(Array.from(o)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('cắt dọc: cột ngay trước ranh giới được đánh dấu', () => {
    const f = field(['aab', 'aab'])
    const o = buildOutline(f)
    // pixel (1,0) và (1,1) khác vùng với pixel bên phải ⇒ là biên
    expect(o[0 * 3 + 1]).toBe(255)
    expect(o[1 * 3 + 1]).toBe(255)
    // pixel (0,0) giống pixel phải và pixel dưới ⇒ không phải biên
    expect(o[0]).toBe(0)
  })

  it('cắt ngang: dòng ngay trên ranh giới được đánh dấu', () => {
    const f = field(['aa', 'bb'])
    const o = buildOutline(f)
    expect(o[0]).toBe(255)
    expect(o[1]).toBe(255)
    expect(o[2]).toBe(0)
    expect(o[3]).toBe(0)
  })

  it('chỉ có giá trị 0 hoặc 255', () => {
    const o = buildOutline(field(['abc', 'cab', 'bca']))
    for (const v of o) expect([0, 255]).toContain(v)
  })

  it('số pixel biên đúng như đếm tay', () => {
    // 4×2, cắt dọc tại x=2 ⇒ cột x=1 của cả 2 dòng là biên
    const o = buildOutline(field(['aabb', 'aabb']))
    const count = Array.from(o).filter((v) => v === 255).length
    expect(count).toBe(2)
  })
})
```

- [ ] **Step 2: Implement outline**

`src/core/regions/outline.ts`:

```ts
import type { RegionField } from '@/core/types'

/**
 * Stage 6 — mask viền 1px.
 * Pixel là biên nếu id vùng của nó khác pixel bên phải hoặc pixel bên dưới.
 * Quy ước "phải/dưới" (không phải cả 4 phía) cho nét mảnh đều 1px, không bị
 * dày lên 2px ở mỗi ranh giới.
 */
export function buildOutline(field: RegionField): Uint8Array {
  const { regionMap, width, height } = field
  const out = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const id = regionMap[p]
      const diffRight = x + 1 < width && regionMap[p + 1] !== id
      const diffDown = y + 1 < height && regionMap[p + width] !== id
      if (diffRight || diffDown) out[p] = 255
    }
  }

  return out
}
```

- [ ] **Step 3: Viết test cho region-runs**

`src/core/regions/__tests__/region-runs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { labelRegions } from '@/core/regions/connected-components'
import { buildRegionRuns } from '@/core/regions/region-runs'
import type { RegionField } from '@/core/types'

function field(rows: string[]): RegionField {
  const height = rows.length
  const width = rows[0].length
  const labels = new Uint8Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      labels[y * width + x] = seen.get(ch)!
    }
  })
  return labelRegions(labels, width, height)
}

describe('buildRegionRuns', () => {
  it('offsets có regionCount+1 phần tử, bắt đầu 0', () => {
    const f = field(['aab', 'aab'])
    const runs = buildRegionRuns(f)
    expect(runs.offsets).toHaveLength(f.regions.length + 1)
    expect(runs.offsets[0]).toBe(0)
  })

  it('hình chữ nhật 2×2 → 2 run, mỗi dòng một run', () => {
    const f = field(['aab', 'aab'])
    const runs = buildRegionRuns(f)
    const aId = f.regionMap[0]
    const start = runs.offsets[aId]
    const end = runs.offsets[aId + 1]
    expect(end - start).toBe(2)
    expect(runs.y[start]).toBe(0)
    expect(runs.x0[start]).toBe(0)
    expect(runs.x1[start]).toBe(1)
    expect(runs.y[start + 1]).toBe(1)
  })

  it('vùng bị ngắt trong cùng một dòng → nhiều run cho dòng đó', () => {
    // 'a' xuất hiện ở x=0 và x=2 trên dòng 0, bị 'b' chen giữa
    const f = field(['aba'])
    const runs = buildRegionRuns(f)
    // hai cụm 'a' là hai VÙNG khác nhau (4-hướng, không liền nhau)
    expect(f.regions).toHaveLength(3)
    for (const r of f.regions) {
      expect(runs.offsets[r.id + 1] - runs.offsets[r.id]).toBe(1)
    }
  })

  it('bất biến: run phủ đúng và đủ pixel của mỗi vùng', () => {
    const f = field([
      'aabbcc',
      'abbcca',
      'bbccaa',
      'bccaab',
    ])
    const runs = buildRegionRuns(f)

    const painted = new Int32Array(f.width * f.height).fill(-1)
    for (const r of f.regions) {
      for (let i = runs.offsets[r.id]; i < runs.offsets[r.id + 1]; i++) {
        for (let x = runs.x0[i]; x <= runs.x1[i]; x++) {
          const p = runs.y[i] * f.width + x
          expect(painted[p]).toBe(-1) // không run nào phủ trùng
          painted[p] = r.id
        }
      }
    }
    expect(Array.from(painted)).toEqual(Array.from(f.regionMap))
  })

  it('bất biến: tổng độ dài run của một vùng = area của vùng đó', () => {
    const f = field([
      'aabbcc',
      'abbcca',
      'bbccaa',
    ])
    const runs = buildRegionRuns(f)
    for (const r of f.regions) {
      let sum = 0
      for (let i = runs.offsets[r.id]; i < runs.offsets[r.id + 1]; i++) {
        sum += runs.x1[i] - runs.x0[i] + 1
      }
      expect(sum).toBe(r.area)
    }
  })

  it('run của mỗi vùng sắp theo y tăng dần rồi x0 tăng dần', () => {
    const f = field([
      'aaaa',
      'abba',
      'aaaa',
    ])
    const runs = buildRegionRuns(f)
    const aId = f.regionMap[0]
    let prevY = -1
    let prevX0 = -1
    for (let i = runs.offsets[aId]; i < runs.offsets[aId + 1]; i++) {
      if (runs.y[i] === prevY) expect(runs.x0[i]).toBeGreaterThan(prevX0)
      else expect(runs.y[i]).toBeGreaterThan(prevY)
      prevY = runs.y[i]
      prevX0 = runs.x0[i]
    }
  })
})
```

- [ ] **Step 4: Chạy test để chắc là fail**

Run: `npx vitest run src/core/regions/__tests__/outline.test.ts src/core/regions/__tests__/region-runs.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 5: Implement region-runs**

`src/core/regions/region-runs.ts`:

```ts
import type { RegionField, RegionRuns } from '@/core/types'

/**
 * Cắt mỗi vùng thành các đoạn ngang (run) liên tục.
 * Lưu phẳng theo CSR: run của vùng i nằm ở [offsets[i], offsets[i+1]).
 *
 * Nhờ đó việc tô một vùng chỉ cần vài lệnh fillRect trên đúng các đoạn của
 * nó, thay vì quét toàn bộ regionMap mỗi lần bấm.
 *
 * Quét 2 lượt: lượt 1 đếm số run mỗi vùng để cấp mảng đúng kích thước,
 * lượt 2 điền — tránh dùng array-of-arrays rồi flatten.
 */
export function buildRegionRuns(field: RegionField): RegionRuns {
  const { regionMap, regions, width, height } = field
  const count = regions.length

  const perRegion = new Uint32Array(count)
  let totalRuns = 0

  // lượt 1: đếm
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const id = regionMap[y * width + x]
      let end = x
      while (end + 1 < width && regionMap[y * width + end + 1] === id) end++
      perRegion[id]++
      totalRuns++
      x = end + 1
    }
  }

  const offsets = new Uint32Array(count + 1)
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + perRegion[i]

  const cursor = new Uint32Array(offsets.subarray(0, count))
  const yArr = new Uint32Array(totalRuns)
  const x0Arr = new Uint32Array(totalRuns)
  const x1Arr = new Uint32Array(totalRuns)

  // lượt 2: điền
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const id = regionMap[y * width + x]
      let end = x
      while (end + 1 < width && regionMap[y * width + end + 1] === id) end++
      const at = cursor[id]++
      yArr[at] = y
      x0Arr[at] = x
      x1Arr[at] = end
      x = end + 1
    }
  }

  return { offsets, y: yArr, x0: x0Arr, x1: x1Arr }
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/core/regions/__tests__/outline.test.ts src/core/regions/__tests__/region-runs.test.ts`
Expected: 11 passed

- [ ] **Step 7: Commit**

```bash
git add src/core/regions/outline.ts src/core/regions/region-runs.ts src/core/regions/__tests__/outline.test.ts src/core/regions/__tests__/region-runs.test.ts
git commit -m "feat(core): mask viền 1px và pixel-run mỗi vùng

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: RLE theo dòng + bitset tiến độ

**Files:**
- Create: `src/core/codec/rle.ts`, `src/core/codec/bitset.ts`
- Test: `src/core/codec/__tests__/rle.test.ts`, `src/core/codec/__tests__/bitset.test.ts`

**Interfaces:**
- Consumes: không có (thuần typed array)
- Produces:
  - `encodeRowRle(map: Uint32Array, width: number, height: number): Uint32Array` — cặp `[runLength, value]` nối tiếp, run không vắt qua dòng
  - `decodeRowRle(rle: Uint32Array, width: number, height: number): Uint32Array`
  - `class Bitset` với `get(i)`, `set(i, v)`, `countOnes()`, `or(other)`, `toBytes()`, `static fromBytes(bytes, bitLength)`, `clear()`, `get bitLength()`

**Vì sao run không vắt qua dòng:** giữ RLE khớp đúng với region-runs (Task 12) và làm việc giải mã theo dòng đơn giản, không phải xử lý trường hợp một run bị cắt bởi biên phải của ảnh.

**Vì sao bitset cần `or`:** hợp nhất tiến độ giữa 2 thiết bị. Hai bên chỉ *thêm* vùng đã tô, nên OR là phép hợp nhất đúng, không mất dữ liệu (spec §14). Plan 2 sẽ dùng.

- [ ] **Step 1: Viết test cho rle**

`src/core/codec/__tests__/rle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeRowRle, encodeRowRle } from '@/core/codec/rle'

describe('encodeRowRle / decodeRowRle', () => {
  it('vùng phẳng nén cực mạnh', () => {
    const map = new Uint32Array(100).fill(7)
    const rle = encodeRowRle(map, 10, 10)
    // 10 dòng × 1 run × 2 số = 20
    expect(rle).toHaveLength(20)
    expect(rle[0]).toBe(10)
    expect(rle[1]).toBe(7)
  })

  it('đi vòng về đúng dữ liệu gốc', () => {
    const w = 7
    const h = 5
    const map = new Uint32Array(w * h)
    for (let i = 0; i < map.length; i++) map[i] = (i * 3) % 4
    const back = decodeRowRle(encodeRowRle(map, w, h), w, h)
    expect(Array.from(back)).toEqual(Array.from(map))
  })

  it('run không vắt qua biên dòng', () => {
    // toàn bộ cùng giá trị, 2 dòng ⇒ phải ra 2 run chứ không phải 1
    const map = new Uint32Array(6).fill(1)
    const rle = encodeRowRle(map, 3, 2)
    expect(rle).toHaveLength(4)
    expect(Array.from(rle)).toEqual([3, 1, 3, 1])
  })

  it('xử lý id vùng lớn (vượt 16 bit)', () => {
    const map = new Uint32Array([70000, 70000, 999999])
    const back = decodeRowRle(encodeRowRle(map, 3, 1), 3, 1)
    expect(Array.from(back)).toEqual([70000, 70000, 999999])
  })

  it('mỗi pixel một giá trị khác nhau: kích thước = 2*n', () => {
    const map = new Uint32Array([1, 2, 3, 4])
    expect(encodeRowRle(map, 4, 1)).toHaveLength(8)
  })

  it('decode với dữ liệu không khớp kích thước thì báo lỗi', () => {
    const rle = new Uint32Array([2, 5])
    expect(() => decodeRowRle(rle, 3, 1)).toThrow(/không khớp/i)
  })

  it('đi vòng trên dữ liệu lớn', () => {
    const w = 200
    const h = 150
    const map = new Uint32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        map[y * w + x] = Math.floor(x / 20) + Math.floor(y / 15) * 10
      }
    }
    const back = decodeRowRle(encodeRowRle(map, w, h), w, h)
    expect(Array.from(back)).toEqual(Array.from(map))
  })
})
```

- [ ] **Step 2: Implement rle**

`src/core/codec/rle.ts`:

```ts
/**
 * RLE theo dòng cho bản đồ id vùng.
 * Đầu ra là các cặp [runLength, value] nối tiếp. Run KHÔNG vắt qua biên
 * dòng — giữ định dạng khớp với region-runs và làm việc giải mã đơn giản.
 */
export function encodeRowRle(
  map: Uint32Array,
  width: number,
  height: number,
): Uint32Array {
  const out: number[] = []
  for (let y = 0; y < height; y++) {
    let x = 0
    while (x < width) {
      const v = map[y * width + x]
      let len = 1
      while (x + len < width && map[y * width + x + len] === v) len++
      out.push(len, v)
      x += len
    }
  }
  return new Uint32Array(out)
}

export function decodeRowRle(
  rle: Uint32Array,
  width: number,
  height: number,
): Uint32Array {
  const map = new Uint32Array(width * height)
  let p = 0
  for (let i = 0; i < rle.length; i += 2) {
    const len = rle[i]
    const v = rle[i + 1]
    for (let j = 0; j < len; j++) {
      if (p >= map.length) {
        throw new Error('RLE không khớp kích thước ảnh: dữ liệu dài hơn width*height')
      }
      map[p++] = v
    }
  }
  if (p !== map.length) {
    throw new Error(
      `RLE không khớp kích thước ảnh: giải ra ${p} pixel, cần ${map.length}`,
    )
  }
  return map
}
```

- [ ] **Step 3: Viết test cho bitset**

`src/core/codec/__tests__/bitset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Bitset } from '@/core/codec/bitset'

describe('Bitset', () => {
  it('mặc định toàn bộ bit là 0', () => {
    const b = new Bitset(20)
    expect(b.bitLength).toBe(20)
    expect(b.countOnes()).toBe(0)
    expect(b.get(0)).toBe(false)
    expect(b.get(19)).toBe(false)
  })

  it('set rồi get đúng, kể cả qua biên byte', () => {
    const b = new Bitset(20)
    for (const i of [0, 7, 8, 15, 16, 19]) b.set(i, true)
    for (const i of [0, 7, 8, 15, 16, 19]) expect(b.get(i)).toBe(true)
    for (const i of [1, 6, 9, 14, 17, 18]) expect(b.get(i)).toBe(false)
    expect(b.countOnes()).toBe(6)
  })

  it('set false xoá bit', () => {
    const b = new Bitset(8)
    b.set(3, true)
    expect(b.countOnes()).toBe(1)
    b.set(3, false)
    expect(b.countOnes()).toBe(0)
  })

  it('set cùng bit hai lần không làm countOnes tăng gấp đôi', () => {
    const b = new Bitset(8)
    b.set(2, true)
    b.set(2, true)
    expect(b.countOnes()).toBe(1)
  })

  it('or hợp nhất hai bên, không mất bit nào', () => {
    const a = new Bitset(10)
    const b = new Bitset(10)
    a.set(1, true)
    a.set(5, true)
    b.set(5, true)
    b.set(9, true)

    a.or(b)
    expect(a.get(1)).toBe(true)
    expect(a.get(5)).toBe(true)
    expect(a.get(9)).toBe(true)
    expect(a.countOnes()).toBe(3)
  })

  it('or với độ dài khác nhau thì báo lỗi', () => {
    expect(() => new Bitset(8).or(new Bitset(9))).toThrow(/độ dài/i)
  })

  it('toBytes / fromBytes đi vòng đúng', () => {
    const a = new Bitset(21)
    for (const i of [0, 3, 8, 20]) a.set(i, true)
    const back = Bitset.fromBytes(a.toBytes(), 21)
    expect(back.bitLength).toBe(21)
    expect(back.countOnes()).toBe(4)
    for (const i of [0, 3, 8, 20]) expect(back.get(i)).toBe(true)
  })

  it('toBytes có đúng ceil(bitLength/8) byte', () => {
    expect(new Bitset(1).toBytes()).toHaveLength(1)
    expect(new Bitset(8).toBytes()).toHaveLength(1)
    expect(new Bitset(9).toBytes()).toHaveLength(2)
    expect(new Bitset(800).toBytes()).toHaveLength(100)
  })

  it('toBytes trả bản sao, sửa nó không ảnh hưởng bitset', () => {
    const b = new Bitset(8)
    b.set(0, true)
    const bytes = b.toBytes()
    bytes[0] = 0
    expect(b.get(0)).toBe(true)
  })

  it('clear xoá hết', () => {
    const b = new Bitset(16)
    b.set(1, true)
    b.set(15, true)
    b.clear()
    expect(b.countOnes()).toBe(0)
  })

  it('get/set ngoài phạm vi thì báo lỗi', () => {
    const b = new Bitset(8)
    expect(() => b.get(8)).toThrow(/ngoài phạm vi/i)
    expect(() => b.set(-1, true)).toThrow(/ngoài phạm vi/i)
  })

  it('fromBytes với buffer quá ngắn thì báo lỗi', () => {
    expect(() => Bitset.fromBytes(new Uint8Array(1), 20)).toThrow(/quá ngắn/i)
  })
})
```

- [ ] **Step 4: Chạy test để chắc là fail**

Run: `npx vitest run src/core/codec`
Expected: FAIL — không resolve được import

- [ ] **Step 5: Implement bitset**

`src/core/codec/bitset.ts`:

```ts
/** bảng đếm bit 1 trong một byte, tính trước */
const POPCOUNT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1]
}

/**
 * Bitset cho tiến độ tô: 1 bit mỗi vùng.
 * Vì đã chặn tô sai, vùng chỉ có "chưa tô" hoặc "đã tô đúng" ⇒ 1 bit là đủ.
 * 800 vùng = 100 byte, nên đồng bộ gần như tức thì.
 */
export class Bitset {
  private bytes: Uint8Array
  private length: number
  private ones = 0

  constructor(bitLength: number) {
    this.length = bitLength
    this.bytes = new Uint8Array(Math.ceil(bitLength / 8))
  }

  get bitLength(): number {
    return this.length
  }

  private assertIndex(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.length) {
      throw new Error(`Chỉ số bit ${i} ngoài phạm vi 0..${this.length - 1}`)
    }
  }

  get(i: number): boolean {
    this.assertIndex(i)
    return (this.bytes[i >> 3] & (1 << (i & 7))) !== 0
  }

  set(i: number, value: boolean): void {
    this.assertIndex(i)
    const byte = i >> 3
    const bit = 1 << (i & 7)
    const had = (this.bytes[byte] & bit) !== 0
    if (value && !had) {
      this.bytes[byte] |= bit
      this.ones++
    } else if (!value && had) {
      this.bytes[byte] &= ~bit
      this.ones--
    }
  }

  countOnes(): number {
    return this.ones
  }

  /**
   * Hợp nhất tại chỗ bằng OR. Đây là phép hợp nhất đúng cho tiến độ tô giữa
   * nhiều thiết bị: cả hai bên chỉ thêm vùng đã tô, không bên nào xoá.
   */
  or(other: Bitset): void {
    if (other.length !== this.length) {
      throw new Error(
        `Không thể OR hai bitset khác độ dài: ${this.length} vs ${other.length}`,
      )
    }
    for (let i = 0; i < this.bytes.length; i++) this.bytes[i] |= other.bytes[i]
    this.recount()
  }

  clear(): void {
    this.bytes.fill(0)
    this.ones = 0
  }

  /** trả về BẢN SAO, sửa nó không ảnh hưởng bitset */
  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes)
  }

  static fromBytes(bytes: Uint8Array, bitLength: number): Bitset {
    const need = Math.ceil(bitLength / 8)
    if (bytes.length < need) {
      throw new Error(
        `Buffer quá ngắn: có ${bytes.length} byte, cần ${need} cho ${bitLength} bit`,
      )
    }
    const b = new Bitset(bitLength)
    b.bytes.set(bytes.subarray(0, need))
    // xoá các bit rác ở byte cuối để countOnes không tính sai
    const extra = need * 8 - bitLength
    if (extra > 0) b.bytes[need - 1] &= 0xff >> extra
    b.recount()
    return b
  }

  private recount(): void {
    let n = 0
    for (const byte of this.bytes) n += POPCOUNT[byte]
    this.ones = n
  }
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/core/codec`
Expected: 19 passed

- [ ] **Step 7: Commit**

```bash
git add src/core/codec
git commit -m "feat(core): RLE theo dòng và bitset tiến độ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Định dạng nhị phân puzzle (Stage 7)

**Files:**
- Create: `src/core/codec/puzzle-format.ts`
- Test: `src/core/codec/__tests__/puzzle-format.test.ts`

**Interfaces:**
- Consumes: `encodeRowRle`/`decodeRowRle` (Task 13), `buildOutline` (Task 12), `buildRegionRuns` (Task 12), `Puzzle`, `RegionMeta`, `Rgb` (Task 2)
- Produces:
  - `interface PuzzleBin { width: number; height: number; palette: Rgb[]; regionCount: number; regionMap: Uint32Array }`
  - `encodePuzzleBin(bin: PuzzleBin): Uint8Array`
  - `decodePuzzleBin(bytes: Uint8Array): PuzzleBin`
  - `encodeRegions(regions: RegionMeta[]): string`
  - `decodeRegions(json: string): RegionMeta[]`
  - `assemblePuzzle(bin: PuzzleBin, regions: RegionMeta[]): Puzzle`

**Không lưu `outline` và `runs`.** Cả hai derive được từ `regionMap` trong một lượt quét O(n) khi giải mã, nên lưu chúng chỉ làm file to gấp mấy lần mà không nhanh hơn. `assemblePuzzle` dựng lại chúng.

**Hai blob riêng (`puzzle.bin` + `regions.json`), không gộp một file.** Plan 2 cần cấp quyền đọc `regions` cho người nhận link chia sẻ nhưng chặn ảnh gốc; giữ riêng từ đầu thì không phải đập ra làm lại.

**Dùng `DataView` với little-endian tường minh** cho mọi số nhiều byte — tránh hẳn vấn đề căn lề khi tạo view typed-array trên buffer lệch offset.

- [ ] **Step 1: Viết test**

`src/core/codec/__tests__/puzzle-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  assemblePuzzle,
  decodePuzzleBin,
  decodeRegions,
  encodePuzzleBin,
  encodeRegions,
  type PuzzleBin,
} from '@/core/codec/puzzle-format'
import type { RegionMeta, Rgb } from '@/core/types'

function sampleBin(): PuzzleBin {
  // 4×3: cột 0-1 vùng 0, cột 2-3 vùng 1
  const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1])
  const palette: Rgb[] = [
    [10, 20, 30],
    [200, 100, 50],
  ]
  return { width: 4, height: 3, palette, regionCount: 2, regionMap }
}

function sampleRegions(): RegionMeta[] {
  return [
    { id: 0, colorIndex: 0, area: 6, minX: 0, minY: 0, maxX: 1, maxY: 2, anchorX: 0, anchorY: 1, anchorR: 1, hasLabel: true },
    { id: 1, colorIndex: 1, area: 6, minX: 2, minY: 0, maxX: 3, maxY: 2, anchorX: 3, anchorY: 1, anchorR: 1, hasLabel: false },
  ]
}

describe('encodePuzzleBin / decodePuzzleBin', () => {
  it('đi vòng về đúng dữ liệu gốc', () => {
    const bin = sampleBin()
    const back = decodePuzzleBin(encodePuzzleBin(bin))

    expect(back.width).toBe(4)
    expect(back.height).toBe(3)
    expect(back.regionCount).toBe(2)
    expect(back.palette).toEqual(bin.palette)
    expect(Array.from(back.regionMap)).toEqual(Array.from(bin.regionMap))
  })

  it('đi vòng đúng với id vùng lớn và palette 24 màu', () => {
    const palette: Rgb[] = Array.from({ length: 24 }, (_, i) => [i * 10, 255 - i * 10, i] as Rgb)
    const regionMap = new Uint32Array(60)
    for (let i = 0; i < 60; i++) regionMap[i] = i * 1000
    const bin: PuzzleBin = { width: 10, height: 6, palette, regionCount: 60000, regionMap }

    const back = decodePuzzleBin(encodePuzzleBin(bin))
    expect(back.palette).toEqual(palette)
    expect(back.regionCount).toBe(60000)
    expect(Array.from(back.regionMap)).toEqual(Array.from(regionMap))
  })

  it('magic sai → báo lỗi rõ ràng', () => {
    const bytes = encodePuzzleBin(sampleBin())
    bytes[0] = 0
    expect(() => decodePuzzleBin(bytes)).toThrow(/không phải file puzzle/i)
  })

  it('version không hỗ trợ → báo lỗi kèm số version', () => {
    const bytes = encodePuzzleBin(sampleBin())
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(4, 99, true)
    expect(() => decodePuzzleBin(bytes)).toThrow(/version 99/i)
  })

  it('buffer bị cắt ngắn → báo lỗi thay vì trả dữ liệu rác', () => {
    const bytes = encodePuzzleBin(sampleBin())
    expect(() => decodePuzzleBin(bytes.slice(0, bytes.length - 4))).toThrow(/cắt ngắn|không khớp/i)
  })

  it('buffer nhỏ hơn cả header → báo lỗi', () => {
    expect(() => decodePuzzleBin(new Uint8Array(5))).toThrow(/quá nhỏ/i)
  })

  it('deterministic — encode 2 lần ra byte y hệt', () => {
    const bin = sampleBin()
    expect(Array.from(encodePuzzleBin(bin))).toEqual(Array.from(encodePuzzleBin(bin)))
  })

  it('vùng phẳng lớn nén nhỏ hơn nhiều so với dữ liệu thô', () => {
    const w = 200
    const h = 200
    const bin: PuzzleBin = {
      width: w,
      height: h,
      palette: [[0, 0, 0]],
      regionCount: 1,
      regionMap: new Uint32Array(w * h),
    }
    const bytes = encodePuzzleBin(bin)
    expect(bytes.length).toBeLessThan(w * h * 4 * 0.05)
  })
})

describe('encodeRegions / decodeRegions', () => {
  it('đi vòng về đúng dữ liệu gốc', () => {
    const r = sampleRegions()
    expect(decodeRegions(encodeRegions(r))).toEqual(r)
  })

  it('JSON không phải mảng → báo lỗi', () => {
    expect(() => decodeRegions('{"a":1}')).toThrow(/phải là mảng/i)
  })

  it('thiếu trường bắt buộc → báo lỗi kèm chỉ số', () => {
    expect(() => decodeRegions('[{"id":0}]')).toThrow(/vùng 0/i)
  })
})

describe('assemblePuzzle', () => {
  it('dựng lại outline và runs từ regionMap', () => {
    const p = assemblePuzzle(sampleBin(), sampleRegions())

    expect(p.width).toBe(4)
    expect(p.height).toBe(3)
    expect(p.regions).toHaveLength(2)
    expect(p.outline).toHaveLength(12)
    // cột x=1 là biên vì bên phải khác vùng
    expect(p.outline[0 * 4 + 1]).toBe(255)
    expect(p.outline[0 * 4 + 0]).toBe(0)

    // vùng 0 có 3 run (một mỗi dòng)
    expect(p.runs.offsets[1] - p.runs.offsets[0]).toBe(3)
  })

  it('báo lỗi khi regionCount không khớp số phần tử regions', () => {
    const bin = sampleBin()
    expect(() => assemblePuzzle(bin, [sampleRegions()[0]])).toThrow(/không khớp/i)
  })

  it('báo lỗi khi id vùng không liên tục từ 0', () => {
    const bad = sampleRegions()
    bad[1] = { ...bad[1], id: 5 }
    expect(() => assemblePuzzle(sampleBin(), bad)).toThrow(/liên tục/i)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/codec/__tests__/puzzle-format.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/codec/puzzle-format.ts`:

```ts
import { decodeRowRle, encodeRowRle } from '@/core/codec/rle'
import { buildOutline } from '@/core/regions/outline'
import { buildRegionRuns } from '@/core/regions/region-runs'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

/** 'PKL1' — Pokemon coLor v1 */
const MAGIC = 0x504b4c31
const VERSION = 1
const HEADER_BYTES = 24

export interface PuzzleBin {
  width: number
  height: number
  palette: Rgb[]
  regionCount: number
  regionMap: Uint32Array
}

/**
 * Bố cục (little-endian tường minh qua DataView, nên không có vấn đề căn lề):
 *   0   u32  magic
 *   4   u16  version
 *   6   u16  paletteLength
 *   8   u32  width
 *   12  u32  height
 *   16  u32  regionCount
 *   20  u32  rleLength (số phần tử u32, = 2 × số run)
 *   24   ..  palette, 3 byte mỗi màu
 *   ..   ..  RLE payload, rleLength × u32
 */
export function encodePuzzleBin(bin: PuzzleBin): Uint8Array {
  const rle = encodeRowRle(bin.regionMap, bin.width, bin.height)
  const total = HEADER_BYTES + bin.palette.length * 3 + rle.length * 4

  const bytes = new Uint8Array(total)
  const dv = new DataView(bytes.buffer)

  dv.setUint32(0, MAGIC, true)
  dv.setUint16(4, VERSION, true)
  dv.setUint16(6, bin.palette.length, true)
  dv.setUint32(8, bin.width, true)
  dv.setUint32(12, bin.height, true)
  dv.setUint32(16, bin.regionCount, true)
  dv.setUint32(20, rle.length, true)

  let o = HEADER_BYTES
  for (const c of bin.palette) {
    bytes[o++] = c[0]
    bytes[o++] = c[1]
    bytes[o++] = c[2]
  }
  for (let i = 0; i < rle.length; i++) {
    dv.setUint32(o, rle[i], true)
    o += 4
  }

  return bytes
}

export function decodePuzzleBin(bytes: Uint8Array): PuzzleBin {
  if (bytes.length < HEADER_BYTES) {
    throw new Error(`Buffer quá nhỏ: ${bytes.length} byte, header cần ${HEADER_BYTES}`)
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('Đây không phải file puzzle hợp lệ (magic không đúng)')
  }
  const version = dv.getUint16(4, true)
  if (version !== VERSION) {
    throw new Error(`Không hỗ trợ file puzzle version ${version}, cần version ${VERSION}`)
  }

  const paletteLength = dv.getUint16(6, true)
  const width = dv.getUint32(8, true)
  const height = dv.getUint32(12, true)
  const regionCount = dv.getUint32(16, true)
  const rleLength = dv.getUint32(20, true)

  const expected = HEADER_BYTES + paletteLength * 3 + rleLength * 4
  if (bytes.length < expected) {
    throw new Error(
      `File puzzle bị cắt ngắn: có ${bytes.length} byte, cần ${expected}`,
    )
  }

  let o = HEADER_BYTES
  const palette: Rgb[] = []
  for (let i = 0; i < paletteLength; i++) {
    palette.push([bytes[o], bytes[o + 1], bytes[o + 2]])
    o += 3
  }

  const rle = new Uint32Array(rleLength)
  for (let i = 0; i < rleLength; i++) {
    rle[i] = dv.getUint32(o, true)
    o += 4
  }

  const regionMap = decodeRowRle(rle, width, height)
  return { width, height, palette, regionCount, regionMap }
}

const REGION_KEYS = [
  'id',
  'colorIndex',
  'area',
  'minX',
  'minY',
  'maxX',
  'maxY',
  'anchorX',
  'anchorY',
  'anchorR',
  'hasLabel',
] as const

export function encodeRegions(regions: RegionMeta[]): string {
  return JSON.stringify(regions)
}

export function decodeRegions(json: string): RegionMeta[] {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed)) {
    throw new Error('Dữ liệu vùng phải là mảng')
  }
  parsed.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) {
      throw new Error(`Dữ liệu vùng ${i} không phải object`)
    }
    for (const key of REGION_KEYS) {
      if (!(key in (r as Record<string, unknown>))) {
        throw new Error(`Dữ liệu vùng ${i} thiếu trường "${key}"`)
      }
    }
  })
  return parsed as RegionMeta[]
}

/**
 * Ghép bin + regions thành Puzzle chơi được.
 * `outline` và `runs` KHÔNG được lưu trong file — derive tại đây trong một
 * lượt quét O(n), rẻ hơn nhiều so với việc phình file lên mấy lần.
 */
export function assemblePuzzle(bin: PuzzleBin, regions: RegionMeta[]): Puzzle {
  if (regions.length !== bin.regionCount) {
    throw new Error(
      `Số vùng không khớp: header ghi ${bin.regionCount}, dữ liệu có ${regions.length}`,
    )
  }
  regions.forEach((r, i) => {
    if (r.id !== i) {
      throw new Error(`Id vùng phải liên tục từ 0: vùng thứ ${i} có id ${r.id}`)
    }
  })

  const field = {
    regionMap: bin.regionMap,
    regions,
    width: bin.width,
    height: bin.height,
  }

  return {
    width: bin.width,
    height: bin.height,
    palette: bin.palette,
    regionMap: bin.regionMap,
    regions,
    runs: buildRegionRuns(field),
    outline: buildOutline(field),
  }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/codec/__tests__/puzzle-format.test.ts`
Expected: 14 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/codec/puzzle-format.ts src/core/codec/__tests__/puzzle-format.test.ts
git commit -m "feat(core): định dạng nhị phân puzzle và ghép Puzzle chơi được

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Pipeline — xâu Stage 0→7 + bisection `minArea`

**Files:**
- Create: `src/core/pipeline.ts`
- Test: `src/core/__tests__/pipeline.test.ts`

**Interfaces:**
- Consumes: mọi thứ từ Task 3–14
- Produces:
  - `interface PipelineResult { puzzle: Puzzle; bin: PuzzleBin; usedMinArea: number }`
  - `runPipeline(img: RgbaImage, params: PipelineParams, onProgress?: ProgressFn): PipelineResult`
  - `resizeToMaxDim(img: RgbaImage, maxDim: number): RgbaImage` — export riêng để test được Stage 0

**Bisection `minArea` chỉ chạy lại Stage 3→4.** Stage 0–2 (resize, median, bilateral, quantize) là phần đắt nhất và **không phụ thuộc `minArea`**, nên cache `labels` rồi chỉ lặp lại `labelRegions` + `mergeSmallRegions`. Tối đa 6 vòng, mục tiêu `targetRegions` ±25%.

**Stage 0 không decode ảnh** — `runPipeline` nhận `RgbaImage` đã decode. Decode cần `createImageBitmap`/`OffscreenCanvas` (DOM), nên thuộc `src/data/decode-image.ts` (Task 21), không được nằm trong `core/`.

- [ ] **Step 1: Viết test**

`src/core/__tests__/pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resizeToMaxDim, runPipeline } from '@/core/pipeline'
import { DEFAULT_PARAMS, type PipelineParams, type PipelineStage, type RgbaImage } from '@/core/types'

function make(
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

/** 4 góc 4 màu rời nhau rõ rệt + chút noise để bắt buộc phải làm phẳng */
function fourQuadrants(size = 64): RgbaImage {
  const colors: [number, number, number][] = [
    [220, 30, 30],
    [30, 200, 60],
    [40, 70, 220],
    [240, 230, 40],
  ]
  return make(size, size, (x, y) => {
    const q = (y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1)
    const c = colors[q]
    // noise xác định (không dùng random) để giữ test deterministic
    const n = ((x * 7 + y * 13) % 5) - 2
    return [c[0] + n, c[1] + n, c[2] + n]
  })
}

const params = (over: Partial<PipelineParams> = {}): PipelineParams => ({
  ...DEFAULT_PARAMS,
  ...over,
})

describe('resizeToMaxDim', () => {
  it('không đổi khi ảnh đã nhỏ hơn maxDim', () => {
    const img = make(50, 30, () => [1, 2, 3])
    const out = resizeToMaxDim(img, 100)
    expect(out.width).toBe(50)
    expect(out.height).toBe(30)
  })

  it('thu nhỏ theo cạnh dài, giữ tỉ lệ', () => {
    const img = make(400, 200, () => [1, 2, 3])
    const out = resizeToMaxDim(img, 100)
    expect(out.width).toBe(100)
    expect(out.height).toBe(50)
  })

  it('thu nhỏ theo cạnh dài khi ảnh dọc', () => {
    const img = make(200, 400, () => [1, 2, 3])
    const out = resizeToMaxDim(img, 100)
    expect(out.width).toBe(50)
    expect(out.height).toBe(100)
  })

  it('giữ màu của vùng phẳng khi thu nhỏ', () => {
    const img = make(40, 40, () => [10, 120, 250])
    const out = resizeToMaxDim(img, 20)
    const i = (10 * 20 + 10) * 4
    expect(out.data[i]).toBeCloseTo(10, -1)
    expect(out.data[i + 1]).toBeCloseTo(120, -1)
    expect(out.data[i + 2]).toBeCloseTo(250, -1)
  })

  it('không bao giờ ra kích thước 0', () => {
    const img = make(1000, 3, () => [0, 0, 0])
    const out = resizeToMaxDim(img, 10)
    expect(out.width).toBe(10)
    expect(out.height).toBeGreaterThanOrEqual(1)
  })
})

describe('runPipeline', () => {
  it('ảnh 4 góc 4 màu → khoảng 4 vùng', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 4, minArea: 40, targetRegions: 4 }))
    expect(r.puzzle.regions.length).toBeGreaterThanOrEqual(4)
    expect(r.puzzle.regions.length).toBeLessThanOrEqual(8)
  })

  it('DETERMINISTIC: chạy 2 lần ra byte y hệt', () => {
    const img = fourQuadrants()
    const p = params({ k: 6, minArea: 30 })
    const a = runPipeline(img, p)
    const b = runPipeline(img, p)

    expect(Array.from(a.puzzle.regionMap)).toEqual(Array.from(b.puzzle.regionMap))
    expect(a.puzzle.regions).toEqual(b.puzzle.regions)
    expect(a.puzzle.palette).toEqual(b.puzzle.palette)
    expect(Array.from(a.puzzle.outline)).toEqual(Array.from(b.puzzle.outline))
    expect(a.usedMinArea).toBe(b.usedMinArea)
  })

  it('phát progress cho đủ 8 stage, đúng thứ tự', () => {
    const seen: PipelineStage[] = []
    runPipeline(fourQuadrants(), params({ k: 4, minArea: 40 }), (p) => {
      if (seen[seen.length - 1] !== p.stage) seen.push(p.stage)
    })
    expect(seen).toEqual([
      'chuan-hoa',
      'lam-phang',
      'quantize',
      'tach-vung',
      'gop-vung-vun',
      'dat-so',
      've-vien',
      'dong-goi',
    ])
  })

  it('minArea = auto dò được giá trị đưa số vùng về gần mục tiêu', () => {
    // ảnh nhiều chi tiết để có dư địa dò
    const img = make(96, 96, (x, y) => {
      const v = ((Math.floor(x / 4) * 37 + Math.floor(y / 4) * 61) % 5) * 50
      return [v, 255 - v, (v * 2) % 256]
    })
    const r = runPipeline(img, params({ k: 8, minArea: 'auto', targetRegions: 40 }))

    expect(r.usedMinArea).toBeGreaterThan(0)
    expect(r.puzzle.regions.length).toBeGreaterThanOrEqual(40 * 0.4)
    expect(r.puzzle.regions.length).toBeLessThanOrEqual(40 * 2.5)
  })

  it('minArea số cụ thể thì dùng đúng số đó, không dò', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 4, minArea: 55 }))
    expect(r.usedMinArea).toBe(55)
  })

  it('bất biến: mọi vùng có area >= usedMinArea (trừ khi chỉ còn 1 vùng)', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 50 }))
    if (r.puzzle.regions.length > 1) {
      for (const region of r.puzzle.regions) {
        expect(region.area).toBeGreaterThanOrEqual(50)
      }
    }
  })

  it('bất biến: anchor của mọi vùng nằm trong vùng đó', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 30 }))
    const { regionMap, width, regions } = r.puzzle
    for (const region of regions) {
      expect(regionMap[region.anchorY * width + region.anchorX]).toBe(region.id)
    }
  })

  it('bất biến: tổng diện tích vùng = width*height', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 30 }))
    const total = r.puzzle.regions.reduce((s, x) => s + x.area, 0)
    expect(total).toBe(r.puzzle.width * r.puzzle.height)
  })

  it('bất biến: mọi colorIndex nằm trong [0, palette.length)', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 6, minArea: 30 }))
    for (const region of r.puzzle.regions) {
      expect(region.colorIndex).toBeGreaterThanOrEqual(0)
      expect(region.colorIndex).toBeLessThan(r.puzzle.palette.length)
    }
  })

  it('bin trả về encode/decode được và khớp puzzle', () => {
    const r = runPipeline(fourQuadrants(), params({ k: 4, minArea: 40 }))
    expect(r.bin.width).toBe(r.puzzle.width)
    expect(r.bin.regionCount).toBe(r.puzzle.regions.length)
    expect(Array.from(r.bin.regionMap)).toEqual(Array.from(r.puzzle.regionMap))
  })

  it('tôn trọng maxDim: ảnh lớn được thu nhỏ trước khi xử lý', () => {
    const img = make(300, 150, (x) => (x < 150 ? [255, 0, 0] : [0, 0, 255]))
    const r = runPipeline(img, params({ k: 3, minArea: 20, maxDim: 60 }))
    expect(r.puzzle.width).toBe(60)
    expect(r.puzzle.height).toBe(30)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/__tests__/pipeline.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/pipeline.ts`:

```ts
import { bilateral } from '@/core/filters/bilateral'
import { median3x3 } from '@/core/filters/median'
import { quantize } from '@/core/quantize/quantize'
import { labelRegions } from '@/core/regions/connected-components'
import { computeAnchors } from '@/core/regions/label-anchor'
import { mergeSmallRegions } from '@/core/regions/merge-small'
import { buildOutline } from '@/core/regions/outline'
import { buildRegionRuns } from '@/core/regions/region-runs'
import type { PuzzleBin } from '@/core/codec/puzzle-format'
import type {
  PipelineParams,
  ProgressFn,
  Puzzle,
  RegionField,
  RgbaImage,
} from '@/core/types'

const BISECTION_MAX_ITERS = 6
const TARGET_TOLERANCE = 0.25

export interface PipelineResult {
  puzzle: Puzzle
  bin: PuzzleBin
  /** giá trị minArea thực sự đã dùng (sau bisection nếu params là 'auto') */
  usedMinArea: number
}

/**
 * Stage 0 — thu nhỏ về maxDim bằng lấy trung bình vùng (box filter).
 * Không dùng lấy mẫu điểm gần nhất: nó giữ lại noise và tạo răng cưa, làm
 * Stage 3 ra vùng vụn dọc theo mọi cạnh chéo.
 */
export function resizeToMaxDim(img: RgbaImage, maxDim: number): RgbaImage {
  const longest = Math.max(img.width, img.height)
  if (longest <= maxDim) {
    return {
      data: new Uint8ClampedArray(img.data),
      width: img.width,
      height: img.height,
    }
  }

  const scale = maxDim / longest
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const out = new Uint8ClampedArray(w * h * 4)

  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * img.height) / h)
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w))

      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4
          r += img.data[i]
          g += img.data[i + 1]
          b += img.data[i + 2]
          n++
        }
      }

      const o = (y * w + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = 255
    }
  }

  return { data: out, width: w, height: h }
}

/** Stage 3 + 4 gói lại — đây là phần bisection lặp lại */
function segmentAndMerge(
  labels: Uint8Array,
  width: number,
  height: number,
  palette: readonly (readonly [number, number, number])[],
  minArea: number,
  mergeDeltaE: number,
): RegionField {
  const raw = labelRegions(labels, width, height)
  return mergeSmallRegions(raw, palette as never, minArea, mergeDeltaE)
}

/**
 * Dò minArea bằng bisection để số vùng ≈ targetRegions.
 * CHỈ chạy lại Stage 3→4 từ `labels` đã có — Stage 0–2 là phần đắt nhất và
 * không phụ thuộc minArea, chạy lại là vứt thời gian.
 */
function bisectMinArea(
  labels: Uint8Array,
  width: number,
  height: number,
  palette: readonly (readonly [number, number, number])[],
  targetRegions: number,
  mergeDeltaE: number,
): { field: RegionField; minArea: number } {
  let lo = 1
  let hi = Math.max(2, Math.floor((width * height) / Math.max(1, targetRegions)) * 4)

  let best = segmentAndMerge(labels, width, height, palette, lo, mergeDeltaE)
  let bestMinArea = lo
  let bestErr = Math.abs(best.regions.length - targetRegions)

  for (let iter = 0; iter < BISECTION_MAX_ITERS; iter++) {
    const mid = Math.max(1, Math.floor((lo + hi) / 2))
    const field = segmentAndMerge(labels, width, height, palette, mid, mergeDeltaE)
    const count = field.regions.length
    const err = Math.abs(count - targetRegions)

    if (err < bestErr) {
      best = field
      bestMinArea = mid
      bestErr = err
    }

    if (bestErr <= targetRegions * TARGET_TOLERANCE) break

    // minArea lớn hơn ⇒ ít vùng hơn (đơn điệu)
    if (count > targetRegions) lo = mid + 1
    else hi = Math.max(lo, mid - 1)
    if (lo >= hi) break
  }

  return { field: best, minArea: bestMinArea }
}

/**
 * Xâu Stage 0→7. Nhận RGBA đã decode (decode cần DOM nên nằm ở src/data).
 * Toàn bộ deterministic: không PRNG, không thời gian, không thứ tự Map bấp bênh.
 */
export function runPipeline(
  img: RgbaImage,
  params: PipelineParams,
  onProgress?: ProgressFn,
): PipelineResult {
  const emit = (stage: Parameters<ProgressFn>[0]['stage'], ratio = 1): void => {
    onProgress?.({ stage, ratio })
  }

  // Stage 0
  emit('chuan-hoa', 0)
  const resized = resizeToMaxDim(img, params.maxDim)
  emit('chuan-hoa')

  // Stage 1
  emit('lam-phang', 0)
  const denoised = median3x3(resized, 2)
  const flattened = bilateral(denoised, params.smoothing)
  emit('lam-phang')

  // Stage 2
  emit('quantize', 0)
  const { labels, palette } = quantize(flattened, params.k)
  emit('quantize')

  // Stage 3 + 4 (có thể lặp nếu minArea = 'auto')
  emit('tach-vung', 0)
  let field: RegionField
  let usedMinArea: number
  if (params.minArea === 'auto') {
    emit('tach-vung')
    emit('gop-vung-vun', 0)
    const r = bisectMinArea(
      labels,
      flattened.width,
      flattened.height,
      palette,
      params.targetRegions,
      params.mergeDeltaE,
    )
    field = r.field
    usedMinArea = r.minArea
  } else {
    emit('tach-vung')
    emit('gop-vung-vun', 0)
    usedMinArea = params.minArea
    field = segmentAndMerge(
      labels,
      flattened.width,
      flattened.height,
      palette,
      usedMinArea,
      params.mergeDeltaE,
    )
  }
  emit('gop-vung-vun')

  // Stage 5
  emit('dat-so', 0)
  const withAnchors = computeAnchors(field, params.minLabelRadius)
  emit('dat-so')

  // Stage 6
  emit('ve-vien', 0)
  const outline = buildOutline(withAnchors)
  emit('ve-vien')

  // Stage 7
  emit('dong-goi', 0)
  const runs = buildRegionRuns(withAnchors)
  const puzzle: Puzzle = {
    width: withAnchors.width,
    height: withAnchors.height,
    palette,
    regionMap: withAnchors.regionMap,
    regions: withAnchors.regions,
    runs,
    outline,
  }
  const bin: PuzzleBin = {
    width: puzzle.width,
    height: puzzle.height,
    palette,
    regionCount: puzzle.regions.length,
    regionMap: puzzle.regionMap,
  }
  emit('dong-goi')

  return { puzzle, bin, usedMinArea }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/__tests__/pipeline.test.ts`
Expected: 17 passed

- [ ] **Step 5: Chạy toàn bộ test + typecheck**

Run: `npm test` → Expected: all passed
Run: `npm run typecheck` → Expected: không lỗi

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline.ts src/core/__tests__/pipeline.test.ts
git commit -m "feat(core): pipeline 7 stage với bisection minArea

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Paint engine

**Files:**
- Create: `src/core/engine/paint-engine.ts`
- Test: `src/core/engine/__tests__/paint-engine.test.ts`

**Interfaces:**
- Consumes: `Bitset` (Task 13), `RegionMeta` (Task 2)
- Produces:
  - `type PaintStatus = 'filled' | 'rejected' | 'already'`
  - `interface PaintResult { status: PaintStatus; expected?: number }`
  - `class PaintEngine`:
    - `constructor(regions: RegionMeta[], filled?: Uint8Array)`
    - `tryPaint(regionId: number, colorIndex: number): PaintResult`
    - `isFilled(regionId: number): boolean`
    - `get filledCount(): number` · `get regionCount(): number`
    - `get progress(): number` — 0..1
    - `isComplete(): boolean`
    - `remainingByColor(colorCount: number): Uint32Array`
    - `isColorComplete(colorIndex: number, colorCount: number): boolean`
    - `reset(): void`
    - `toBitset(): Uint8Array`

**`rejected` phải trả kèm `expected`** = `colorIndex` đúng của vùng đó. UI dùng nó để nháy đỏ và (khi bật trợ giúp) chỉ ra màu cần chọn.

- [ ] **Step 1: Viết test**

`src/core/engine/__tests__/paint-engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PaintEngine } from '@/core/engine/paint-engine'
import type { RegionMeta } from '@/core/types'

function regions(colorIndexes: number[]): RegionMeta[] {
  return colorIndexes.map((colorIndex, id) => ({
    id,
    colorIndex,
    area: 10,
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    anchorX: 0,
    anchorY: 0,
    anchorR: 3,
    hasLabel: true,
  }))
}

describe('PaintEngine', () => {
  it('khởi tạo: chưa tô gì', () => {
    const e = new PaintEngine(regions([0, 1, 2]))
    expect(e.regionCount).toBe(3)
    expect(e.filledCount).toBe(0)
    expect(e.progress).toBe(0)
    expect(e.isComplete()).toBe(false)
  })

  it('tô đúng màu → filled, tiến độ tăng', () => {
    const e = new PaintEngine(regions([0, 1]))
    expect(e.tryPaint(0, 0)).toEqual({ status: 'filled' })
    expect(e.isFilled(0)).toBe(true)
    expect(e.filledCount).toBe(1)
    expect(e.progress).toBe(0.5)
  })

  it('tô sai màu → rejected, KHÔNG đổi state, trả kèm màu đúng', () => {
    const e = new PaintEngine(regions([0, 7]))
    expect(e.tryPaint(1, 3)).toEqual({ status: 'rejected', expected: 7 })
    expect(e.isFilled(1)).toBe(false)
    expect(e.filledCount).toBe(0)
  })

  it('tô lại vùng đã tô → already, idempotent', () => {
    const e = new PaintEngine(regions([5]))
    expect(e.tryPaint(0, 5)).toEqual({ status: 'filled' })
    expect(e.tryPaint(0, 5)).toEqual({ status: 'already' })
    expect(e.filledCount).toBe(1)
  })

  it('tô sai lên vùng đã tô vẫn trả already, không rejected', () => {
    const e = new PaintEngine(regions([5]))
    e.tryPaint(0, 5)
    expect(e.tryPaint(0, 2)).toEqual({ status: 'already' })
  })

  it('isComplete khi tô hết', () => {
    const e = new PaintEngine(regions([0, 1]))
    e.tryPaint(0, 0)
    expect(e.isComplete()).toBe(false)
    e.tryPaint(1, 1)
    expect(e.isComplete()).toBe(true)
    expect(e.progress).toBe(1)
  })

  it('remainingByColor đếm đúng số vùng chưa tô mỗi màu', () => {
    const e = new PaintEngine(regions([0, 0, 1, 2, 2, 2]))
    expect(Array.from(e.remainingByColor(3))).toEqual([2, 1, 3])

    e.tryPaint(0, 0)
    e.tryPaint(3, 2)
    expect(Array.from(e.remainingByColor(3))).toEqual([1, 1, 2])
  })

  it('remainingByColor có đúng colorCount phần tử kể cả màu không dùng', () => {
    const e = new PaintEngine(regions([0, 0]))
    expect(Array.from(e.remainingByColor(4))).toEqual([2, 0, 0, 0])
  })

  it('isColorComplete', () => {
    const e = new PaintEngine(regions([0, 1, 1]))
    expect(e.isColorComplete(0, 2)).toBe(false)
    e.tryPaint(0, 0)
    expect(e.isColorComplete(0, 2)).toBe(true)
    expect(e.isColorComplete(1, 2)).toBe(false)
  })

  it('reset xoá hết tiến độ', () => {
    const e = new PaintEngine(regions([0, 1]))
    e.tryPaint(0, 0)
    e.tryPaint(1, 1)
    e.reset()
    expect(e.filledCount).toBe(0)
    expect(e.isFilled(0)).toBe(false)
  })

  it('toBitset / khởi tạo lại từ bitset giữ nguyên tiến độ', () => {
    const rs = regions([0, 1, 2, 3])
    const e = new PaintEngine(rs)
    e.tryPaint(1, 1)
    e.tryPaint(3, 3)

    const restored = new PaintEngine(rs, e.toBitset())
    expect(restored.filledCount).toBe(2)
    expect(restored.isFilled(1)).toBe(true)
    expect(restored.isFilled(3)).toBe(true)
    expect(restored.isFilled(0)).toBe(false)
  })

  it('regionId ngoài phạm vi → báo lỗi', () => {
    const e = new PaintEngine(regions([0]))
    expect(() => e.tryPaint(1, 0)).toThrow(/ngoài phạm vi/i)
    expect(() => e.isFilled(-1)).toThrow(/ngoài phạm vi/i)
  })

  it('không có vùng nào → isComplete true, progress 1', () => {
    const e = new PaintEngine([])
    expect(e.isComplete()).toBe(true)
    expect(e.progress).toBe(1)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/core/engine`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/core/engine/paint-engine.ts`:

```ts
import { Bitset } from '@/core/codec/bitset'
import type { RegionMeta } from '@/core/types'

export type PaintStatus = 'filled' | 'rejected' | 'already'

export interface PaintResult {
  status: PaintStatus
  /** chỉ có khi status = 'rejected': colorIndex đúng của vùng đó */
  expected?: number
}

/**
 * Trạng thái tô một puzzle.
 *
 * Vì đã chặn tô sai (spec D2), mỗi vùng chỉ có hai trạng thái nên 1 bit là đủ
 * và không cần lưu "vùng này bị tô màu gì" — nó luôn là màu đúng.
 * Kéo theo: không cần Undo, và đồng bộ đa thiết bị hợp nhất được bằng OR.
 */
export class PaintEngine {
  private readonly colorOf: Uint32Array
  private readonly bits: Bitset

  constructor(
    private readonly regions: RegionMeta[],
    filled?: Uint8Array,
  ) {
    this.colorOf = new Uint32Array(regions.length)
    for (const r of regions) this.colorOf[r.id] = r.colorIndex

    // Bitset(0) không hợp lệ về mặt chỉ số nhưng vẫn dùng được cho puzzle rỗng
    this.bits = filled
      ? Bitset.fromBytes(filled, regions.length)
      : new Bitset(regions.length)
  }

  private assertId(regionId: number): void {
    if (!Number.isInteger(regionId) || regionId < 0 || regionId >= this.regions.length) {
      throw new Error(
        `Id vùng ${regionId} ngoài phạm vi 0..${this.regions.length - 1}`,
      )
    }
  }

  get regionCount(): number {
    return this.regions.length
  }

  get filledCount(): number {
    return this.bits.countOnes()
  }

  get progress(): number {
    if (this.regions.length === 0) return 1
    return this.filledCount / this.regions.length
  }

  isComplete(): boolean {
    return this.filledCount === this.regions.length
  }

  isFilled(regionId: number): boolean {
    this.assertId(regionId)
    return this.bits.get(regionId)
  }

  /**
   * Thử tô. Sai màu thì KHÔNG đổi state — hình đang hiện ra luôn đúng.
   * Kiểm tra "đã tô" TRƯỚC khi kiểm tra màu: bấm lại vùng đã xong bằng màu
   * khác là vô hại, không phải lỗi, nên không nên nháy đỏ.
   */
  tryPaint(regionId: number, colorIndex: number): PaintResult {
    this.assertId(regionId)
    if (this.bits.get(regionId)) return { status: 'already' }

    const expected = this.colorOf[regionId]
    if (expected !== colorIndex) return { status: 'rejected', expected }

    this.bits.set(regionId, true)
    return { status: 'filled' }
  }

  /** số vùng CHƯA tô của từng màu; độ dài = colorCount */
  remainingByColor(colorCount: number): Uint32Array {
    const out = new Uint32Array(colorCount)
    for (const r of this.regions) {
      if (!this.bits.get(r.id)) out[r.colorIndex]++
    }
    return out
  }

  isColorComplete(colorIndex: number, colorCount: number): boolean {
    return this.remainingByColor(colorCount)[colorIndex] === 0
  }

  reset(): void {
    this.bits.clear()
  }

  toBitset(): Uint8Array {
    return this.bits.toBytes()
  }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/core/engine`
Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/engine
git commit -m "feat(core): paint engine chặn tô sai, trạng thái 1 bit mỗi vùng

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Web Worker sinh puzzle

**Files:**
- Create: `src/worker/protocol.ts`, `src/worker/generate.worker.ts`
- Test: `src/worker/__tests__/protocol.test.ts`

**Interfaces:**
- Consumes: `runPipeline` (Task 15), `encodePuzzleBin`/`encodeRegions` (Task 14), `PipelineParams` (Task 2)
- Produces:
  - `type GenerateRequest = { type: 'generate'; requestId: number; image: { data: Uint8ClampedArray; width: number; height: number }; params: PipelineParams }`
  - `type GenerateResponse = { type: 'progress'; requestId: number; stage: PipelineStage; ratio: number } | { type: 'done'; requestId: number; bin: Uint8Array; regionsJson: string; regionCount: number; palette: Rgb[]; width: number; height: number; usedMinArea: number } | { type: 'error'; requestId: number; stage: PipelineStage | null; message: string }`
  - `handleGenerate(req: GenerateRequest, post: (r: GenerateResponse) => void): void` — **export riêng, không phụ thuộc `self`**, để test được mà không cần Worker thật

**Vì sao tách `handleGenerate`:** Vitest không chạy Worker thật dễ dàng. Tách phần logic ra một hàm nhận `post` là callback thì test được toàn bộ hành vi (progress, done, error kèm tên stage) bằng cách gọi hàm trực tiếp. File `.worker.ts` chỉ còn 5 dòng gắn `onmessage`.

**`error` phải kèm `stage`** — spec §17 yêu cầu worker chết thì báo kèm tên stage đang chạy. Theo dõi stage cuối cùng nhận được từ `onProgress`.

- [ ] **Step 1: Viết test**

`src/worker/__tests__/protocol.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleGenerate } from '@/worker/protocol'
import type { GenerateRequest, GenerateResponse } from '@/worker/protocol'
import { DEFAULT_PARAMS } from '@/core/types'

function request(over: Partial<GenerateRequest> = {}): GenerateRequest {
  const w = 32
  const h = 32
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const left = x < w / 2
      data[i] = left ? 220 : 20
      data[i + 1] = left ? 30 : 30
      data[i + 2] = left ? 30 : 220
      data[i + 3] = 255
    }
  }
  return {
    type: 'generate',
    requestId: 1,
    image: { data, width: w, height: h },
    params: { ...DEFAULT_PARAMS, k: 3, minArea: 20 },
    ...over,
  }
}

describe('handleGenerate', () => {
  it('phát progress rồi done, đúng requestId', () => {
    const posted: GenerateResponse[] = []
    handleGenerate(request(), (r) => posted.push(r))

    expect(posted.every((p) => p.requestId === 1)).toBe(true)
    expect(posted.filter((p) => p.type === 'progress').length).toBeGreaterThan(0)
    expect(posted[posted.length - 1].type).toBe('done')
  })

  it('done chứa bin, regionsJson và metadata khớp nhau', () => {
    const posted: GenerateResponse[] = []
    handleGenerate(request(), (r) => posted.push(r))

    const done = posted[posted.length - 1]
    if (done.type !== 'done') throw new Error('mong đợi done')

    expect(done.bin.byteLength).toBeGreaterThan(24)
    expect(done.width).toBe(32)
    expect(done.height).toBe(32)
    expect(done.palette).toHaveLength(3)
    expect(done.regionCount).toBeGreaterThan(0)

    const regions = JSON.parse(done.regionsJson)
    expect(regions).toHaveLength(done.regionCount)
    expect(done.usedMinArea).toBe(20)
  })

  it('progress phát đủ 8 stage', () => {
    const stages = new Set<string>()
    handleGenerate(request(), (r) => {
      if (r.type === 'progress') stages.add(r.stage)
    })
    expect(stages.size).toBe(8)
  })

  it('ảnh rỗng → error kèm thông báo, không throw ra ngoài', () => {
    const posted: GenerateResponse[] = []
    const bad = request({
      image: { data: new Uint8ClampedArray(0), width: 0, height: 0 },
    })

    expect(() => handleGenerate(bad, (r) => posted.push(r))).not.toThrow()
    const last = posted[posted.length - 1]
    expect(last.type).toBe('error')
    if (last.type === 'error') {
      expect(last.message).toMatch(/kích thước|rỗng/i)
    }
  })

  it('error kèm tên stage đang chạy', () => {
    const posted: GenerateResponse[] = []
    // k = 0 làm quantize vỡ; stage lúc đó phải là 'quantize' hoặc trước đó
    const bad = request({ params: { ...DEFAULT_PARAMS, k: 0, minArea: 10 } })
    handleGenerate(bad, (r) => posted.push(r))

    const last = posted[posted.length - 1]
    expect(last.type).toBe('error')
    if (last.type === 'error') {
      expect(last.stage).not.toBeUndefined()
    }
  })

  it('kiểu message lạ → error, không crash', () => {
    const posted: GenerateResponse[] = []
    handleGenerate({ ...request(), type: 'khong-biet' } as never, (r) => posted.push(r))
    expect(posted[posted.length - 1].type).toBe('error')
  })

  it('deterministic: hai lần chạy cho bin giống byte-for-byte', () => {
    const run = (): Uint8Array => {
      const posted: GenerateResponse[] = []
      handleGenerate(request(), (r) => posted.push(r))
      const done = posted[posted.length - 1]
      if (done.type !== 'done') throw new Error('mong đợi done')
      return done.bin
    }
    expect(Array.from(run())).toEqual(Array.from(run()))
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/worker`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement protocol**

`src/worker/protocol.ts`:

```ts
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { runPipeline } from '@/core/pipeline'
import type { PipelineParams, PipelineStage, Rgb } from '@/core/types'

export interface GenerateRequest {
  type: 'generate'
  requestId: number
  image: { data: Uint8ClampedArray; width: number; height: number }
  params: PipelineParams
}

export type GenerateResponse =
  | { type: 'progress'; requestId: number; stage: PipelineStage; ratio: number }
  | {
      type: 'done'
      requestId: number
      bin: Uint8Array
      regionsJson: string
      regionCount: number
      palette: Rgb[]
      width: number
      height: number
      usedMinArea: number
    }
  | {
      type: 'error'
      requestId: number
      /** stage đang chạy khi lỗi xảy ra; null nếu lỗi trước khi vào stage nào */
      stage: PipelineStage | null
      message: string
    }

/**
 * Toàn bộ logic của worker, tách khỏi `self` để test được không cần Worker thật.
 *
 * Không bao giờ throw ra ngoài: mọi lỗi được gói thành message `error` kèm tên
 * stage đang chạy, vì UI cần hiển thị "vỡ ở bước Gộp vùng vụn" chứ không phải
 * một stack trace vô nghĩa (spec §17).
 */
export function handleGenerate(
  req: GenerateRequest,
  post: (r: GenerateResponse) => void,
): void {
  const requestId = req?.requestId ?? 0
  let currentStage: PipelineStage | null = null

  try {
    if (req?.type !== 'generate') {
      throw new Error(`Không hiểu loại message "${String(req?.type)}"`)
    }
    const { image, params } = req
    if (!image || image.width <= 0 || image.height <= 0 || image.data.length === 0) {
      throw new Error('Ảnh rỗng hoặc kích thước không hợp lệ')
    }
    if (image.data.length !== image.width * image.height * 4) {
      throw new Error(
        `Kích thước dữ liệu ảnh không khớp: có ${image.data.length} byte, cần ${image.width * image.height * 4}`,
      )
    }
    if (params.k < 2) {
      throw new Error(`Số màu phải >= 2, đang là ${params.k}`)
    }

    const result = runPipeline(image, params, (p) => {
      currentStage = p.stage
      post({ type: 'progress', requestId, stage: p.stage, ratio: p.ratio })
    })

    post({
      type: 'done',
      requestId,
      bin: encodePuzzleBin(result.bin),
      regionsJson: encodeRegions(result.puzzle.regions),
      regionCount: result.puzzle.regions.length,
      palette: result.puzzle.palette,
      width: result.puzzle.width,
      height: result.puzzle.height,
      usedMinArea: result.usedMinArea,
    })
  } catch (err) {
    post({
      type: 'error',
      requestId,
      stage: currentStage,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
```

- [ ] **Step 4: Implement vỏ worker**

`src/worker/generate.worker.ts`:

```ts
import { handleGenerate, type GenerateRequest } from '@/worker/protocol'

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  handleGenerate(e.data, (r) => self.postMessage(r))
}
```

- [ ] **Step 5: Chạy test**

Run: `npx vitest run src/worker`
Expected: 7 passed

- [ ] **Step 6: Commit**

```bash
git add src/worker
git commit -m "feat(worker): giao thức sinh puzzle trong Web Worker

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Viewport — transform, zoom, pan, fit, hit-test

**Files:**
- Create: `src/render/viewport.ts`
- Test: `src/render/__tests__/viewport.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `interface Viewport { scale: number; tx: number; ty: number }` — `screenX = imageX * scale + tx`
  - `fitViewport(imgW, imgH, viewW, viewH): Viewport`
  - `screenToImage(v: Viewport, sx: number, sy: number): { x: number; y: number }` — trả về toạ độ pixel ảnh **đã làm tròn xuống**
  - `imageToScreen(v: Viewport, ix: number, iy: number): { x: number; y: number }`
  - `zoomAbout(v: Viewport, sx: number, sy: number, factor: number, minScale: number, maxScale: number): Viewport`
  - `panBy(v: Viewport, dx: number, dy: number): Viewport`
  - `clampPan(v: Viewport, imgW, imgH, viewW, viewH): Viewport`
  - `hitTestRegion(v: Viewport, regionMap: Uint32Array, imgW: number, imgH: number, sx: number, sy: number): number | null`

**`zoomAbout` phải giữ điểm dưới con trỏ bất động.** Nếu không, zoom bằng con lăn sẽ làm ảnh trượt đi và người dùng mất chỗ đang tô — lỗi cảm giác rất khó chịu và rất dễ viết sai.

**Hit-test là O(1)**: một phép biến đổi nghịch rồi một lần tra `regionMap`. Không bao giờ được quét vùng.

- [ ] **Step 1: Viết test**

`src/render/__tests__/viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  clampPan,
  fitViewport,
  hitTestRegion,
  imageToScreen,
  panBy,
  screenToImage,
  zoomAbout,
} from '@/render/viewport'

describe('fitViewport', () => {
  it('ảnh rộng hơn khung: vừa theo chiều ngang và canh giữa dọc', () => {
    const v = fitViewport(200, 100, 100, 100)
    expect(v.scale).toBeCloseTo(0.5, 6)
    expect(v.tx).toBeCloseTo(0, 6)
    expect(v.ty).toBeCloseTo(25, 6)
  })

  it('ảnh cao hơn khung: vừa theo chiều dọc và canh giữa ngang', () => {
    const v = fitViewport(100, 200, 100, 100)
    expect(v.scale).toBeCloseTo(0.5, 6)
    expect(v.tx).toBeCloseTo(25, 6)
    expect(v.ty).toBeCloseTo(0, 6)
  })

  it('ảnh nhỏ hơn khung vẫn được phóng lên cho vừa', () => {
    const v = fitViewport(50, 50, 100, 100)
    expect(v.scale).toBeCloseTo(2, 6)
  })
})

describe('screenToImage / imageToScreen', () => {
  it('đi vòng khớp nhau', () => {
    const v = { scale: 2.5, tx: 13, ty: -7 }
    const s = imageToScreen(v, 40, 60)
    const back = screenToImage(v, s.x, s.y)
    expect(back).toEqual({ x: 40, y: 60 })
  })

  it('screenToImage làm tròn xuống về pixel nguyên', () => {
    const v = { scale: 10, tx: 0, ty: 0 }
    expect(screenToImage(v, 25, 39)).toEqual({ x: 2, y: 3 })
  })

  it('xử lý đúng toạ độ âm', () => {
    const v = { scale: 1, tx: 100, ty: 100 }
    expect(screenToImage(v, 50, 50)).toEqual({ x: -50, y: -50 })
  })
})

describe('zoomAbout', () => {
  it('GIỮ BẤT ĐỘNG điểm dưới con trỏ', () => {
    const v = { scale: 1, tx: 0, ty: 0 }
    const cursor = { x: 137, y: 84 }
    const before = screenToImage(v, cursor.x, cursor.y)

    const z = zoomAbout(v, cursor.x, cursor.y, 2.3, 0.1, 40)
    const after = screenToImage(z, cursor.x, cursor.y)

    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
  })

  it('giữ bất động qua nhiều lần zoom liên tiếp', () => {
    let v = { scale: 1, tx: 0, ty: 0 }
    const cx = 200
    const cy = 150
    const target = screenToImage(v, cx, cy)
    for (const f of [1.2, 1.2, 1.2, 0.8, 1.5]) {
      v = zoomAbout(v, cx, cy, f, 0.1, 40)
    }
    expect(screenToImage(v, cx, cy)).toEqual(target)
  })

  it('kẹp scale trong [minScale, maxScale]', () => {
    expect(zoomAbout({ scale: 1, tx: 0, ty: 0 }, 0, 0, 1000, 0.5, 8).scale).toBe(8)
    expect(zoomAbout({ scale: 1, tx: 0, ty: 0 }, 0, 0, 0.0001, 0.5, 8).scale).toBe(0.5)
  })

  it('scale đã ở giới hạn thì không dịch chuyển nữa', () => {
    const at = { scale: 8, tx: 33, ty: 44 }
    expect(zoomAbout(at, 100, 100, 2, 0.5, 8)).toEqual(at)
  })
})

describe('panBy / clampPan', () => {
  it('panBy dịch đúng lượng', () => {
    expect(panBy({ scale: 2, tx: 10, ty: 20 }, -5, 7)).toEqual({ scale: 2, tx: 5, ty: 27 })
  })

  it('clampPan: ảnh lớn hơn khung thì không cho lộ khoảng trắng', () => {
    // ảnh 200×200 ở scale 1 trong khung 100×100
    const v = clampPan({ scale: 1, tx: 50, ty: 50 }, 200, 200, 100, 100)
    expect(v.tx).toBeLessThanOrEqual(0)
    expect(v.ty).toBeLessThanOrEqual(0)
    expect(v.tx).toBeGreaterThanOrEqual(100 - 200)
    expect(v.ty).toBeGreaterThanOrEqual(100 - 200)
  })

  it('clampPan: ảnh nhỏ hơn khung thì canh giữa', () => {
    const v = clampPan({ scale: 0.25, tx: -999, ty: 999 }, 200, 200, 100, 100)
    expect(v.tx).toBeCloseTo(25, 6)
    expect(v.ty).toBeCloseTo(25, 6)
  })
})

describe('hitTestRegion', () => {
  const regionMap = new Uint32Array([0, 0, 1, 1, 2, 2, 3, 3])

  it('trả về id vùng tại điểm bấm', () => {
    const v = { scale: 10, tx: 0, ty: 0 }
    expect(hitTestRegion(v, regionMap, 4, 2, 5, 5)).toBe(0)
    expect(hitTestRegion(v, regionMap, 4, 2, 25, 5)).toBe(1)
    expect(hitTestRegion(v, regionMap, 4, 2, 5, 15)).toBe(2)
    expect(hitTestRegion(v, regionMap, 4, 2, 35, 15)).toBe(3)
  })

  it('bấm ngoài ảnh → null', () => {
    const v = { scale: 10, tx: 0, ty: 0 }
    expect(hitTestRegion(v, regionMap, 4, 2, -5, 5)).toBeNull()
    expect(hitTestRegion(v, regionMap, 4, 2, 5, -5)).toBeNull()
    expect(hitTestRegion(v, regionMap, 4, 2, 45, 5)).toBeNull()
    expect(hitTestRegion(v, regionMap, 4, 2, 5, 25)).toBeNull()
  })

  it('hoạt động đúng khi đã pan và zoom', () => {
    const v = { scale: 4, tx: -6, ty: 3 }
    // pixel ảnh (2,0) → screen x = 2*4-6 = 2 .. 6, y = 3 .. 7
    expect(hitTestRegion(v, regionMap, 4, 2, 3, 4)).toBe(1)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/render/__tests__/viewport.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/render/viewport.ts`:

```ts
/** screenX = imageX * scale + tx ; screenY = imageY * scale + ty */
export interface Viewport {
  scale: number
  tx: number
  ty: number
}

export function fitViewport(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): Viewport {
  const scale = Math.min(viewW / imgW, viewH / imgH)
  return {
    scale,
    tx: (viewW - imgW * scale) / 2,
    ty: (viewH - imgH * scale) / 2,
  }
}

export function imageToScreen(
  v: Viewport,
  ix: number,
  iy: number,
): { x: number; y: number } {
  return { x: ix * v.scale + v.tx, y: iy * v.scale + v.ty }
}

/** Trả về toạ độ PIXEL NGUYÊN (làm tròn xuống), dùng trực tiếp để tra regionMap. */
export function screenToImage(
  v: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: Math.floor((sx - v.tx) / v.scale),
    y: Math.floor((sy - v.ty) / v.scale),
  }
}

/**
 * Zoom quanh một điểm màn hình, GIỮ BẤT ĐỘNG điểm ảnh đang nằm dưới điểm đó.
 *
 * Suy ra: gọi p là toạ độ ảnh dưới con trỏ, ta cần
 *   p*s0 + t0 = p*s1 + t1  ⇒  t1 = t0 + p*(s0 - s1)
 * với p = (sx - t0)/s0.
 */
export function zoomAbout(
  v: Viewport,
  sx: number,
  sy: number,
  factor: number,
  minScale: number,
  maxScale: number,
): Viewport {
  const next = Math.min(maxScale, Math.max(minScale, v.scale * factor))
  if (next === v.scale) return v

  const px = (sx - v.tx) / v.scale
  const py = (sy - v.ty) / v.scale

  return {
    scale: next,
    tx: v.tx + px * (v.scale - next),
    ty: v.ty + py * (v.scale - next),
  }
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy }
}

/**
 * Giữ ảnh không trượt ra ngoài khung.
 * Chiều nào ảnh nhỏ hơn khung thì canh giữa; chiều nào lớn hơn thì chặn để
 * không lộ khoảng trắng ở hai đầu.
 */
export function clampPan(
  v: Viewport,
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): Viewport {
  const w = imgW * v.scale
  const h = imgH * v.scale

  const tx = w <= viewW ? (viewW - w) / 2 : Math.min(0, Math.max(viewW - w, v.tx))
  const ty = h <= viewH ? (viewH - h) / 2 : Math.min(0, Math.max(viewH - h, v.ty))

  return { scale: v.scale, tx, ty }
}

/**
 * Điểm màn hình → id vùng. O(1): một phép biến đổi nghịch + một lần tra mảng.
 * Trả null khi bấm ra ngoài ảnh.
 */
export function hitTestRegion(
  v: Viewport,
  regionMap: Uint32Array,
  imgW: number,
  imgH: number,
  sx: number,
  sy: number,
): number | null {
  const { x, y } = screenToImage(v, sx, sy)
  if (x < 0 || y < 0 || x >= imgW || y >= imgH) return null
  return regionMap[y * imgW + x]
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/render/__tests__/viewport.test.ts`
Expected: 15 passed

- [ ] **Step 5: Commit**

```bash
git add src/render/viewport.ts src/render/__tests__/viewport.test.ts
git commit -m "feat(render): viewport transform, zoom giữ điểm bất động, hit-test O(1)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Render layer — base, outline, số, highlight

**Files:**
- Create: `src/render/layers.ts`, `src/render/label-layer.ts`, `src/render/highlight.ts`
- Test: `src/render/__tests__/layers.test.ts`, `src/render/__tests__/label-layer.test.ts`

**Interfaces:**
- Consumes: `Puzzle`, `Rgb` (Task 2), `PaintEngine` (Task 16), `Viewport`, `imageToScreen` (Task 18)
- Produces:
  - `UNFILLED_COLOR = '#fdfdfb'` — trắng ngà cho vùng chưa tô
  - `rgbCss(c: Rgb): string`
  - `paintRegion(ctx: CanvasRenderingContext2D, puzzle: Puzzle, regionId: number, color: string): void` — vẽ đúng các run của vùng, hệ toạ độ ảnh
  - `paintAllRegions(ctx, puzzle, engine: PaintEngine): void` — vẽ lại toàn bộ layer base
  - `buildOutlineImageData(puzzle: Puzzle): ImageData` — mask viền thành ImageData đen/trong suốt để cache thành `ImageBitmap`
  - `drawLabels(ctx: CanvasRenderingContext2D, puzzle: Puzzle, engine: PaintEngine, v: Viewport, viewW: number, viewH: number): void`
  - `drawHighlight(ctx, puzzle, engine, colorIndex, v, viewW, viewH): void`

**Layer base vẽ trong hệ toạ độ ẢNH**, canvas có kích thước bằng ảnh; việc zoom/pan do `ctx.setTransform` ở lớp gọi hoặc CSS transform của canvas đảm nhiệm. Nhờ vậy `paintRegion` không cần biết viewport và tô một vùng là vài `fillRect` trên toạ độ pixel — rẻ và không bị mờ.

**`drawLabels` vẽ trong hệ toạ độ MÀN HÌNH** và chỉ vẽ vùng: (a) trong viewport, (b) chưa tô, (c) `hasLabel`. Cỡ chữ tính theo `anchorR * scale` nên số luôn đọc được ở mọi mức zoom — đây là thứ bù cho việc vùng nhỏ không in được số ở scale 1.

- [ ] **Step 1: Viết test cho layers**

`src/render/__tests__/layers.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { PaintEngine } from '@/core/engine/paint-engine'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import {
  buildOutlineImageData,
  paintAllRegions,
  paintRegion,
  rgbCss,
  UNFILLED_COLOR,
} from '@/render/layers'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

/** 4×2: vùng 0 = cột 0-1, vùng 1 = cột 2-3 */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: true },
    { id: 1, colorIndex: 1, area: 4, minX: 2, minY: 0, maxX: 3, maxY: 1, anchorX: 3, anchorY: 1, anchorR: 1, hasLabel: true },
  ]
  return assemblePuzzle({ width: 4, height: 2, palette, regionCount: 2, regionMap }, regions)
}

function fakeCtx() {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D & { fillRect: ReturnType<typeof vi.fn> }
}

describe('rgbCss', () => {
  it('đổi Rgb thành chuỗi CSS', () => {
    expect(rgbCss([1, 2, 3])).toBe('rgb(1,2,3)')
  })
})

describe('paintRegion', () => {
  it('vẽ đúng một fillRect cho mỗi run của vùng', () => {
    const ctx = fakeCtx()
    paintRegion(ctx, puzzle(), 0, 'rgb(255,0,0)')

    // vùng 0 có 2 run (một mỗi dòng)
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 2, 1)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 1, 2, 1)
  })

  it('không vẽ pixel nào của vùng khác', () => {
    const ctx = fakeCtx()
    paintRegion(ctx, puzzle(), 1, 'rgb(0,0,255)')
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(ctx.fillRect).toHaveBeenCalledWith(2, 0, 2, 1)
    expect(ctx.fillRect).toHaveBeenCalledWith(2, 1, 2, 1)
  })

  it('đặt fillStyle theo màu truyền vào', () => {
    const ctx = fakeCtx()
    paintRegion(ctx, puzzle(), 0, 'rgb(9,9,9)')
    expect(ctx.fillStyle).toBe('rgb(9,9,9)')
  })

  it('id vùng không hợp lệ → báo lỗi', () => {
    expect(() => paintRegion(fakeCtx(), puzzle(), 5, '#000')).toThrow(/ngoài phạm vi/i)
  })
})

describe('paintAllRegions', () => {
  it('vùng chưa tô dùng UNFILLED_COLOR, vùng đã tô dùng màu palette', () => {
    const p = puzzle()
    const e = new PaintEngine(p.regions)
    e.tryPaint(1, 1)

    const styles: string[] = []
    const ctx = {
      set fillStyle(v: string) {
        styles.push(v)
      },
      get fillStyle() {
        return styles[styles.length - 1] ?? ''
      },
      fillRect: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    paintAllRegions(ctx, p, e)

    expect(styles).toContain(UNFILLED_COLOR)
    expect(styles).toContain('rgb(0,0,255)')
    expect(styles).not.toContain('rgb(255,0,0)')
  })

  it('vẽ mọi run của mọi vùng', () => {
    const p = puzzle()
    const ctx = fakeCtx()
    paintAllRegions(ctx, p, new PaintEngine(p.regions))
    expect(ctx.fillRect).toHaveBeenCalledTimes(4)
  })
})

describe('buildOutlineImageData', () => {
  it('pixel biên là đen đục, còn lại trong suốt', () => {
    const p = puzzle()
    const img = buildOutlineImageData(p)

    expect(img.width).toBe(4)
    expect(img.height).toBe(2)

    // pixel (1,0) là biên
    const b = (0 * 4 + 1) * 4
    expect(img.data[b]).toBe(0)
    expect(img.data[b + 3]).toBe(255)

    // pixel (0,0) không phải biên
    const n = 0
    expect(img.data[n + 3]).toBe(0)
  })
})
```

- [ ] **Step 2: Implement layers**

`src/render/layers.ts`:

```ts
import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle, Rgb } from '@/core/types'

/** trắng ngà cho vùng chưa tô — dịu mắt hơn trắng tinh khi tô lâu */
export const UNFILLED_COLOR = '#fdfdfb'

export function rgbCss(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/**
 * Vẽ một vùng trong hệ toạ độ ẢNH.
 * Dùng pixel-run nên mỗi vùng chỉ tốn vài fillRect thay vì quét cả regionMap —
 * đây là lý do kéo-tô qua 50 vùng vẫn mượt.
 */
export function paintRegion(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  regionId: number,
  color: string,
): void {
  if (!Number.isInteger(regionId) || regionId < 0 || regionId >= puzzle.regions.length) {
    throw new Error(
      `Id vùng ${regionId} ngoài phạm vi 0..${puzzle.regions.length - 1}`,
    )
  }

  const { runs } = puzzle
  ctx.fillStyle = color
  for (let i = runs.offsets[regionId]; i < runs.offsets[regionId + 1]; i++) {
    ctx.fillRect(runs.x0[i], runs.y[i], runs.x1[i] - runs.x0[i] + 1, 1)
  }
}

/** Vẽ lại toàn bộ layer base từ trạng thái engine. Dùng khi load và khi reset. */
export function paintAllRegions(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  engine: PaintEngine,
): void {
  for (const r of puzzle.regions) {
    const color = engine.isFilled(r.id)
      ? rgbCss(puzzle.palette[r.colorIndex])
      : UNFILLED_COLOR
    paintRegion(ctx, puzzle, r.id, color)
  }
}

/**
 * Mask viền → ImageData đen/trong suốt.
 * Lớp gọi nên `createImageBitmap` một lần rồi dùng lại mọi frame; đây là dữ
 * liệu tĩnh, không đổi trong suốt phiên tô.
 */
export function buildOutlineImageData(puzzle: Puzzle): ImageData {
  const { width, height, outline } = puzzle
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < outline.length; i++) {
    if (outline[i]) data[i * 4 + 3] = 255 // RGB để 0 = đen
  }
  return new ImageData(data, width, height)
}
```

- [ ] **Step 3: Viết test cho label-layer và highlight**

`src/render/__tests__/label-layer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import { drawLabels } from '@/render/label-layer'
import { drawHighlight } from '@/render/highlight'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

/** 6×2: 3 vùng dọc; vùng giữa hasLabel = false */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2])
  const palette: Rgb[] = [
    [10, 10, 10],
    [20, 20, 20],
    [30, 30, 30],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, anchorX: 0, anchorY: 0, anchorR: 4, hasLabel: true },
    { id: 1, colorIndex: 1, area: 4, minX: 2, minY: 0, maxX: 3, maxY: 1, anchorX: 2, anchorY: 0, anchorR: 1, hasLabel: false },
    { id: 2, colorIndex: 2, area: 4, minX: 4, minY: 0, maxX: 5, maxY: 1, anchorX: 4, anchorY: 0, anchorR: 4, hasLabel: true },
  ]
  return assemblePuzzle({ width: 6, height: 2, palette, regionCount: 3, regionMap }, regions)
}

function fakeCtx() {
  return {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillText: vi.fn(),
    strokeText: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    fillText: ReturnType<typeof vi.fn>
    fillRect: ReturnType<typeof vi.fn>
    clearRect: ReturnType<typeof vi.fn>
  }
}

const V = { scale: 10, tx: 0, ty: 0 }

describe('drawLabels', () => {
  it('vẽ số cho vùng chưa tô có hasLabel', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 100, 100)

    const drawn = ctx.fillText.mock.calls.map((c) => c[0])
    // colorIndex 0 và 2 ⇒ hiển thị 1 và 3 (đánh số từ 1 cho người dùng)
    expect(drawn).toContain('1')
    expect(drawn).toContain('3')
  })

  it('KHÔNG vẽ số cho vùng hasLabel = false', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 100, 100)
    expect(ctx.fillText.mock.calls.map((c) => c[0])).not.toContain('2')
  })

  it('KHÔNG vẽ số cho vùng đã tô', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    const e = new PaintEngine(p.regions)
    e.tryPaint(0, 0)

    drawLabels(ctx, p, e, V, 100, 100)
    const drawn = ctx.fillText.mock.calls.map((c) => c[0])
    expect(drawn).not.toContain('1')
    expect(drawn).toContain('3')
  })

  it('chỉ vẽ vùng nằm trong viewport', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    // khung chỉ rộng 25px ⇒ vùng 2 (anchor x=4 ⇒ screen 40) nằm ngoài
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 25, 100)
    const drawn = ctx.fillText.mock.calls.map((c) => c[0])
    expect(drawn).toContain('1')
    expect(drawn).not.toContain('3')
  })

  it('vẽ ở toạ độ màn hình, không phải toạ độ ảnh', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), { scale: 10, tx: 5, ty: 7 }, 200, 200)

    const call = ctx.fillText.mock.calls.find((c) => c[0] === '1')
    expect(call).toBeDefined()
    // anchor ảnh (0,0) → screen (5,7); +0.5*scale để canh giữa pixel
    expect(call![1]).toBeCloseTo(10, 5)
    expect(call![2]).toBeCloseTo(12, 5)
  })

  it('cỡ chữ tăng theo scale', () => {
    const p = puzzle()
    const small = fakeCtx()
    const big = fakeCtx()
    drawLabels(small, p, new PaintEngine(p.regions), { scale: 2, tx: 0, ty: 0 }, 500, 500)
    const fontSmall = small.font
    drawLabels(big, p, new PaintEngine(p.regions), { scale: 20, tx: 0, ty: 0 }, 500, 500)
    const fontBig = big.font

    const num = (f: string): number => Number(f.match(/(\d+(\.\d+)?)px/)![1])
    expect(num(fontBig)).toBeGreaterThan(num(fontSmall))
  })

  it('xoá canvas trước khi vẽ', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawLabels(ctx, p, new PaintEngine(p.regions), V, 100, 100)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 100)
  })
})

describe('drawHighlight', () => {
  it('chỉ tint vùng chưa tô của màu đang chọn', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawHighlight(ctx, p, new PaintEngine(p.regions), 2, V, 200, 200)

    // vùng 2 có 2 run ⇒ 2 fillRect
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
  })

  it('không tint gì khi màu đó đã tô xong', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    const e = new PaintEngine(p.regions)
    e.tryPaint(2, 2)

    drawHighlight(ctx, p, e, 2, V, 200, 200)
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('colorIndex null → không vẽ gì, chỉ xoá', () => {
    const ctx = fakeCtx()
    const p = puzzle()
    drawHighlight(ctx, p, new PaintEngine(p.regions), null, V, 200, 200)
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Chạy test để chắc là fail**

Run: `npx vitest run src/render`
Expected: FAIL — không resolve được `@/render/layers`

- [ ] **Step 5: Implement label-layer**

`src/render/label-layer.ts`:

```ts
import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { imageToScreen, type Viewport } from '@/render/viewport'

/** cỡ chữ = anchorR * scale * hệ số này, kẹp trong [MIN_FONT, MAX_FONT] */
const FONT_RATIO = 0.9
const MIN_FONT = 7
const MAX_FONT = 28

/**
 * Vẽ số lên layer riêng, trong hệ toạ độ MÀN HÌNH.
 *
 * Vẽ theo scale hiện tại (không phải scale ảnh) nên số luôn đọc được khi zoom —
 * đây chính là thứ bù cho các vùng nhỏ có hasLabel = false ở mức zoom 1.
 * Chỉ vẽ vùng trong viewport để số lượng lệnh vẽ không phụ thuộc kích thước ảnh.
 */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  engine: PaintEngine,
  v: Viewport,
  viewW: number,
  viewH: number,
): void {
  ctx.clearRect(0, 0, viewW, viewH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const r of puzzle.regions) {
    if (!r.hasLabel) continue
    if (engine.isFilled(r.id)) continue

    // +0.5 để canh giữa ô pixel thay vì góc trên-trái của nó
    const s = imageToScreen(v, r.anchorX + 0.5, r.anchorY + 0.5)
    if (s.x < 0 || s.y < 0 || s.x > viewW || s.y > viewH) continue

    const size = Math.min(MAX_FONT, Math.max(MIN_FONT, r.anchorR * v.scale * FONT_RATIO))
    ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`

    // đánh số từ 1 cho người dùng, không phải từ 0
    const text = String(r.colorIndex + 1)

    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = Math.max(1, size / 8)
    ctx.strokeText(text, s.x, s.y)
    ctx.fillStyle = '#4b5563'
    ctx.fillText(text, s.x, s.y)
  }
}
```

- [ ] **Step 6: Implement highlight**

`src/render/highlight.ts`:

```ts
import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { rgbCss } from '@/render/layers'
import type { Viewport } from '@/render/viewport'

const HIGHLIGHT_ALPHA = 0.28

/**
 * Tint nhẹ các vùng CHƯA tô của màu đang chọn.
 *
 * Vẽ trong hệ toạ độ ẢNH (lớp gọi đã setTransform), giống layer base.
 * Đây là trợ giúp bắt buộc phải có: nhiều vùng quá nhỏ để in số, nếu không
 * có highlight thì người chơi không có cách nào tìm ra chúng.
 */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  puzzle: Puzzle,
  engine: PaintEngine,
  colorIndex: number | null,
  _v: Viewport,
  viewW: number,
  viewH: number,
): void {
  ctx.clearRect(0, 0, viewW, viewH)
  if (colorIndex === null) return

  const { runs } = puzzle
  ctx.save()
  ctx.globalAlpha = HIGHLIGHT_ALPHA
  ctx.fillStyle = rgbCss(puzzle.palette[colorIndex])

  for (const r of puzzle.regions) {
    if (r.colorIndex !== colorIndex) continue
    if (engine.isFilled(r.id)) continue
    for (let i = runs.offsets[r.id]; i < runs.offsets[r.id + 1]; i++) {
      ctx.fillRect(runs.x0[i], runs.y[i], runs.x1[i] - runs.x0[i] + 1, 1)
    }
  }

  ctx.restore()
}
```

- [ ] **Step 7: Chạy test**

Run: `npx vitest run src/render`
Expected: 25 passed

- [ ] **Step 8: Commit**

```bash
git add src/render
git commit -m "feat(render): layer base, viền, số theo scale và highlight theo màu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Âm thanh tổng hợp bằng WebAudio

**Files:**
- Create: `src/audio/synth.ts`
- Test: `src/audio/__tests__/synth.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `class SoundBoard`:
    - `constructor(factory?: () => AudioContext)`
    - `unlock(): void` — gọi ở `pointerdown` đầu tiên
    - `fill(progress: number): void` — cao độ tăng theo tiến độ 0..1
    - `reject(): void` · `colorDone(): void` · `complete(): void`
    - `get muted(): boolean` · `setMuted(v: boolean): void`
  - `MUTE_STORAGE_KEY = 'pokemon-color:muted'`

**Không có file asset nào.** Toàn bộ âm tổng hợp bằng oscillator, nên không phải tải gì, không phải quản lý binary trong repo, và tốc độ phát tức thì.

**`unlock()` là bắt buộc.** Browser không cho `AudioContext` chạy trước một user gesture; tạo context lúc load app sẽ ra context `suspended` và mọi âm im lặng. Task 25 sẽ gọi `unlock()` trong handler `pointerdown` đầu tiên.

- [ ] **Step 1: Viết test**

`src/audio/__tests__/synth.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTE_STORAGE_KEY, SoundBoard } from '@/audio/synth'

interface FakeOsc {
  type: string
  frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function fakeContextFactory() {
  const oscillators: FakeOsc[] = []
  const ctx = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => {
      ctx.state = 'running'
      return Promise.resolve()
    }),
    createOscillator: vi.fn((): FakeOsc => {
      const o: FakeOsc = {
        type: '',
        frequency: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(o)
      return o
    }),
    createGain: vi.fn(() => ({
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  }
  return { ctx, oscillators, factory: () => ctx as unknown as AudioContext }
}

beforeEach(() => {
  localStorage.clear()
})

describe('SoundBoard', () => {
  it('không tạo AudioContext trước khi unlock', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.fill(0.5)
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })

  it('unlock resume context', () => {
    const { factory, ctx } = fakeContextFactory()
    new SoundBoard(factory).unlock()
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('unlock nhiều lần chỉ tạo context một lần', () => {
    const created: number[] = []
    const { ctx } = fakeContextFactory()
    const sb = new SoundBoard(() => {
      created.push(1)
      return ctx as unknown as AudioContext
    })
    sb.unlock()
    sb.unlock()
    sb.unlock()
    expect(created).toHaveLength(1)
  })

  it('fill phát một oscillator', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.fill(0.5)
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('cao độ của fill tăng theo tiến độ', () => {
    const { factory, oscillators } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.fill(0)
    sb.fill(1)
    expect(oscillators[1].frequency.value).toBeGreaterThan(oscillators[0].frequency.value)
  })

  it('reject dùng sóng vuông trầm', () => {
    const { factory, oscillators } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.reject()
    expect(oscillators[0].type).toBe('square')
    expect(oscillators[0].frequency.value).toBeLessThan(300)
  })

  it('colorDone phát 2 nốt, complete phát 5 nốt', () => {
    const a = fakeContextFactory()
    const sbA = new SoundBoard(a.factory)
    sbA.unlock()
    sbA.colorDone()
    expect(a.oscillators).toHaveLength(2)

    const b = fakeContextFactory()
    const sbB = new SoundBoard(b.factory)
    sbB.unlock()
    sbB.complete()
    expect(b.oscillators).toHaveLength(5)
  })

  it('muted thì không phát gì', () => {
    const { factory, ctx } = fakeContextFactory()
    const sb = new SoundBoard(factory)
    sb.unlock()
    sb.setMuted(true)
    sb.fill(0.5)
    sb.reject()
    sb.complete()
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })

  it('mặc định BẬT tiếng', () => {
    expect(new SoundBoard(fakeContextFactory().factory).muted).toBe(false)
  })

  it('trạng thái tắt tiếng được lưu và đọc lại từ localStorage', () => {
    const { factory } = fakeContextFactory()
    new SoundBoard(factory).setMuted(true)
    expect(localStorage.getItem(MUTE_STORAGE_KEY)).toBe('1')
    expect(new SoundBoard(factory).muted).toBe(true)
  })

  it('lỗi khi tạo AudioContext không làm app chết', () => {
    const sb = new SoundBoard(() => {
      throw new Error('không hỗ trợ')
    })
    expect(() => sb.unlock()).not.toThrow()
    expect(() => sb.fill(0.5)).not.toThrow()
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/audio`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/audio/synth.ts`:

```ts
export const MUTE_STORAGE_KEY = 'pokemon-color:muted'

interface Note {
  freq: number
  start: number
  dur: number
  type: OscillatorType
  gain: number
}

/**
 * Toàn bộ âm thanh tổng hợp bằng oscillator — không có file asset nào, nên
 * không phải tải gì và phát tức thì.
 *
 * AudioContext được tạo LAZY trong unlock(): browser chặn audio trước user
 * gesture, tạo sớm sẽ ra context suspended và mọi âm im lặng.
 */
export class SoundBoard {
  private ctx: AudioContext | null = null
  private failed = false
  private mutedFlag: boolean

  constructor(private readonly factory: () => AudioContext = () => new AudioContext()) {
    this.mutedFlag = readMuted()
  }

  get muted(): boolean {
    return this.mutedFlag
  }

  setMuted(v: boolean): void {
    this.mutedFlag = v
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, v ? '1' : '0')
    } catch {
      // localStorage bị chặn (chế độ riêng tư) — không phải lỗi đáng dừng app
    }
  }

  /** Gọi trong handler pointerdown ĐẦU TIÊN. An toàn khi gọi nhiều lần. */
  unlock(): void {
    const ctx = this.ensure()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  private ensure(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx
    try {
      this.ctx = this.factory()
    } catch {
      this.failed = true
    }
    return this.ctx
  }

  private play(notes: Note[]): void {
    if (this.mutedFlag) return
    const ctx = this.ctx
    if (!ctx) return

    const t0 = ctx.currentTime
    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = n.type
      osc.frequency.value = n.freq
      osc.frequency.setValueAtTime(n.freq, t0 + n.start)

      gain.gain.setValueAtTime(0.0001, t0 + n.start)
      gain.gain.linearRampToValueAtTime(n.gain, t0 + n.start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.start + n.dur)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0 + n.start)
      osc.stop(t0 + n.start + n.dur + 0.02)
    }
  }

  /** blip ngắn, cao độ tăng dần theo tiến độ ⇒ càng gần xong càng cao */
  fill(progress: number): void {
    const p = Math.min(1, Math.max(0, progress))
    this.play([
      { freq: 440 + p * 500, start: 0, dur: 0.07, type: 'sine', gain: 0.12 },
    ])
  }

  reject(): void {
    this.play([{ freq: 130, start: 0, dur: 0.11, type: 'square', gain: 0.07 }])
  }

  colorDone(): void {
    this.play([
      { freq: 660, start: 0, dur: 0.1, type: 'sine', gain: 0.13 },
      { freq: 880, start: 0.1, dur: 0.14, type: 'sine', gain: 0.13 },
    ])
  }

  complete(): void {
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    this.play(
      seq.map((freq, i) => ({
        freq,
        start: i * 0.12,
        dur: i === seq.length - 1 ? 0.5 : 0.16,
        type: 'triangle' as OscillatorType,
        gain: 0.14,
      })),
    )
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/audio`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add src/audio
git commit -m "feat(audio): âm thanh tổng hợp WebAudio, không cần file asset

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Kiểm tra file upload · decode ảnh · gzip

**Files:**
- Create: `src/data/validate-upload.ts`, `src/data/decode-image.ts`, `src/data/compress.ts`
- Test: `src/data/__tests__/validate-upload.test.ts`, `src/data/__tests__/compress.test.ts`

**Interfaces:**
- Consumes: `RgbaImage` (Task 2)
- Produces:
  - `MAX_UPLOAD_BYTES = 15 * 1024 * 1024`
  - `type UploadError = { code: 'qua-lon' | 'khong-phai-anh' | 'heic-khong-ho-tro'; message: string }`
  - `validateUpload(file: { name: string; type: string; size: number }): UploadError | null`
  - `decodeToRgba(blob: Blob): Promise<RgbaImage>`
  - `gzip(bytes: Uint8Array): Promise<Uint8Array>` · `gunzip(bytes: Uint8Array): Promise<Uint8Array>`

**HEIC phải bắt riêng bằng tên/đuôi file.** Trên máy Apple, `file.type` cho HEIC thường là chuỗi rỗng chứ không phải `image/heic`, nên kiểm tra theo `type` sẽ trượt và người dùng nhận được lỗi "decode thất bại" vô nghĩa thay vì câu hướng dẫn đúng việc cần làm.

**`gzip` ở đây, không ở `core/`** — `CompressionStream` là API của DOM. `core/codec` giữ nguyên thuần tuý.

- [ ] **Step 1: Viết test cho validate-upload**

`src/data/__tests__/validate-upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, validateUpload } from '@/data/validate-upload'

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'anh.png',
  type: 'image/png',
  size: 1024,
  ...over,
})

describe('validateUpload', () => {
  it('PNG/JPEG/WebP hợp lệ → null', () => {
    expect(validateUpload(file({ type: 'image/png' }))).toBeNull()
    expect(validateUpload(file({ name: 'a.jpg', type: 'image/jpeg' }))).toBeNull()
    expect(validateUpload(file({ name: 'a.webp', type: 'image/webp' }))).toBeNull()
  })

  it('quá 15 MB → qua-lon, thông báo có nêu giới hạn', () => {
    const e = validateUpload(file({ size: MAX_UPLOAD_BYTES + 1 }))
    expect(e?.code).toBe('qua-lon')
    expect(e?.message).toMatch(/15/)
  })

  it('đúng 15 MB thì vẫn nhận', () => {
    expect(validateUpload(file({ size: MAX_UPLOAD_BYTES }))).toBeNull()
  })

  it('không phải ảnh → khong-phai-anh', () => {
    expect(validateUpload(file({ name: 'a.pdf', type: 'application/pdf' }))?.code).toBe(
      'khong-phai-anh',
    )
  })

  it('HEIC theo MIME → heic-khong-ho-tro, thông báo gợi ý chuyển sang JPG/PNG', () => {
    const e = validateUpload(file({ name: 'a.heic', type: 'image/heic' }))
    expect(e?.code).toBe('heic-khong-ho-tro')
    expect(e?.message).toMatch(/JPG|PNG/i)
  })

  it('HEIC khi type RỖNG vẫn bị bắt qua đuôi file', () => {
    expect(validateUpload(file({ name: 'IMG_0042.HEIC', type: '' }))?.code).toBe(
      'heic-khong-ho-tro',
    )
    expect(validateUpload(file({ name: 'x.heif', type: '' }))?.code).toBe(
      'heic-khong-ho-tro',
    )
  })

  it('kiểm tra HEIC TRƯỚC kiểm tra kích thước để thông báo hữu ích hơn', () => {
    const e = validateUpload(file({ name: 'a.heic', type: '', size: MAX_UPLOAD_BYTES * 2 }))
    expect(e?.code).toBe('heic-khong-ho-tro')
  })

  it('SVG bị từ chối (không rasterize được ổn định)', () => {
    expect(validateUpload(file({ name: 'a.svg', type: 'image/svg+xml' }))?.code).toBe(
      'khong-phai-anh',
    )
  })

  it('file rỗng → khong-phai-anh', () => {
    expect(validateUpload(file({ size: 0 }))?.code).toBe('khong-phai-anh')
  })
})
```

- [ ] **Step 2: Implement validate-upload**

`src/data/validate-upload.ts`:

```ts
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const HEIC_EXT = /\.(heic|heif)$/i

export interface UploadError {
  code: 'qua-lon' | 'khong-phai-anh' | 'heic-khong-ho-tro'
  message: string
}

/**
 * Kiểm tra trước khi nhận file. Trả null nếu hợp lệ.
 *
 * HEIC được kiểm TRƯỚC mọi thứ khác và kiểm theo cả đuôi file: trên máy Apple,
 * `file.type` của HEIC thường là chuỗi RỖNG, nên nếu chỉ dựa vào MIME thì
 * người dùng sẽ nhận lỗi "decode thất bại" vô nghĩa thay vì câu hướng dẫn đúng.
 */
export function validateUpload(file: {
  name: string
  type: string
  size: number
}): UploadError | null {
  if (file.type === 'image/heic' || file.type === 'image/heif' || HEIC_EXT.test(file.name)) {
    return {
      code: 'heic-khong-ho-tro',
      message: 'Browser không đọc được ảnh HEIC. Hãy chuyển sang JPG hoặc PNG rồi thử lại.',
    }
  }

  if (file.size <= 0 || !ACCEPTED_MIME.has(file.type)) {
    return {
      code: 'khong-phai-anh',
      message: 'Chỉ nhận ảnh PNG, JPG hoặc WebP.',
    }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      code: 'qua-lon',
      message: `Ảnh vượt 15 MB (${(file.size / 1024 / 1024).toFixed(1)} MB). Hãy giảm kích thước rồi thử lại.`,
    }
  }

  return null
}
```

- [ ] **Step 3: Implement decode-image**

`src/data/decode-image.ts`:

```ts
import type { RgbaImage } from '@/core/types'

/**
 * Decode ảnh thành RGBA, ghép alpha lên nền TRẮNG.
 *
 * Ghép nền trắng là bắt buộc, không phải tuỳ chọn: ảnh PNG nền trong suốt mà
 * để nguyên alpha thì Stage 2 sẽ gom màu dựa trên RGB rác ở vùng trong suốt,
 * ra palette sai. Nền trắng cũng đúng với ý đồ sản phẩm — nền là một vùng
 * phải tô, không phải chỗ trống.
 *
 * Dùng OffscreenCanvas khi có (chạy được cả trong worker); fallback sang
 * canvas thường cho Safari cũ.
 */
export async function decodeToRgba(blob: Blob): Promise<RgbaImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('Không đọc được ảnh: file có thể bị lỗi hoặc định dạng không hỗ trợ')
  }

  const { width, height } = bitmap
  if (width === 0 || height === 0) {
    bitmap.close()
    throw new Error('Ảnh có kích thước 0')
  }

  const ctx = createContext(width, height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const imageData = ctx.getImageData(0, 0, width, height)
  return { data: imageData.data, width, height }
}

function createContext(
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height)
    const ctx = c.getContext('2d')
    if (ctx) return ctx
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Browser không hỗ trợ canvas 2D')
  return ctx
}
```

- [ ] **Step 4: Viết test cho compress**

`src/data/__tests__/compress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { gunzip, gzip } from '@/data/compress'

describe('gzip / gunzip', () => {
  it('đi vòng về đúng dữ liệu gốc', async () => {
    const src = new Uint8Array([1, 2, 3, 250, 255, 0, 7])
    const back = await gunzip(await gzip(src))
    expect(Array.from(back)).toEqual(Array.from(src))
  })

  it('dữ liệu lặp lại nén nhỏ đi rõ rệt', async () => {
    const src = new Uint8Array(20_000).fill(42)
    const packed = await gzip(src)
    expect(packed.length).toBeLessThan(src.length / 10)
  })

  it('đi vòng đúng với dữ liệu lớn', async () => {
    const src = new Uint8Array(100_000)
    for (let i = 0; i < src.length; i++) src[i] = (i * 31) % 256
    const back = await gunzip(await gzip(src))
    expect(back.length).toBe(src.length)
    expect(back[0]).toBe(src[0])
    expect(back[99_999]).toBe(src[99_999])
  })

  it('mảng rỗng vẫn đi vòng được', async () => {
    expect((await gunzip(await gzip(new Uint8Array(0)))).length).toBe(0)
  })

  it('gunzip dữ liệu không phải gzip → báo lỗi', async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow()
  })
})
```

- [ ] **Step 5: Implement compress**

`src/data/compress.ts`:

```ts
/**
 * gzip/gunzip bằng CompressionStream — API của DOM, nên nằm ở src/data và
 * KHÔNG được đưa vào src/core (core phải chạy được trong môi trường node
 * thuần để test nhanh).
 */
async function through(bytes: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as unknown as BlobPart])
  const piped = blob.stream().pipeThrough(stream)
  const buf = await new Response(piped).arrayBuffer()
  return new Uint8Array(buf)
}

export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new CompressionStream('gzip'))
}

export function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new DecompressionStream('gzip'))
}
```

- [ ] **Step 6: Chạy test**

Run: `npx vitest run src/data`
Expected: 14 passed

Nếu `CompressionStream` không có trong jsdom của môi trường đang chạy, thêm vào đầu `src/data/__tests__/compress.test.ts`:

```ts
import { CompressionStream, DecompressionStream } from 'node:stream/web'
Object.assign(globalThis, { CompressionStream, DecompressionStream })
```

- [ ] **Step 7: Commit**

```bash
git add src/data/validate-upload.ts src/data/decode-image.ts src/data/compress.ts src/data/__tests__
git commit -m "feat(data): kiểm tra upload, decode ảnh ghép nền trắng, gzip

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Lưu trữ local bằng IndexedDB

**Files:**
- Create: `src/data/local-cache.ts`
- Test: `src/data/__tests__/local-cache.test.ts`

**Interfaces:**
- Consumes: `gzip`/`gunzip` (Task 21), `decodePuzzleBin`/`decodeRegions`/`assemblePuzzle` (Task 14), `Puzzle`, `PipelineParams`, `Rgb` (Task 2)
- Produces:
  - `interface PuzzleRecord { id: string; title: string; createdAt: number; width: number; height: number; colorCount: number; regionCount: number; palette: Rgb[]; params: PipelineParams; usedMinArea: number }`
  - `interface ProgressRecord { puzzleId: string; filled: Uint8Array; filledCount: number; activeSeconds: number; completedAt: number | null; updatedAt: number }`
  - `savePuzzle(rec: PuzzleRecord, binGz: Uint8Array, regionsGz: Uint8Array, original: Blob): Promise<void>`
  - `listPuzzles(): Promise<PuzzleRecord[]>` — mới nhất trước
  - `loadPuzzle(id: string): Promise<Puzzle>`
  - `loadOriginal(id: string): Promise<Blob | undefined>`
  - `deletePuzzle(id: string): Promise<void>` — xoá cả puzzle, blob, tiến độ, thumbnail
  - `saveProgress(rec: ProgressRecord): Promise<void>` · `loadProgress(puzzleId: string): Promise<ProgressRecord | undefined>`
  - `saveThumbnail(puzzleId: string, blob: Blob): Promise<void>` · `loadThumbnail(puzzleId: string): Promise<Blob | undefined>`
  - `newPuzzleId(): string`

**Thumbnail là store riêng, không nhồi vào `PuzzleRecord`.** `/library` chỉ cần metadata + thumbnail; nếu thumbnail nằm trong cùng record thì mỗi lần cập nhật tiến độ lại phải ghi lại cả metadata, và ngược lại `listPuzzles()` sẽ phải kéo theo hàng megabyte blob. Đây chính là cái bẫy hiệu năng spec §16 đã nêu.

**`newPuzzleId()` dùng `crypto.randomUUID()`** — nằm ở `data/` nên được phép; `core/` thì không.

- [ ] **Step 1: Viết test**

`src/data/__tests__/local-cache.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
Object.assign(globalThis, { CompressionStream, DecompressionStream })

import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { gzip } from '@/data/compress'
import {
  deletePuzzle,
  listPuzzles,
  loadOriginal,
  loadProgress,
  loadPuzzle,
  loadThumbnail,
  newPuzzleId,
  resetDatabaseForTests,
  saveProgress,
  savePuzzle,
  saveThumbnail,
  type PuzzleRecord,
} from '@/data/local-cache'
import { DEFAULT_PARAMS, type RegionMeta, type Rgb } from '@/core/types'

const palette: Rgb[] = [
  [10, 20, 30],
  [200, 100, 50],
]

const regions: RegionMeta[] = [
  { id: 0, colorIndex: 0, area: 6, minX: 0, minY: 0, maxX: 1, maxY: 2, anchorX: 0, anchorY: 1, anchorR: 1, hasLabel: true },
  { id: 1, colorIndex: 1, area: 6, minX: 2, minY: 0, maxX: 3, maxY: 2, anchorX: 3, anchorY: 1, anchorR: 1, hasLabel: false },
]

const regionMap = new Uint32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1])

function record(id: string, over: Partial<PuzzleRecord> = {}): PuzzleRecord {
  return {
    id,
    title: 'Tranh thử',
    createdAt: 1000,
    width: 4,
    height: 3,
    colorCount: 2,
    regionCount: 2,
    palette,
    params: DEFAULT_PARAMS,
    usedMinArea: 12,
    ...over,
  }
}

async function blobs() {
  const bin = encodePuzzleBin({ width: 4, height: 3, palette, regionCount: 2, regionMap })
  return {
    binGz: await gzip(bin),
    regionsGz: await gzip(new TextEncoder().encode(encodeRegions(regions))),
    original: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  }
}

beforeEach(async () => {
  await resetDatabaseForTests()
})

describe('newPuzzleId', () => {
  it('sinh id khác nhau mỗi lần', () => {
    expect(newPuzzleId()).not.toBe(newPuzzleId())
  })
})

describe('savePuzzle / listPuzzles / loadPuzzle', () => {
  it('lưu rồi đọc lại được metadata', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)

    const list = await listPuzzles()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'p1', title: 'Tranh thử', regionCount: 2 })
    expect(list[0].palette).toEqual(palette)
  })

  it('listPuzzles trả mới nhất trước', async () => {
    const b = await blobs()
    await savePuzzle(record('cu', { createdAt: 100 }), b.binGz, b.regionsGz, b.original)
    await savePuzzle(record('moi', { createdAt: 900 }), b.binGz, b.regionsGz, b.original)

    expect((await listPuzzles()).map((p) => p.id)).toEqual(['moi', 'cu'])
  })

  it('loadPuzzle giải nén và dựng lại Puzzle chơi được', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)

    const p = await loadPuzzle('p1')
    expect(p.width).toBe(4)
    expect(p.height).toBe(3)
    expect(p.regions).toHaveLength(2)
    expect(Array.from(p.regionMap)).toEqual(Array.from(regionMap))
    // outline và runs được derive lại, không lưu trong file
    expect(p.outline).toHaveLength(12)
    expect(p.runs.offsets).toHaveLength(3)
  })

  it('loadPuzzle với id không tồn tại → báo lỗi', async () => {
    await expect(loadPuzzle('khong-co')).rejects.toThrow(/không tìm thấy/i)
  })

  it('loadOriginal trả đúng blob đã lưu', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)

    const got = await loadOriginal('p1')
    expect(got).toBeDefined()
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('saveProgress / loadProgress', () => {
  it('lưu rồi đọc lại đúng bitset', async () => {
    await saveProgress({
      puzzleId: 'p1',
      filled: new Uint8Array([0b00000010]),
      filledCount: 1,
      activeSeconds: 42,
      completedAt: null,
      updatedAt: 5,
    })

    const got = await loadProgress('p1')
    expect(got?.filledCount).toBe(1)
    expect(got?.activeSeconds).toBe(42)
    expect(Array.from(got!.filled)).toEqual([2])
  })

  it('ghi lại thì thay thế bản cũ, không tạo bản trùng', async () => {
    const base = {
      puzzleId: 'p1',
      filled: new Uint8Array([1]),
      filledCount: 1,
      activeSeconds: 1,
      completedAt: null,
      updatedAt: 1,
    }
    await saveProgress(base)
    await saveProgress({ ...base, filledCount: 2, updatedAt: 2 })

    expect((await loadProgress('p1'))?.filledCount).toBe(2)
  })

  it('chưa có tiến độ → undefined', async () => {
    expect(await loadProgress('chua-co')).toBeUndefined()
  })
})

describe('thumbnail', () => {
  it('lưu rồi đọc lại được', async () => {
    await saveThumbnail('p1', new Blob([new Uint8Array([9, 9])], { type: 'image/webp' }))
    const got = await loadThumbnail('p1')
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(new Uint8Array([9, 9]))
  })

  it('chưa có → undefined', async () => {
    expect(await loadThumbnail('p1')).toBeUndefined()
  })
})

describe('deletePuzzle', () => {
  it('xoá sạch metadata, blob, tiến độ và thumbnail', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)
    await saveProgress({
      puzzleId: 'p1',
      filled: new Uint8Array([1]),
      filledCount: 1,
      activeSeconds: 0,
      completedAt: null,
      updatedAt: 0,
    })
    await saveThumbnail('p1', new Blob([new Uint8Array([1])]))

    await deletePuzzle('p1')

    expect(await listPuzzles()).toHaveLength(0)
    expect(await loadProgress('p1')).toBeUndefined()
    expect(await loadThumbnail('p1')).toBeUndefined()
    expect(await loadOriginal('p1')).toBeUndefined()
    await expect(loadPuzzle('p1')).rejects.toThrow()
  })

  it('xoá id không tồn tại không báo lỗi', async () => {
    await expect(deletePuzzle('khong-co')).resolves.toBeUndefined()
  })

  it('không ảnh hưởng puzzle khác', async () => {
    const b = await blobs()
    await savePuzzle(record('p1'), b.binGz, b.regionsGz, b.original)
    await savePuzzle(record('p2'), b.binGz, b.regionsGz, b.original)

    await deletePuzzle('p1')
    expect((await listPuzzles()).map((p) => p.id)).toEqual(['p2'])
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/data/__tests__/local-cache.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/data/local-cache.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  assemblePuzzle,
  decodePuzzleBin,
  decodeRegions,
} from '@/core/codec/puzzle-format'
import { gunzip } from '@/data/compress'
import type { PipelineParams, Puzzle, Rgb } from '@/core/types'

const DB_NAME = 'pokemon-color'
const DB_VERSION = 1

export interface PuzzleRecord {
  id: string
  title: string
  createdAt: number
  width: number
  height: number
  colorCount: number
  regionCount: number
  palette: Rgb[]
  params: PipelineParams
  usedMinArea: number
}

export interface ProgressRecord {
  puzzleId: string
  filled: Uint8Array
  filledCount: number
  activeSeconds: number
  completedAt: number | null
  updatedAt: number
}

interface BlobRecord {
  puzzleId: string
  binGz: Uint8Array
  regionsGz: Uint8Array
  original: Blob
}

interface Schema extends DBSchema {
  puzzles: { key: string; value: PuzzleRecord; indexes: { createdAt: number } }
  blobs: { key: string; value: BlobRecord }
  progress: { key: string; value: ProgressRecord }
  thumbnails: { key: string; value: { puzzleId: string; blob: Blob } }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const puzzles = d.createObjectStore('puzzles', { keyPath: 'id' })
      puzzles.createIndex('createdAt', 'createdAt')
      d.createObjectStore('blobs', { keyPath: 'puzzleId' })
      d.createObjectStore('progress', { keyPath: 'puzzleId' })
      d.createObjectStore('thumbnails', { keyPath: 'puzzleId' })
    },
  })
  return dbPromise
}

/** chỉ dùng trong test — đóng và xoá database để mỗi test bắt đầu sạch */
export async function resetDatabaseForTests(): Promise<void> {
  if (dbPromise) {
    ;(await dbPromise).close()
    dbPromise = null
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

export function newPuzzleId(): string {
  return crypto.randomUUID()
}

export async function savePuzzle(
  rec: PuzzleRecord,
  binGz: Uint8Array,
  regionsGz: Uint8Array,
  original: Blob,
): Promise<void> {
  const d = await db()
  const tx = d.transaction(['puzzles', 'blobs'], 'readwrite')
  await tx.objectStore('puzzles').put(rec)
  await tx.objectStore('blobs').put({ puzzleId: rec.id, binGz, regionsGz, original })
  await tx.done
}

/** mới nhất trước */
export async function listPuzzles(): Promise<PuzzleRecord[]> {
  const all = await (await db()).getAllFromIndex('puzzles', 'createdAt')
  return all.reverse()
}

export async function loadPuzzle(id: string): Promise<Puzzle> {
  const blobs = await (await db()).get('blobs', id)
  if (!blobs) throw new Error(`Không tìm thấy dữ liệu puzzle "${id}"`)

  const bin = decodePuzzleBin(await gunzip(blobs.binGz))
  const regions = decodeRegions(new TextDecoder().decode(await gunzip(blobs.regionsGz)))
  return assemblePuzzle(bin, regions)
}

export async function loadOriginal(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('blobs', id))?.original
}

/** xoá sạch mọi thứ liên quan tới puzzle này */
export async function deletePuzzle(id: string): Promise<void> {
  const d = await db()
  const tx = d.transaction(['puzzles', 'blobs', 'progress', 'thumbnails'], 'readwrite')
  await tx.objectStore('puzzles').delete(id)
  await tx.objectStore('blobs').delete(id)
  await tx.objectStore('progress').delete(id)
  await tx.objectStore('thumbnails').delete(id)
  await tx.done
}

export async function saveProgress(rec: ProgressRecord): Promise<void> {
  await (await db()).put('progress', rec)
}

export async function loadProgress(puzzleId: string): Promise<ProgressRecord | undefined> {
  return (await db()).get('progress', puzzleId)
}

export async function saveThumbnail(puzzleId: string, blob: Blob): Promise<void> {
  await (await db()).put('thumbnails', { puzzleId, blob })
}

export async function loadThumbnail(puzzleId: string): Promise<Blob | undefined> {
  return (await (await db()).get('thumbnails', puzzleId))?.blob
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/data/__tests__/local-cache.test.ts`
Expected: 14 passed

- [ ] **Step 5: Chạy toàn bộ test + typecheck**

Run: `npm test` → Expected: all passed
Run: `npm run typecheck` → Expected: không lỗi

- [ ] **Step 6: Commit**

```bash
git add src/data/local-cache.ts src/data/__tests__/local-cache.test.ts
git commit -m "feat(data): lưu puzzle, tiến độ và thumbnail trong IndexedDB

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Cầu nối worker — timeout, tiến độ, huỷ

**Files:**
- Create: `src/data/generate-client.ts`
- Test: `src/data/__tests__/generate-client.test.ts`

**Interfaces:**
- Consumes: `GenerateRequest`/`GenerateResponse` (Task 17), `PipelineParams`, `PipelineStage` (Task 2)
- Produces:
  - `PIPELINE_TIMEOUT_MS = 60_000`
  - `interface GenerateOutcome { bin: Uint8Array; regionsJson: string; regionCount: number; palette: Rgb[]; width: number; height: number; usedMinArea: number }`
  - `interface WorkerLike { postMessage(m: unknown): void; terminate(): void; onmessage: ((e: { data: GenerateResponse }) => void) | null }`
  - `generateInWorker(image, params, opts: { onProgress?: (stage: PipelineStage, ratio: number) => void; createWorker?: () => WorkerLike; timeoutMs?: number; signal?: AbortSignal }): Promise<GenerateOutcome>`
  - `createGenerateWorker(): WorkerLike` — dùng `new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })`

**Timeout phải terminate worker, không chỉ reject promise.** Nếu chỉ reject, worker vẫn tiếp tục ngốn CPU của một tab đã bỏ cuộc; người dùng thử ảnh nhỏ hơn thì máy vẫn đứng vì worker cũ chưa chết.

**`createWorker` là tham số** để test tiêm worker giả — Vitest không chạy `new Worker(new URL(...))` được.

- [ ] **Step 1: Viết test**

`src/data/__tests__/generate-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { generateInWorker, type WorkerLike } from '@/data/generate-client'
import type { GenerateResponse } from '@/worker/protocol'
import { DEFAULT_PARAMS, type PipelineStage } from '@/core/types'

const image = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }
const params = { ...DEFAULT_PARAMS, k: 3, minArea: 2 }

/** worker giả: phát trước một chuỗi response khi nhận postMessage */
function scriptedWorker(script: GenerateResponse[], delayed = false) {
  const w: WorkerLike & { terminate: ReturnType<typeof vi.fn> } = {
    onmessage: null,
    terminate: vi.fn(),
    postMessage: () => {
      if (delayed) return
      for (const r of script) w.onmessage?.({ data: r })
    },
  }
  return w
}

const done: GenerateResponse = {
  type: 'done',
  requestId: 1,
  bin: new Uint8Array([1, 2, 3]),
  regionsJson: '[]',
  regionCount: 0,
  palette: [[1, 2, 3]],
  width: 4,
  height: 4,
  usedMinArea: 7,
}

describe('generateInWorker', () => {
  it('trả về kết quả khi worker báo done', async () => {
    const w = scriptedWorker([done])
    const out = await generateInWorker(image, params, { createWorker: () => w })

    expect(out.regionCount).toBe(0)
    expect(out.usedMinArea).toBe(7)
    expect(Array.from(out.bin)).toEqual([1, 2, 3])
  })

  it('gọi onProgress cho từng message progress', async () => {
    const seen: [PipelineStage, number][] = []
    const w = scriptedWorker([
      { type: 'progress', requestId: 1, stage: 'chuan-hoa', ratio: 0 },
      { type: 'progress', requestId: 1, stage: 'quantize', ratio: 1 },
      done,
    ])

    await generateInWorker(image, params, {
      createWorker: () => w,
      onProgress: (stage, ratio) => seen.push([stage, ratio]),
    })

    expect(seen).toEqual([
      ['chuan-hoa', 0],
      ['quantize', 1],
    ])
  })

  it('terminate worker sau khi xong', async () => {
    const w = scriptedWorker([done])
    await generateInWorker(image, params, { createWorker: () => w })
    expect(w.terminate).toHaveBeenCalled()
  })

  it('worker báo error → reject kèm tên stage tiếng Việt', async () => {
    const w = scriptedWorker([
      {
        type: 'error',
        requestId: 1,
        stage: 'gop-vung-vun',
        message: 'vỡ rồi',
      },
    ])

    await expect(generateInWorker(image, params, { createWorker: () => w })).rejects.toThrow(
      /Gộp vùng vụn.*vỡ rồi/,
    )
    expect(w.terminate).toHaveBeenCalled()
  })

  it('error không có stage → thông báo không nhắc stage', async () => {
    const w = scriptedWorker([
      { type: 'error', requestId: 1, stage: null, message: 'ảnh rỗng' },
    ])
    await expect(generateInWorker(image, params, { createWorker: () => w })).rejects.toThrow(
      /ảnh rỗng/,
    )
  })

  it('quá timeout → reject, TERMINATE worker, gợi ý giảm kích thước', async () => {
    vi.useFakeTimers()
    const w = scriptedWorker([], true)

    const p = generateInWorker(image, params, { createWorker: () => w, timeoutMs: 1000 })
    const assertion = expect(p).rejects.toThrow(/quá lâu|giảm/i)
    await vi.advanceTimersByTimeAsync(1001)
    await assertion

    expect(w.terminate).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('abort qua signal → reject và terminate', async () => {
    const w = scriptedWorker([], true)
    const ac = new AbortController()

    const p = generateInWorker(image, params, {
      createWorker: () => w,
      signal: ac.signal,
    })
    ac.abort()

    await expect(p).rejects.toThrow(/huỷ/i)
    expect(w.terminate).toHaveBeenCalled()
  })

  it('signal đã abort từ trước → reject ngay, không tạo worker', async () => {
    const create = vi.fn(() => scriptedWorker([done]))
    const ac = new AbortController()
    ac.abort()

    await expect(
      generateInWorker(image, params, { createWorker: create, signal: ac.signal }),
    ).rejects.toThrow(/huỷ/i)
    expect(create).not.toHaveBeenCalled()
  })

  it('bỏ qua message có requestId khác', async () => {
    const w = scriptedWorker([
      { ...done, requestId: 999, usedMinArea: 111 },
      done,
    ])
    const out = await generateInWorker(image, params, { createWorker: () => w })
    expect(out.usedMinArea).toBe(7)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/data/__tests__/generate-client.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/data/generate-client.ts`:

```ts
import { STAGE_LABELS, type PipelineParams, type PipelineStage, type Rgb } from '@/core/types'
import type { GenerateRequest, GenerateResponse } from '@/worker/protocol'

export const PIPELINE_TIMEOUT_MS = 60_000

export interface GenerateOutcome {
  bin: Uint8Array
  regionsJson: string
  regionCount: number
  palette: Rgb[]
  width: number
  height: number
  usedMinArea: number
}

/** phần giao diện Worker mà ta thực sự dùng — cho phép tiêm worker giả khi test */
export interface WorkerLike {
  postMessage(m: unknown): void
  terminate(): void
  onmessage: ((e: { data: GenerateResponse }) => void) | null
}

export function createGenerateWorker(): WorkerLike {
  return new Worker(new URL('../worker/generate.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike
}

let nextRequestId = 1

/**
 * Chạy pipeline trong worker.
 *
 * Mọi đường ra (done / error / timeout / abort) đều TERMINATE worker. Nếu chỉ
 * reject promise mà để worker sống, một lần sinh thất bại sẽ tiếp tục ngốn CPU
 * và lần thử tiếp theo với ảnh nhỏ hơn vẫn đứng máy.
 */
export function generateInWorker(
  image: { data: Uint8ClampedArray; width: number; height: number },
  params: PipelineParams,
  opts: {
    onProgress?: (stage: PipelineStage, ratio: number) => void
    createWorker?: () => WorkerLike
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): Promise<GenerateOutcome> {
  const {
    onProgress,
    createWorker = createGenerateWorker,
    timeoutMs = PIPELINE_TIMEOUT_MS,
    signal,
  } = opts

  if (signal?.aborted) {
    return Promise.reject(new Error('Đã huỷ tạo puzzle'))
  }

  return new Promise<GenerateOutcome>((resolve, reject) => {
    const requestId = nextRequestId++
    const worker = createWorker()

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      worker.onmessage = null
      worker.terminate()
      fn()
    }

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'Tạo puzzle mất quá lâu (hơn 60 giây). Hãy giảm kích thước ảnh hoặc giảm số màu rồi thử lại.',
          ),
        ),
      )
    }, timeoutMs)

    const onAbort = (): void => {
      finish(() => reject(new Error('Đã huỷ tạo puzzle')))
    }
    signal?.addEventListener('abort', onAbort)

    worker.onmessage = (e) => {
      const r = e.data
      if (!r || r.requestId !== requestId) return

      if (r.type === 'progress') {
        onProgress?.(r.stage, r.ratio)
        return
      }
      if (r.type === 'error') {
        const where = r.stage ? `Lỗi ở bước "${STAGE_LABELS[r.stage]}": ` : ''
        finish(() => reject(new Error(`${where}${r.message}`)))
        return
      }
      finish(() =>
        resolve({
          bin: r.bin,
          regionsJson: r.regionsJson,
          regionCount: r.regionCount,
          palette: r.palette,
          width: r.width,
          height: r.height,
          usedMinArea: r.usedMinArea,
        }),
      )
    }

    const req: GenerateRequest = { type: 'generate', requestId, image, params }
    worker.postMessage(req)
  })
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/data/__tests__/generate-client.test.ts`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add src/data/generate-client.ts src/data/__tests__/generate-client.test.ts
git commit -m "feat(data): cầu nối worker có timeout, tiến độ và huỷ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Màn `/new` — upload, tinh chỉnh, xem trước, lưu

**Files:**
- Create: `src/ui/quality-check.ts`, `src/ui/components/dropzone.tsx`, `src/ui/components/tune-panel.tsx`, `src/ui/components/preview-canvas.tsx`, `src/routes/new.tsx`
- Test: `src/ui/__tests__/quality-check.test.ts`, `src/ui/__tests__/dropzone.test.tsx`, `src/ui/__tests__/tune-panel.test.tsx`

**Interfaces:**
- Consumes: `validateUpload` (Task 21), `decodeToRgba` (Task 21), `generateInWorker` (Task 23), `gzip` (Task 21), `savePuzzle`/`newPuzzleId` (Task 22), `decodePuzzleBin`/`decodeRegions`/`assemblePuzzle` (Task 14), `paintAllRegions`/`buildOutlineImageData` (Task 19), `drawLabels` (Task 19), `PRESETS`, `DEFAULT_PARAMS` (Task 2)
- Produces:
  - `type QualityVerdict = { level: 'ok' } | { level: 'qua-vun' | 'qua-tho'; message: string; hint: string }`
  - `checkQuality(regionCount: number): QualityVerdict`
  - `<Dropzone onFile={(f: File) => void} error={string | null} />`
  - `<TunePanel value={{ preset: PresetName | 'tuy-chinh'; k: number; targetRegions: number; smoothing: number }} onChange={...} disabled={boolean} />`
  - `<PreviewCanvas puzzle={Puzzle} maxWidth={number} />`
  - `<NewPuzzleRoute />` — default export của `src/routes/new.tsx`

**Ngưỡng cảnh báo là hằng số ở một chỗ**: `> 2000` vùng ⇒ "quá vụn", `< 20` ⇒ "quá thô" (spec §17). Cảnh báo hiện **ngay trên preview**, kèm gợi ý cụ thể phải kéo slider nào theo hướng nào — chỉ nói "quá vụn" thì người dùng không biết làm gì.

- [ ] **Step 1: Viết test cho quality-check**

`src/ui/__tests__/quality-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { checkQuality, MAX_GOOD_REGIONS, MIN_GOOD_REGIONS } from '@/ui/quality-check'

describe('checkQuality', () => {
  it('trong khoảng hợp lý → ok', () => {
    expect(checkQuality(500).level).toBe('ok')
    expect(checkQuality(MIN_GOOD_REGIONS).level).toBe('ok')
    expect(checkQuality(MAX_GOOD_REGIONS).level).toBe('ok')
  })

  it('quá nhiều vùng → qua-vun, gợi ý giảm chi tiết', () => {
    const v = checkQuality(MAX_GOOD_REGIONS + 1)
    expect(v.level).toBe('qua-vun')
    if (v.level === 'qua-vun') {
      expect(v.message).toMatch(String(MAX_GOOD_REGIONS + 1))
      expect(v.hint).toMatch(/độ chi tiết|số màu/i)
    }
  })

  it('quá ít vùng → qua-tho, gợi ý tăng chi tiết', () => {
    const v = checkQuality(MIN_GOOD_REGIONS - 1)
    expect(v.level).toBe('qua-tho')
    if (v.level === 'qua-tho') {
      expect(v.hint).toMatch(/độ chi tiết|số màu/i)
    }
  })

  it('ngưỡng khớp spec', () => {
    expect(MAX_GOOD_REGIONS).toBe(2000)
    expect(MIN_GOOD_REGIONS).toBe(20)
  })
})
```

- [ ] **Step 2: Implement quality-check**

`src/ui/quality-check.ts`:

```ts
/** ngưỡng theo spec §17 */
export const MAX_GOOD_REGIONS = 2000
export const MIN_GOOD_REGIONS = 20

export type QualityVerdict =
  | { level: 'ok' }
  | { level: 'qua-vun' | 'qua-tho'; message: string; hint: string }

/**
 * Đánh giá kết quả sinh puzzle.
 * Gợi ý phải nói rõ kéo slider nào theo hướng nào — chỉ báo "quá vụn" thì
 * người dùng không biết phải làm gì tiếp.
 */
export function checkQuality(regionCount: number): QualityVerdict {
  if (regionCount > MAX_GOOD_REGIONS) {
    return {
      level: 'qua-vun',
      message: `Ảnh này ra ${regionCount} vùng — quá vụn để tô.`,
      hint: 'Hãy kéo "độ chi tiết" xuống, hoặc giảm "số màu", rồi bấm Sinh lại.',
    }
  }
  if (regionCount < MIN_GOOD_REGIONS) {
    return {
      level: 'qua-tho',
      message: `Ảnh này chỉ ra ${regionCount} vùng — quá thô, tô xong rất nhanh.`,
      hint: 'Hãy kéo "độ chi tiết" lên, hoặc tăng "số màu", rồi bấm Sinh lại.',
    }
  }
  return { level: 'ok' }
}
```

- [ ] **Step 3: Viết test cho Dropzone và TunePanel**

`src/ui/__tests__/dropzone.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dropzone } from '@/ui/components/dropzone'

function pngFile(name = 'a.png', size = 100): File {
  const f = new File([new Uint8Array(size)], name, { type: 'image/png' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('Dropzone', () => {
  it('hiện hướng dẫn bằng tiếng Việt', () => {
    render(<Dropzone onFile={vi.fn()} error={null} />)
    expect(screen.getByText(/chọn ảnh|kéo ảnh/i)).toBeTruthy()
  })

  it('chọn file hợp lệ → gọi onFile', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error={null} />)

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile())
    expect(onFile).toHaveBeenCalledTimes(1)
  })

  it('file HEIC → KHÔNG gọi onFile, hiện lỗi hướng dẫn chuyển định dạng', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error={null} />)

    const heic = new File([new Uint8Array(10)], 'IMG.HEIC', { type: '' })
    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), heic)

    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/HEIC/i)
  })

  it('file quá lớn → hiện lỗi nêu 15 MB', async () => {
    const onFile = vi.fn()
    render(<Dropzone onFile={onFile} error={null} />)

    await userEvent.upload(screen.getByLabelText(/chọn ảnh/i), pngFile('big.png', 16 * 1024 * 1024))
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/15/)
  })

  it('lỗi truyền từ ngoài vào được hiện ra', () => {
    render(<Dropzone onFile={vi.fn()} error="Vỡ ở bước Gộp vùng vụn" />)
    expect(screen.getByRole('alert').textContent).toMatch(/Gộp vùng vụn/)
  })
})
```

`src/ui/__tests__/tune-panel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TunePanel } from '@/ui/components/tune-panel'
import { PRESETS } from '@/core/types'

const value = { preset: 'vua' as const, k: 12, targetRegions: 500, smoothing: 2 }

describe('TunePanel', () => {
  it('hiện đủ 3 preset', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    expect(screen.getByRole('radio', { name: /dễ/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /vừa/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /khó/i })).toBeTruthy()
  })

  it('chọn preset Khó → áp k và targetRegions của preset đó', async () => {
    const onChange = vi.fn()
    render(<TunePanel value={value} onChange={onChange} disabled={false} />)

    await userEvent.click(screen.getByRole('radio', { name: /khó/i }))
    expect(onChange).toHaveBeenCalledWith({
      preset: 'kho',
      k: PRESETS.kho.k,
      targetRegions: PRESETS.kho.targetRegions,
      smoothing: 2,
    })
  })

  it('kéo slider số màu → preset chuyển sang tuỳ chỉnh', async () => {
    const onChange = vi.fn()
    render(<TunePanel value={value} onChange={onChange} disabled={false} />)

    const slider = screen.getByLabelText(/số màu/i)
    await userEvent.clear(slider)
    await userEvent.type(slider, '16')

    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(last.preset).toBe('tuy-chinh')
  })

  it('slider số màu giới hạn 6..24', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
    const slider = screen.getByLabelText(/số màu/i)
    expect(slider.getAttribute('min')).toBe('6')
    expect(slider.getAttribute('max')).toBe('24')
  })

  it('disabled thì mọi điều khiển bị vô hiệu', () => {
    render(<TunePanel value={value} onChange={vi.fn()} disabled />)
    expect((screen.getByLabelText(/số màu/i) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: /dễ/i }) as HTMLInputElement).disabled).toBe(true)
  })
})
```

- [ ] **Step 4: Chạy test để chắc là fail**

Run: `npx vitest run src/ui`
Expected: FAIL — không resolve được `@/ui/components/dropzone`

Nếu `toBeTruthy` trên DOM node báo lỗi thiếu matcher, tạo `src/ui/__tests__/setup.ts` với `import '@testing-library/jest-dom/vitest'` và thêm vào `test.setupFiles` trong `vite.config.ts`.

- [ ] **Step 5: Implement Dropzone**

`src/ui/components/dropzone.tsx`:

```tsx
import { useId, useState, type DragEvent } from 'react'
import { validateUpload } from '@/data/validate-upload'

export function Dropzone({
  onFile,
  error,
}: {
  onFile: (f: File) => void
  error: string | null
}) {
  const inputId = useId()
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (file: File | undefined): void => {
    if (!file) return
    const bad = validateUpload({ name: file.name, type: file.type, size: file.size })
    if (bad) {
      setLocalError(bad.message)
      return
    }
    setLocalError(null)
    onFile(file)
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files[0])
  }

  const shown = localError ?? error

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          display: 'block',
          border: `2px dashed ${dragging ? '#2563eb' : '#cbd5e1'}`,
          borderRadius: 12,
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#eff6ff' : '#f8fafc',
        }}
      >
        Kéo ảnh vào đây, hoặc bấm để chọn ảnh
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
          PNG, JPG hoặc WebP · tối đa 15 MB
        </div>
        <input
          id={inputId}
          aria-label="Chọn ảnh"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </label>

      {shown && (
        <p role="alert" style={{ color: '#b91c1c', marginTop: 12 }}>
          {shown}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Implement TunePanel**

`src/ui/components/tune-panel.tsx`:

```tsx
import { PRESETS, type PresetName } from '@/core/types'

export interface TuneValue {
  preset: PresetName | 'tuy-chinh'
  k: number
  targetRegions: number
  smoothing: number
}

const PRESET_LABELS: Record<PresetName, string> = {
  de: 'Dễ',
  vua: 'Vừa',
  kho: 'Khó',
}

export function TunePanel({
  value,
  onChange,
  disabled,
}: {
  value: TuneValue
  onChange: (v: TuneValue) => void
  disabled: boolean
}) {
  const pickPreset = (p: PresetName): void => {
    onChange({ preset: p, k: PRESETS[p].k, targetRegions: PRESETS[p].targetRegions, smoothing: value.smoothing })
  }

  // mọi thay đổi bằng slider đều chuyển preset sang 'tuy-chinh' để UI không
  // nói dối là đang ở preset trong khi tham số đã lệch
  const tweak = (patch: Partial<TuneValue>): void => {
    onChange({ ...value, ...patch, preset: 'tuy-chinh' })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>Độ khó</legend>
        <div style={{ display: 'flex', gap: 12 }}>
          {(Object.keys(PRESETS) as PresetName[]).map((p) => (
            <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="preset"
                disabled={disabled}
                checked={value.preset === p}
                onChange={() => pickPreset(p)}
              />
              {PRESET_LABELS[p]}
              <span style={{ color: '#64748b', fontSize: 13 }}>
                ({PRESETS[p].k} màu · ~{PRESETS[p].targetRegions} vùng)
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label style={{ display: 'grid', gap: 4 }}>
        Số màu: {value.k}
        <input
          aria-label="Số màu"
          type="range"
          min={6}
          max={24}
          step={1}
          disabled={disabled}
          value={value.k}
          onChange={(e) => tweak({ k: Number(e.target.value) })}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        Độ chi tiết: ~{value.targetRegions} vùng
        <input
          aria-label="Độ chi tiết"
          type="range"
          min={50}
          max={2000}
          step={50}
          disabled={disabled}
          value={value.targetRegions}
          onChange={(e) => tweak({ targetRegions: Number(e.target.value) })}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        Làm phẳng: {value.smoothing} lượt
        <input
          aria-label="Làm phẳng"
          type="range"
          min={0}
          max={3}
          step={1}
          disabled={disabled}
          value={value.smoothing}
          onChange={(e) => tweak({ smoothing: Number(e.target.value) })}
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 7: Implement PreviewCanvas**

`src/ui/components/preview-canvas.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { PaintEngine } from '@/core/engine/paint-engine'
import { buildOutlineImageData, paintAllRegions } from '@/render/layers'
import { drawLabels } from '@/render/label-layer'
import { fitViewport } from '@/render/viewport'
import type { Puzzle } from '@/core/types'

/**
 * Xem trước puzzle ở trạng thái CHƯA tô gì: line-art trắng + viền đen + số.
 * Đây đúng là thứ người dùng sẽ thấy khi bắt đầu tô, nên nhìn preview là
 * biết ngay puzzle có tô được hay không.
 */
export function PreviewCanvas({ puzzle, maxWidth }: { puzzle: Puzzle; maxWidth: number }) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLCanvasElement>(null)

  const scale = Math.min(1, maxWidth / puzzle.width)
  const viewW = Math.round(puzzle.width * scale)
  const viewH = Math.round(puzzle.height * scale)

  useEffect(() => {
    const base = baseRef.current
    const labels = labelRef.current
    if (!base || !labels) return

    const bctx = base.getContext('2d')
    const lctx = labels.getContext('2d')
    if (!bctx || !lctx) return

    const engine = new PaintEngine(puzzle.regions)
    paintAllRegions(bctx, puzzle, engine)

    void createImageBitmap(buildOutlineImageData(puzzle)).then((bmp) => {
      bctx.drawImage(bmp, 0, 0)
      bmp.close()
    })

    drawLabels(lctx, puzzle, engine, fitViewport(puzzle.width, puzzle.height, viewW, viewH), viewW, viewH)
  }, [puzzle, viewW, viewH])

  return (
    <div style={{ position: 'relative', width: viewW, height: viewH }}>
      <canvas
        ref={baseRef}
        width={puzzle.width}
        height={puzzle.height}
        style={{ position: 'absolute', inset: 0, width: viewW, height: viewH }}
      />
      <canvas
        ref={labelRef}
        width={viewW}
        height={viewH}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
```

- [ ] **Step 8: Implement route `/new`**

`src/routes/new.tsx`:

```tsx
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assemblePuzzle, decodePuzzleBin, decodeRegions } from '@/core/codec/puzzle-format'
import { DEFAULT_PARAMS, PRESETS, STAGE_LABELS, type PipelineParams, type PipelineStage, type Puzzle, type RgbaImage } from '@/core/types'
import { gzip } from '@/data/compress'
import { decodeToRgba } from '@/data/decode-image'
import { generateInWorker } from '@/data/generate-client'
import { newPuzzleId, savePuzzle } from '@/data/local-cache'
import { Dropzone } from '@/ui/components/dropzone'
import { PreviewCanvas } from '@/ui/components/preview-canvas'
import { TunePanel, type TuneValue } from '@/ui/components/tune-panel'
import { checkQuality, type QualityVerdict } from '@/ui/quality-check'

interface Draft {
  puzzle: Puzzle
  bin: Uint8Array
  regionsJson: string
  usedMinArea: number
  verdict: QualityVerdict
}

export default function NewPuzzleRoute() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [tune, setTune] = useState<TuneValue>({
    preset: 'vua',
    k: PRESETS.vua.k,
    targetRegions: PRESETS.vua.targetRegions,
    smoothing: DEFAULT_PARAMS.smoothing,
  })
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<PipelineStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const imageRef = useRef<RgbaImage | null>(null)

  const generate = useCallback(
    async (img: RgbaImage, t: TuneValue) => {
      setBusy(true)
      setError(null)
      setDraft(null)
      try {
        const params: PipelineParams = {
          ...DEFAULT_PARAMS,
          k: t.k,
          targetRegions: t.targetRegions,
          smoothing: t.smoothing,
          minArea: 'auto',
        }
        const out = await generateInWorker(img, params, {
          onProgress: (s) => setStage(s),
        })
        const puzzle = assemblePuzzle(decodePuzzleBin(out.bin), decodeRegions(out.regionsJson))
        setDraft({
          puzzle,
          bin: out.bin,
          regionsJson: out.regionsJson,
          usedMinArea: out.usedMinArea,
          verdict: checkQuality(out.regionCount),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
        setStage(null)
      }
    },
    [],
  )

  const onFile = async (f: File): Promise<void> => {
    setFile(f)
    setTitle(f.name.replace(/\.[^.]+$/, ''))
    try {
      const img = await decodeToRgba(f)
      imageRef.current = img
      await generate(img, tune)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const save = async (): Promise<void> => {
    if (!draft || !file) return
    const id = newPuzzleId()
    await savePuzzle(
      {
        id,
        title: title.trim() || 'Không tên',
        createdAt: Date.now(),
        width: draft.puzzle.width,
        height: draft.puzzle.height,
        colorCount: draft.puzzle.palette.length,
        regionCount: draft.puzzle.regions.length,
        palette: draft.puzzle.palette,
        params: {
          ...DEFAULT_PARAMS,
          k: tune.k,
          targetRegions: tune.targetRegions,
          smoothing: tune.smoothing,
          minArea: draft.usedMinArea,
        },
        usedMinArea: draft.usedMinArea,
      },
      await gzip(draft.bin),
      await gzip(new TextEncoder().encode(draft.regionsJson)),
      file,
    )
    navigate(`/play/${id}`)
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'grid', gap: 24 }}>
      <h1>Tạo tranh tô màu mới</h1>

      {!file && <Dropzone onFile={onFile} error={error} />}

      {file && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 24 }}>
          <section style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              Tên tranh
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <TunePanel value={tune} onChange={setTune} disabled={busy} />

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                disabled={busy || !imageRef.current}
                onClick={() => imageRef.current && void generate(imageRef.current, tune)}
              >
                Sinh lại
              </button>
              <button type="button" disabled={busy || !draft} onClick={() => void save()}>
                Lưu và tô
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setFile(null)
                setDraft(null)
                imageRef.current = null
              }}
              style={{ justifySelf: 'start', background: 'none', border: 0, color: '#2563eb', padding: 0 }}
            >
              Chọn ảnh khác
            </button>
          </section>

          <section>
            {busy && (
              <p role="status">
                Đang xử lý{stage ? `: ${STAGE_LABELS[stage]}` : ''}…
              </p>
            )}
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}

            {draft && (
              <>
                {draft.verdict.level !== 'ok' && (
                  <div
                    role="alert"
                    style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, marginBottom: 12 }}
                  >
                    <strong>{draft.verdict.message}</strong>
                    <div>{draft.verdict.hint}</div>
                  </div>
                )}
                <p style={{ color: '#475569' }}>
                  {draft.puzzle.regions.length} vùng · {draft.puzzle.palette.length} màu ·{' '}
                  {draft.puzzle.width}×{draft.puzzle.height}
                </p>
                <PreviewCanvas puzzle={draft.puzzle} maxWidth={680} />
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 9: Cài react-router và chạy test**

```bash
npm install react-router-dom
```

Run: `npx vitest run src/ui`
Expected: 14 passed

- [ ] **Step 10: Commit**

```bash
git add src/ui src/routes/new.tsx package.json package-lock.json
git commit -m "feat(ui): màn tạo puzzle với xem trước và tinh chỉnh

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: Hook trạng thái tô

**Files:**
- Create: `src/ui/hooks/use-paint.ts`
- Test: `src/ui/__tests__/use-paint.test.tsx`

**Interfaces:**
- Consumes: `PaintEngine` (Task 16), `SoundBoard` (Task 20), `saveProgress`/`loadProgress` (Task 22), `Puzzle` (Task 2)
- Produces:
  - `AUTOSAVE_DEBOUNCE_MS = 1500`
  - `interface PaintState { engine: PaintEngine; selectedColor: number | null; filledCount: number; progress: number; remaining: Uint32Array; isComplete: boolean; announcement: string }`
  - `usePaint(puzzleId: string, puzzle: Puzzle, sound: SoundBoard): PaintState & { selectColor(i: number): void; paint(regionId: number): void; reset(): void; flush(): Promise<void> }`

**Tự động chọn màu tiếp theo khi một màu tô xong.** Nếu không, người chơi tô xong màu 3 rồi bấm tiếp mà không hiểu sao không ăn gì — đây là điểm gây bối rối rõ rệt và sửa chỉ mất 3 dòng.

**`announcement` là chuỗi cho `aria-live`.** Cập nhật sau mỗi lần tô để người dùng đọc màn hình biết tiến độ (spec §8 a11y).

- [ ] **Step 1: Viết test**

`src/ui/__tests__/use-paint.test.tsx`:

```tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { SoundBoard } from '@/audio/synth'
import { loadProgress, resetDatabaseForTests } from '@/data/local-cache'
import { usePaint } from '@/ui/hooks/use-paint'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

/** 6×1: 3 vùng, màu 0, 1, 1 */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 0, 1, 1, 2, 2])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: 2, minX: 0, minY: 0, maxX: 1, maxY: 0, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: true },
    { id: 1, colorIndex: 1, area: 2, minX: 2, minY: 0, maxX: 3, maxY: 0, anchorX: 2, anchorY: 0, anchorR: 1, hasLabel: true },
    { id: 2, colorIndex: 1, area: 2, minX: 4, minY: 0, maxX: 5, maxY: 0, anchorX: 4, anchorY: 0, anchorR: 1, hasLabel: true },
  ]
  return assemblePuzzle({ width: 6, height: 1, palette, regionCount: 3, regionMap }, regions)
}

function silentSound(): SoundBoard {
  const sb = new SoundBoard(() => {
    throw new Error('không có audio trong test')
  })
  return sb
}

beforeEach(async () => {
  await resetDatabaseForTests()
})

describe('usePaint', () => {
  it('khởi tạo với tiến độ 0 và chưa chọn màu', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    expect(result.current.filledCount).toBe(0)
    expect(result.current.progress).toBe(0)
    expect(result.current.selectedColor).toBeNull()
  })

  it('chưa chọn màu thì paint không làm gì', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.paint(0))
    expect(result.current.filledCount).toBe(0)
  })

  it('chọn màu đúng rồi tô → tiến độ tăng', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    expect(result.current.filledCount).toBe(1)
  })

  it('tô sai màu → không đổi tiến độ', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(1))
    expect(result.current.filledCount).toBe(0)
  })

  it('remaining đếm đúng số vùng còn lại mỗi màu', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    expect(Array.from(result.current.remaining)).toEqual([1, 2])

    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    expect(Array.from(result.current.remaining)).toEqual([1, 1])
  })

  it('TỰ CHỌN màu tiếp theo khi màu đang chọn đã tô xong', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    // màu 0 đã hết vùng ⇒ phải tự nhảy sang màu 1
    expect(result.current.selectedColor).toBe(1)
  })

  it('không tự đổi màu khi màu đang chọn vẫn còn vùng', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    expect(result.current.selectedColor).toBe(1)
  })

  it('isComplete khi tô hết', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    act(() => result.current.paint(2))
    expect(result.current.isComplete).toBe(true)
    expect(result.current.progress).toBe(1)
  })

  it('announcement nêu số vùng còn lại', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    expect(result.current.announcement).toMatch(/2/)
  })

  it('reset xoá tiến độ', () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    act(() => result.current.reset())
    expect(result.current.filledCount).toBe(0)
  })

  it('flush ghi tiến độ xuống IndexedDB', async () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    await act(async () => {
      await result.current.flush()
    })

    const saved = await loadProgress('p1')
    expect(saved?.filledCount).toBe(1)
  })

  it('tự lưu sau debounce', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    vi.useRealTimers()

    await waitFor(async () => {
      expect((await loadProgress('p1'))?.filledCount).toBe(1)
    })
  })

  it('nạp lại tiến độ đã lưu khi mount lại', async () => {
    const p = puzzle()
    const first = renderHook(() => usePaint('p1', p, silentSound()))
    act(() => first.result.current.selectColor(0))
    act(() => first.result.current.paint(0))
    await act(async () => {
      await first.result.current.flush()
    })
    first.unmount()

    const again = renderHook(() => usePaint('p1', p, silentSound()))
    await waitFor(() => {
      expect(again.result.current.filledCount).toBe(1)
    })
  })

  it('completedAt được ghi khi hoàn thành', async () => {
    const { result } = renderHook(() => usePaint('p1', puzzle(), silentSound()))
    act(() => result.current.selectColor(0))
    act(() => result.current.paint(0))
    act(() => result.current.selectColor(1))
    act(() => result.current.paint(1))
    act(() => result.current.paint(2))
    await act(async () => {
      await result.current.flush()
    })

    expect((await loadProgress('p1'))?.completedAt).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/ui/__tests__/use-paint.test.tsx`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/ui/hooks/use-paint.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SoundBoard } from '@/audio/synth'
import { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { loadProgress, saveProgress } from '@/data/local-cache'

export const AUTOSAVE_DEBOUNCE_MS = 1500

export interface PaintState {
  engine: PaintEngine
  selectedColor: number | null
  filledCount: number
  progress: number
  remaining: Uint32Array
  isComplete: boolean
  announcement: string
}

export function usePaint(
  puzzleId: string,
  puzzle: Puzzle,
  sound: SoundBoard,
): PaintState & {
  selectColor: (i: number) => void
  paint: (regionId: number) => void
  reset: () => void
  flush: () => Promise<void>
} {
  const colorCount = puzzle.palette.length
  const engine = useMemo(() => new PaintEngine(puzzle.regions), [puzzle])

  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const activeSeconds = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const bump = useCallback(() => setTick((t) => t + 1), [])

  const save = useCallback(async () => {
    dirty.current = false
    const complete = engine.isComplete()
    await saveProgress({
      puzzleId,
      filled: engine.toBitset(),
      filledCount: engine.filledCount,
      activeSeconds: activeSeconds.current,
      completedAt: complete ? Date.now() : null,
      updatedAt: Date.now(),
    })
  }, [engine, puzzleId])

  const scheduleSave = useCallback(() => {
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS)
  }, [save])

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    await save()
  }, [save])

  // nạp tiến độ đã lưu
  useEffect(() => {
    let alive = true
    void loadProgress(puzzleId).then((rec) => {
      if (!alive || !rec) return
      const restored = new PaintEngine(puzzle.regions, rec.filled)
      for (let i = 0; i < puzzle.regions.length; i++) {
        if (restored.isFilled(i)) engine.tryPaint(i, puzzle.regions[i].colorIndex)
      }
      activeSeconds.current = rec.activeSeconds
      bump()
    })
    return () => {
      alive = false
    }
  }, [puzzleId, puzzle, engine, bump])

  // đếm thời gian hoạt động: chỉ tính khi tab đang hiện
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') activeSeconds.current += 1
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const remaining = useMemo(
    () => engine.remainingByColor(colorCount),
    [engine, colorCount, tick],
  )

  const selectColor = useCallback((i: number) => setSelectedColor(i), [])

  const paint = useCallback(
    (regionId: number) => {
      if (selectedColor === null) return

      const r = engine.tryPaint(regionId, selectedColor)
      if (r.status === 'rejected') {
        sound.reject()
        return
      }
      if (r.status === 'already') return

      const left = engine.remainingByColor(colorCount)
      const complete = engine.isComplete()

      if (complete) sound.complete()
      else if (left[selectedColor] === 0) sound.colorDone()
      else sound.fill(engine.progress)

      // tự nhảy sang màu còn vùng gần nhất khi màu đang chọn đã xong —
      // nếu không, người chơi bấm tiếp mà không hiểu sao không ăn
      if (!complete && left[selectedColor] === 0) {
        const next = left.findIndex((n) => n > 0)
        if (next >= 0) setSelectedColor(next)
      }

      setAnnouncement(
        complete
          ? 'Đã tô xong toàn bộ tranh'
          : `Đã tô một vùng, còn ${engine.regionCount - engine.filledCount} vùng`,
      )
      bump()
      scheduleSave()
    },
    [selectedColor, engine, colorCount, sound, bump, scheduleSave],
  )

  const reset = useCallback(() => {
    engine.reset()
    setSelectedColor(null)
    setAnnouncement('Đã xoá toàn bộ tiến độ')
    bump()
    scheduleSave()
  }, [engine, bump, scheduleSave])

  return {
    engine,
    selectedColor,
    filledCount: engine.filledCount,
    progress: engine.progress,
    remaining,
    isComplete: engine.isComplete(),
    announcement,
    selectColor,
    paint,
    reset,
    flush,
  }
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/ui/__tests__/use-paint.test.tsx`
Expected: 14 passed

- [ ] **Step 5: Commit**

```bash
git add src/ui/hooks/use-paint.ts src/ui/__tests__/use-paint.test.tsx
git commit -m "feat(ui): hook trạng thái tô với autosave và tự đổi màu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Palette bar

**Files:**
- Create: `src/ui/components/palette-bar.tsx`
- Test: `src/ui/__tests__/palette-bar.test.tsx`

**Interfaces:**
- Consumes: `rgbCss` (Task 19), `Rgb` (Task 2)
- Produces: `<PaletteBar palette={Rgb[]} remaining={Uint32Array} selected={number | null} onSelect={(i: number) => void} />`

**Nút của màu đã tô xong phải bị `disabled`, không chỉ làm mờ.** Nếu chỉ mờ đi mà vẫn bấm được, người dùng chọn nó rồi bấm khắp tranh mà không có gì xảy ra — trông như app hỏng.

Nút hiển thị **số thứ tự từ 1** (không phải `colorIndex` từ 0), khớp với số in trên tranh ở Task 19.

- [ ] **Step 1: Viết test**

`src/ui/__tests__/palette-bar.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaletteBar } from '@/ui/components/palette-bar'
import type { Rgb } from '@/core/types'

const palette: Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
]

describe('PaletteBar', () => {
  it('hiện một nút cho mỗi màu, đánh số từ 1', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([3, 2, 1])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /màu 1/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /màu 3/i })).toBeTruthy()
  })

  it('hiện số vùng còn lại của từng màu', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([7, 2, 0])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: /màu 1/i }).textContent).toMatch(/7/)
  })

  it('bấm nút → gọi onSelect với colorIndex', async () => {
    const onSelect = vi.fn()
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 1])} selected={null} onSelect={onSelect} />,
    )
    await userEvent.click(screen.getByRole('radio', { name: /màu 2/i }))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('màu đang chọn có aria-checked', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 1])} selected={1} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: /màu 2/i }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /màu 1/i }).getAttribute('aria-checked')).toBe('false')
  })

  it('màu đã tô xong bị DISABLED, không chỉ làm mờ', async () => {
    const onSelect = vi.fn()
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 0])} selected={null} onSelect={onSelect} />,
    )
    const done = screen.getByRole('radio', { name: /màu 3/i }) as HTMLButtonElement
    expect(done.disabled).toBe(true)

    await userEvent.click(done)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('nhãn của màu đã xong nói rõ là đã xong', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 0])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radio', { name: /màu 3.*xong/i })).toBeTruthy()
  })

  it('có role radiogroup với nhãn', () => {
    render(
      <PaletteBar palette={palette} remaining={new Uint32Array([1, 1, 1])} selected={null} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('radiogroup', { name: /bảng màu/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implement**

`src/ui/components/palette-bar.tsx`:

```tsx
import type { Rgb } from '@/core/types'
import { rgbCss } from '@/render/layers'

export function PaletteBar({
  palette,
  remaining,
  selected,
  onSelect,
}: {
  palette: Rgb[]
  remaining: Uint32Array
  selected: number | null
  onSelect: (i: number) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Bảng màu"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8 }}
    >
      {palette.map((c, i) => {
        const left = remaining[i] ?? 0
        const done = left === 0
        const active = selected === i
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={active}
            // nút bị disabled thật, không chỉ mờ: chọn được một màu đã xong
            // rồi bấm khắp tranh mà không gì xảy ra trông như app hỏng
            disabled={done}
            aria-label={done ? `Màu ${i + 1}, đã tô xong` : `Màu ${i + 1}, còn ${left} vùng`}
            onClick={() => onSelect(i)}
            style={{
              width: 52,
              padding: 4,
              borderRadius: 8,
              border: active ? '3px solid #111827' : '1px solid #cbd5e1',
              background: '#fff',
              opacity: done ? 0.4 : 1,
              cursor: done ? 'default' : 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'block',
                height: 26,
                borderRadius: 4,
                background: rgbCss(c),
                border: '1px solid rgba(0,0,0,.15)',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
              {done ? '✓' : left}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Chạy test**

Run: `npx vitest run src/ui/__tests__/palette-bar.test.tsx`
Expected: 7 passed

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/palette-bar.tsx src/ui/__tests__/palette-bar.test.tsx
git commit -m "feat(ui): palette bar với số vùng còn lại và vô hiệu màu đã xong

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: Canvas tương tác — bấm, kéo-tô, zoom/pan, bàn phím

**Files:**
- Create: `src/ui/components/paint-canvas.tsx`
- Test: `src/ui/__tests__/paint-canvas.test.tsx`

**Interfaces:**
- Consumes: `paintRegion`/`paintAllRegions`/`buildOutlineImageData`/`rgbCss`/`UNFILLED_COLOR` (Task 19), `drawLabels` (Task 19), `drawHighlight` (Task 19), `fitViewport`/`zoomAbout`/`panBy`/`clampPan`/`hitTestRegion` (Task 18), `Puzzle` (Task 2), `PaintEngine` (Task 16)
- Produces:
  - `MIN_SCALE = 0.2` · `MAX_SCALE = 24`
  - `<PaintCanvas puzzle={Puzzle} engine={PaintEngine} selectedColor={number | null} onPaintRegion={(id: number) => void} onFirstPointer={() => void} width={number} height={number} />`
  - `getCanvasRef(): { redrawAll(): void }` qua `ref` — để `/play` gọi khi reset

> ⚠️ **`getCanvasRef` liệt kê ở đây KHÔNG BAO GIỜ được xây — đã phát hiện lúc thực thi final fix wave.** Step 3 của task này không hề tạo `ref`/`useImperativeHandle` nào, và Task 28 (màn `/play` tiêu thụ `PaintCanvas`) cũng không hề gọi `getCanvasRef()` — thay vào đó Task 28 dùng `key={resetCount}` để remount toàn bộ `PaintCanvas` khi reset (xem annotation của Task 28 tại nơi dùng). Đây không đơn thuần là một API chưa dùng tới: bản thân cơ chế `useEffect(redrawAll, [redrawAll])` với `redrawAll` phụ thuộc `[puzzle, engine]` — đúng như spec ở Task này — là **NGUỒN GỐC của C1** (finding Critical trong final fix wave, xem báo cáo `.superpowers/sdd/2026-07-27-plan-1-core-pipeline/final-fix-wave-report.md`):
>
> `PaintEngine` mutate bitset TẠI CHỖ (không tạo object mới) khi phục hồi tiến độ đã lưu (`usePaint`'s restore effect gọi `engine.tryPaint(...)` trực tiếp lên instance hiện có). Vì vậy cả `puzzle` lẫn `engine` không bao giờ đổi tham chiếu khi restore xảy ra, và `useEffect(redrawAll, [redrawAll])` — với `redrawAll` khoá theo đúng hai tham chiếu đó — không chạy lại. `paintAllRegions` (hàm DUY NHẤT vẽ lại toàn bộ layer base từ trạng thái engine) chỉ chạy đúng một lần lúc mount, **trước khi** `loadProgress` (bất đồng bộ) kịp resolve. Kết quả: những vùng được phục hồi hiện đúng số liệu ở header/palette nhưng vẫn hiện màu UNFILLED_COLOR trên canvas, và vì engine coi chúng là đã tô, người chơi không bao giờ tô lại được (`tryPaint` trả `already`).
>
> **Cách sửa đã áp dụng (final fix wave, không phải `getCanvasRef`/`useImperativeHandle`):** thêm một prop `revision: number` vào `PaintCanvas`, đưa vào dependency của `redrawAll`; `usePaint` sở hữu một counter `revision` (state riêng, KHÔNG dùng chung với `tick`/`filledCount`) và tăng nó đúng MỘT LẦN, bên trong callback `.then()` của effect restore, sau khi vòng lặp `engine.tryPaint(...)` phục hồi xong toàn bộ bitset. `/play` truyền `revision={paint.revision}` xuống `PaintCanvas`. Lý do không chọn `getCanvasRef`: nó vốn đã được liệt kê ở đây từ đầu nhưng chưa từng được ai xây trong suốt các task trước — thêm nó bây giờ nghĩa là xây một API imperative mới (ref + useImperativeHandle) cho một use case (redraw sau restore) hoàn toàn có thể giải quyết bằng data flow khai báo (prop `revision`) nhất quán với phần còn lại của component, và không cần đụng tới cơ chế `key={resetCount}` đã có sẵn cho reset. Quan trọng: `revision` CHỈ tăng sau restore, không tăng ở mỗi lần tô — nếu không, `redrawAll` (O(toàn bộ vùng)) sẽ chạy lại ở mọi cú tô, đúng chi phí mà cơ chế tô theo run (`paintRegion`) tồn tại để tránh.
>
> Nếu thực thi lại task này (và Task 25 `usePaint`, Task 28 `/play`), một re-run trung thực với đặc tả gốc sẽ TÁI TẠO LẠI C1 — hãy áp dụng cơ chế `revision` mô tả ở trên thay vì theo đúng interface `useEffect(redrawAll, [redrawAll])` / `getCanvasRef` liệt kê trong tài liệu này.

**Ba layer canvas xếp lên nhau:**
1. `base` — kích thước bằng ẢNH, style CSS đặt theo viewport (transform bằng CSS `transform: translate() scale()`), nên tô một vùng chỉ là vài `fillRect` toạ độ pixel, không bao giờ phải vẽ lại cả tranh khi zoom.
2. `overlay` — cũng kích thước ảnh, chứa highlight.
3. `labels` — kích thước MÀN HÌNH, vẽ số theo scale hiện tại.

**Kéo-tô phải phân biệt với pan.** Quy ước: chuột trái / một ngón = tô; giữ `Space`, chuột giữa, hoặc hai ngón = pan. Nếu không tách rõ, mỗi lần muốn di chuyển tranh là tô nhầm cả vệt.

**Bàn phím (spec §8):** `1`–`9`, `0` chọn màu 1–10 · `[` `]` đổi trang palette khi K > 10 · mũi tên di chuyển con trỏ vùng theo thứ tự id · `Enter`/`Space` tô vùng đang focus · `+`/`-` zoom · `f` fit.

- [ ] **Step 1: Viết test**

`src/ui/__tests__/paint-canvas.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import { PaintCanvas } from '@/ui/components/paint-canvas'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

beforeAll(() => {
  // jsdom không có canvas 2D thật; stub đủ để component chạy
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  Object.assign(globalThis, {
    createImageBitmap: vi.fn(async () => ({ close: vi.fn() })),
    ImageData: class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  })
})

/** 4×1: 4 vùng, màu 0,1,0,1 */
function puzzle(): Puzzle {
  const regionMap = new Uint32Array([0, 1, 2, 3])
  const palette: Rgb[] = [
    [255, 0, 0],
    [0, 0, 255],
  ]
  const regions: RegionMeta[] = [0, 1, 0, 1].map((colorIndex, id) => ({
    id,
    colorIndex,
    area: 1,
    minX: id,
    minY: 0,
    maxX: id,
    maxY: 0,
    anchorX: id,
    anchorY: 0,
    anchorR: 1,
    hasLabel: true,
  })) as RegionMeta[]
  return assemblePuzzle({ width: 4, height: 1, palette, regionCount: 4, regionMap }, regions)
}

function setup(over: Partial<Parameters<typeof PaintCanvas>[0]> = {}) {
  const p = puzzle()
  const props = {
    puzzle: p,
    engine: new PaintEngine(p.regions),
    selectedColor: 0 as number | null,
    onPaintRegion: vi.fn(),
    onFirstPointer: vi.fn(),
    width: 400,
    height: 100,
    ...over,
  }
  render(<PaintCanvas {...props} />)
  return props
}

describe('PaintCanvas', () => {
  it('có vùng tương tác focus được bằng bàn phím', () => {
    setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    expect(surface.getAttribute('tabindex')).toBe('0')
  })

  it('bấm vào tranh → gọi onPaintRegion với id vùng đúng', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    // fit: ảnh 4×1 trong khung 400×100 ⇒ scale 100, canh giữa dọc
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).toHaveBeenCalledWith(1)
  })

  it('lần chạm đầu tiên gọi onFirstPointer đúng một lần', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer({ target: surface, coords: { clientX: 50, clientY: 50 }, keys: '[MouseLeft]' })
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onFirstPointer).toHaveBeenCalledTimes(1)
  })

  it('bấm ra ngoài ảnh → không gọi onPaintRegion', async () => {
    const props = setup({ height: 400 })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    await userEvent.pointer({ target: surface, coords: { clientX: 5, clientY: 5 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).not.toHaveBeenCalled()
  })

  it('phím mũi tên phải rồi Enter → tô vùng kế tiếp', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()

    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(props.onPaintRegion).toHaveBeenCalledWith(1)
  })

  it('mũi tên trái ở vùng đầu không đi âm', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Enter}')
    expect(props.onPaintRegion).toHaveBeenCalledWith(0)
  })

  it('Space cũng tô vùng đang focus', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}[Space]')
    expect(props.onPaintRegion).toHaveBeenCalledWith(2)
  })

  it('kéo chuột trái tô nhiều vùng liên tiếp', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer([
      { target: surface, coords: { clientX: 50, clientY: 50 }, keys: '[MouseLeft>]' },
      { target: surface, coords: { clientX: 150, clientY: 50 } },
      { target: surface, coords: { clientX: 250, clientY: 50 } },
      { target: surface, keys: '[/MouseLeft]' },
    ])

    const ids = props.onPaintRegion.mock.calls.map((c) => c[0])
    expect(ids).toEqual(expect.arrayContaining([0, 1, 2]))
  })

  it('không tô lại cùng một vùng khi rê trong lòng nó', async () => {
    const props = setup()
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.pointer([
      { target: surface, coords: { clientX: 20, clientY: 50 }, keys: '[MouseLeft>]' },
      { target: surface, coords: { clientX: 40, clientY: 50 } },
      { target: surface, coords: { clientX: 60, clientY: 50 } },
      { target: surface, keys: '[/MouseLeft]' },
    ])

    expect(props.onPaintRegion.mock.calls.filter((c) => c[0] === 0)).toHaveLength(1)
  })

  it('chưa chọn màu thì không tô', async () => {
    const props = setup({ selectedColor: null })
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    await userEvent.pointer({ target: surface, coords: { clientX: 150, clientY: 50 }, keys: '[MouseLeft]' })
    expect(props.onPaintRegion).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/ui/__tests__/paint-canvas.test.tsx`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Implement**

`src/ui/components/paint-canvas.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type WheelEvent } from 'react'
import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { buildOutlineImageData, paintAllRegions, paintRegion, rgbCss, UNFILLED_COLOR } from '@/render/layers'
import { drawHighlight } from '@/render/highlight'
import { drawLabels } from '@/render/label-layer'
import { clampPan, fitViewport, hitTestRegion, panBy, zoomAbout, type Viewport } from '@/render/viewport'

export const MIN_SCALE = 0.2
export const MAX_SCALE = 24

export function PaintCanvas({
  puzzle,
  engine,
  selectedColor,
  onPaintRegion,
  onFirstPointer,
  width,
  height,
}: {
  puzzle: Puzzle
  engine: PaintEngine
  selectedColor: number | null
  onPaintRegion: (regionId: number) => void
  onFirstPointer: () => void
  width: number
  height: number
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<Viewport>(() =>
    fitViewport(puzzle.width, puzzle.height, width, height),
  )
  const [focusRegion, setFocusRegion] = useState(0)
  const dragMode = useRef<'none' | 'paint' | 'pan'>('none')
  const lastRegion = useRef<number | null>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const spaceHeld = useRef(false)
  const firstPointerDone = useRef(false)

  const redrawAll = useCallback(() => {
    const ctx = baseRef.current?.getContext('2d')
    if (!ctx) return
    paintAllRegions(ctx, puzzle, engine)
    void createImageBitmap(buildOutlineImageData(puzzle)).then((bmp) => {
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
    })
  }, [puzzle, engine])

  useEffect(redrawAll, [redrawAll])

  useEffect(() => {
    setView(fitViewport(puzzle.width, puzzle.height, width, height))
  }, [puzzle.width, puzzle.height, width, height])

  // highlight + số vẽ lại khi màu chọn, viewport, hay tiến độ đổi
  useEffect(() => {
    const octx = overlayRef.current?.getContext('2d')
    const lctx = labelRef.current?.getContext('2d')
    if (octx) drawHighlight(octx, puzzle, engine, selectedColor, view, puzzle.width, puzzle.height)
    if (lctx) drawLabels(lctx, puzzle, engine, view, width, height)
  }, [puzzle, engine, selectedColor, view, width, height, engine.filledCount])

  const localPoint = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const rect = surfaceRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** tô một vùng: cập nhật canvas ngay rồi báo lên trên */
  const tryPaintAt = (sx: number, sy: number): void => {
    if (selectedColor === null) return
    const id = hitTestRegion(view, puzzle.regionMap, puzzle.width, puzzle.height, sx, sy)
    if (id === null || id === lastRegion.current) return
    lastRegion.current = id

    if (puzzle.regions[id].colorIndex === selectedColor && !engine.isFilled(id)) {
      const ctx = baseRef.current?.getContext('2d')
      if (ctx) paintRegion(ctx, puzzle, id, rgbCss(puzzle.palette[selectedColor]))
    }
    onPaintRegion(id)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (!firstPointerDone.current) {
      firstPointerDone.current = true
      onFirstPointer()
    }
    surfaceRef.current?.focus()
    e.currentTarget.setPointerCapture(e.pointerId)

    const p = localPoint(e)
    lastPoint.current = p

    // chuột giữa hoặc giữ Space ⇒ pan; còn lại ⇒ tô.
    // Tách rõ hai chế độ, nếu không thì mỗi lần muốn di chuyển tranh sẽ tô
    // nhầm cả một vệt.
    if (e.button === 1 || spaceHeld.current) {
      dragMode.current = 'pan'
      return
    }
    dragMode.current = 'paint'
    lastRegion.current = null
    tryPaintAt(p.x, p.y)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const p = localPoint(e)
    if (dragMode.current === 'paint') {
      tryPaintAt(p.x, p.y)
    } else if (dragMode.current === 'pan' && lastPoint.current) {
      const moved = panBy(view, p.x - lastPoint.current.x, p.y - lastPoint.current.y)
      setView(clampPan(moved, puzzle.width, puzzle.height, width, height))
    }
    lastPoint.current = p
  }

  const endDrag = (): void => {
    dragMode.current = 'none'
    lastRegion.current = null
    lastPoint.current = null
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const p = localPoint(e)
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const zoomed = zoomAbout(view, p.x, p.y, factor, MIN_SCALE, MAX_SCALE)
    setView(clampPan(zoomed, puzzle.width, puzzle.height, width, height))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const n = puzzle.regions.length
    if (e.key === ' ' && dragMode.current === 'none') spaceHeld.current = true

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        setFocusRegion((i) => Math.min(n - 1, i + 1))
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        setFocusRegion((i) => Math.max(0, i - 1))
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (selectedColor !== null) {
          lastRegion.current = null
          const id = focusRegion
          if (puzzle.regions[id].colorIndex === selectedColor && !engine.isFilled(id)) {
            const ctx = baseRef.current?.getContext('2d')
            if (ctx) paintRegion(ctx, puzzle, id, rgbCss(puzzle.palette[selectedColor]))
          }
          onPaintRegion(id)
        }
        return
      case '+':
      case '=':
        e.preventDefault()
        setView((v) => clampPan(zoomAbout(v, width / 2, height / 2, 1.25, MIN_SCALE, MAX_SCALE), puzzle.width, puzzle.height, width, height))
        return
      case '-':
        e.preventDefault()
        setView((v) => clampPan(zoomAbout(v, width / 2, height / 2, 0.8, MIN_SCALE, MAX_SCALE), puzzle.width, puzzle.height, width, height))
        return
      case 'f':
        e.preventDefault()
        setView(fitViewport(puzzle.width, puzzle.height, width, height))
        return
      default:
        return
    }
  }

  const cssTransform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`

  return (
    <div
      ref={surfaceRef}
      role="application"
      aria-label="Tranh tô màu"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === ' ') spaceHeld.current = false
      }}
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        background: '#e2e8f0',
        touchAction: 'none',
        outlineOffset: 2,
      }}
    >
      <canvas
        ref={baseRef}
        width={puzzle.width}
        height={puzzle.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: cssTransform,
          imageRendering: 'pixelated',
          background: UNFILLED_COLOR,
        }}
      />
      <canvas
        ref={overlayRef}
        width={puzzle.width}
        height={puzzle.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: cssTransform,
          pointerEvents: 'none',
        }}
      />
      <canvas
        ref={labelRef}
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/ui/__tests__/paint-canvas.test.tsx`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/paint-canvas.tsx src/ui/__tests__/paint-canvas.test.tsx
git commit -m "feat(ui): canvas tương tác — kéo-tô, zoom giữ điểm, bàn phím

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: Màn `/play` — ghép hoàn chỉnh

**Files:**
- Create: `src/ui/components/completion-banner.tsx`, `src/ui/make-thumbnail.ts`, `src/routes/play.tsx`
- Test: `src/ui/__tests__/make-thumbnail.test.ts`, `src/ui/__tests__/play.test.tsx`

**Interfaces:**
- Consumes: `usePaint` (Task 25), `PaletteBar` (Task 26), `PaintCanvas` (Task 27), `SoundBoard` (Task 20), `loadPuzzle`/`loadOriginal`/`saveThumbnail`/`listPuzzles` (Task 22), `paintAllRegions` (Task 19)
- Produces:
  - `THUMBNAIL_MAX_PX = 320`
  - `makeThumbnail(puzzle: Puzzle, engine: PaintEngine): Promise<Blob>`
  - `<CompletionBanner progress={number} originalUrl={string | null} onClose={() => void} />`
  - `<PlayRoute />` — default export của `src/routes/play.tsx`

**Thumbnail được render khi RỜI màn chơi**, không phải khi mở `/library`. Đây chính là điểm spec §16 đã chốt: tải `puzzle.bin` của 20 puzzle rồi decode khi mở thư viện sẽ treo màn hình vài giây.

**Phím số chọn màu được xử lý ở `/play`, không ở `PaintCanvas`** — vì palette là state của `/play`. `1`–`9` chọn màu 1–9, `0` chọn màu 10, `[` `]` đổi trang khi `K > 10`.

- [ ] **Step 1: Viết test cho make-thumbnail**

`src/ui/__tests__/make-thumbnail.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { assemblePuzzle } from '@/core/codec/puzzle-format'
import { PaintEngine } from '@/core/engine/paint-engine'
import { makeThumbnail, THUMBNAIL_MAX_PX, thumbnailSize } from '@/ui/make-thumbnail'
import type { Puzzle, RegionMeta, Rgb } from '@/core/types'

function puzzle(w: number, h: number): Puzzle {
  const regionMap = new Uint32Array(w * h)
  const palette: Rgb[] = [[1, 2, 3]]
  const regions: RegionMeta[] = [
    { id: 0, colorIndex: 0, area: w * h, minX: 0, minY: 0, maxX: w - 1, maxY: h - 1, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: false },
  ]
  return assemblePuzzle({ width: w, height: h, palette, regionCount: 1, regionMap }, regions)
}

beforeAll(() => {
  Object.assign(globalThis, {
    OffscreenCanvas: class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return {
          fillStyle: '',
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          clearRect: vi.fn(),
          setTransform: vi.fn(),
          scale: vi.fn(),
        }
      }
      convertToBlob() {
        return Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/webp' }))
      }
    },
  })
})

describe('thumbnailSize', () => {
  it('cạnh dài về đúng THUMBNAIL_MAX_PX, giữ tỉ lệ', () => {
    expect(thumbnailSize(1400, 700)).toEqual({ w: THUMBNAIL_MAX_PX, h: THUMBNAIL_MAX_PX / 2 })
    expect(thumbnailSize(700, 1400)).toEqual({ w: THUMBNAIL_MAX_PX / 2, h: THUMBNAIL_MAX_PX })
  })

  it('ảnh nhỏ hơn thì không phóng lên', () => {
    expect(thumbnailSize(100, 50)).toEqual({ w: 100, h: 50 })
  })

  it('không bao giờ ra 0', () => {
    const s = thumbnailSize(1000, 2)
    expect(s.h).toBeGreaterThanOrEqual(1)
  })
})

describe('makeThumbnail', () => {
  it('trả về Blob webp', async () => {
    const p = puzzle(40, 20)
    const blob = await makeThumbnail(p, new PaintEngine(p.regions))
    expect(blob.type).toBe('image/webp')
  })
})
```

- [ ] **Step 2: Implement make-thumbnail**

`src/ui/make-thumbnail.ts`:

```ts
import type { PaintEngine } from '@/core/engine/paint-engine'
import type { Puzzle } from '@/core/types'
import { paintAllRegions } from '@/render/layers'

export const THUMBNAIL_MAX_PX = 320

export function thumbnailSize(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(w, h))
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  }
}

/**
 * Render trạng thái tô hiện tại thành WebP nhỏ để `/library` hiện được ngay.
 *
 * Gọi khi RỜI màn chơi, không phải khi mở thư viện: tải puzzle.bin của 20
 * puzzle rồi decode lúc mở thư viện sẽ treo màn hình vài giây (spec §16).
 */
export async function makeThumbnail(puzzle: Puzzle, engine: PaintEngine): Promise<Blob> {
  const full = new OffscreenCanvas(puzzle.width, puzzle.height)
  const fctx = full.getContext('2d')
  if (!fctx) throw new Error('Không tạo được canvas cho thumbnail')
  paintAllRegions(fctx as unknown as CanvasRenderingContext2D, puzzle, engine)

  const { w, h } = thumbnailSize(puzzle.width, puzzle.height)
  const small = new OffscreenCanvas(w, h)
  const sctx = small.getContext('2d')
  if (!sctx) throw new Error('Không tạo được canvas cho thumbnail')
  sctx.drawImage(full as unknown as CanvasImageSource, 0, 0, w, h)

  return small.convertToBlob({ type: 'image/webp', quality: 0.8 })
}
```

- [ ] **Step 3: Implement CompletionBanner**

`src/ui/components/completion-banner.tsx`:

```tsx
export function CompletionBanner({
  originalUrl,
  onClose,
}: {
  originalUrl: string | null
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đã hoàn thành"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        zIndex: 10,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 900, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Hoàn thành! 🎉</h2>
        <p>Bạn đã tô xong toàn bộ bức tranh.</p>
        {originalUrl && (
          <div>
            <p style={{ color: '#475569', fontSize: 14 }}>Ảnh gốc:</p>
            <img
              src={originalUrl}
              alt="Ảnh gốc"
              style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: 8 }}
            />
          </div>
        )}
        <button type="button" onClick={onClose} style={{ marginTop: 16 }}>
          Đóng
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Viết test cho màn play**

`src/ui/__tests__/play.test.tsx`:

```tsx
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
Object.assign(globalThis, { CompressionStream, DecompressionStream })

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { gzip } from '@/data/compress'
import { resetDatabaseForTests, savePuzzle, loadProgress } from '@/data/local-cache'
import { DEFAULT_PARAMS, type RegionMeta, type Rgb } from '@/core/types'
import PlayRoute from '@/routes/play'

const palette: Rgb[] = [
  [255, 0, 0],
  [0, 0, 255],
]
const regionMap = new Uint32Array([0, 1, 2, 3])
const regions: RegionMeta[] = [0, 1, 0, 1].map((colorIndex, id) => ({
  id,
  colorIndex,
  area: 1,
  minX: id,
  minY: 0,
  maxX: id,
  maxY: 0,
  anchorX: id,
  anchorY: 0,
  anchorR: 1,
  hasLabel: true,
})) as RegionMeta[]

beforeAll(() => {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  Object.assign(globalThis, {
    createImageBitmap: vi.fn(async () => ({ close: vi.fn() })),
    ImageData: class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
    OffscreenCanvas: class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return ctx
      }
      convertToBlob() {
        return Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/webp' }))
      }
    },
    AudioContext: class {
      state = 'running'
      currentTime = 0
      destination = {}
      resume() {
        return Promise.resolve()
      }
      createOscillator() {
        return {
          type: '',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }
      }
      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
      }
    },
  })
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true })
})

beforeEach(async () => {
  await resetDatabaseForTests()
  await savePuzzle(
    {
      id: 'p1',
      title: 'Tranh thử',
      createdAt: 1,
      width: 4,
      height: 1,
      colorCount: 2,
      regionCount: 4,
      palette,
      params: DEFAULT_PARAMS,
      usedMinArea: 1,
    },
    await gzip(encodePuzzleBin({ width: 4, height: 1, palette, regionCount: 4, regionMap })),
    await gzip(new TextEncoder().encode(encodeRegions(regions))),
    new Blob([new Uint8Array([1])], { type: 'image/png' }),
  )
})

function renderPlay() {
  return render(
    <MemoryRouter initialEntries={['/play/p1']}>
      <Routes>
        <Route path="/play/:id" element={<PlayRoute />} />
        <Route path="/library" element={<div>thư viện</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayRoute', () => {
  it('nạp puzzle và hiện tên, tiến độ, palette', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    expect(screen.getByRole('radiogroup', { name: /bảng màu/i })).toBeTruthy()
    expect(screen.getByText(/0\s*\/\s*4/)).toBeTruthy()
  })

  it('có vùng aria-live cho thông báo tiến độ', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toBeTruthy()
  })

  it('phím số 1 chọn màu 1', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.keyboard('1')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /màu 1/i }).getAttribute('aria-checked')).toBe('true'),
    )
  })

  it('bấm nút màu rồi tô bằng bàn phím → tiến độ tăng', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByText(/1\s*\/\s*4/)).toBeTruthy())
  })

  it('nút "Xem ảnh gốc" mặc định KHÔNG hiện ảnh', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    expect(screen.queryByAltText(/ảnh gốc/i)).toBeNull()
    expect(screen.getByRole('button', { name: /xem ảnh gốc/i })).toBeTruthy()
  })

  it('bấm "Xem ảnh gốc" thì hiện ảnh', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xem ảnh gốc/i }))
    await waitFor(() => expect(screen.getByAltText(/ảnh gốc/i)).toBeTruthy())
  })

  it('nút tắt tiếng đổi trạng thái', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    const btn = screen.getByRole('button', { name: /tắt tiếng|bật tiếng/i })
    const before = btn.textContent
    await userEvent.click(btn)
    await waitFor(() => expect(screen.getByRole('button', { name: /tắt tiếng|bật tiếng/i }).textContent).not.toBe(before))
  })

  it('"Tô lại từ đầu" cần xác nhận rồi mới xoá', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByText(/1\s*\/\s*4/)).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /tô lại từ đầu/i }))
    await userEvent.click(screen.getByRole('button', { name: /^xoá tiến độ$/i }))
    await waitFor(() => expect(screen.getByText(/0\s*\/\s*4/)).toBeTruthy())
  })

  it('id không tồn tại → hiện lỗi, không crash', async () => {
    render(
      <MemoryRouter initialEntries={['/play/khong-co']}>
        <Routes>
          <Route path="/play/:id" element={<PlayRoute />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/không tìm thấy/i))
  })

  it('tô xong hết → hiện banner hoàn thành', async () => {
    renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    surface.focus()
    // vùng 0 và 2 là màu 1; vùng 1 và 3 là màu 2
    await userEvent.keyboard('{Enter}{ArrowRight}{ArrowRight}{Enter}')
    await userEvent.click(screen.getByRole('radio', { name: /màu 2/i }))
    surface.focus()
    await userEvent.keyboard('{ArrowLeft}{Enter}{ArrowRight}{ArrowRight}{Enter}')

    await waitFor(() => expect(screen.getByRole('dialog', { name: /hoàn thành/i })).toBeTruthy())
  })

  it('lưu tiến độ khi unmount', async () => {
    const { unmount } = renderPlay()
    await waitFor(() => expect(screen.getByText('Tranh thử')).toBeTruthy())

    await userEvent.click(screen.getByRole('radio', { name: /màu 1/i }))
    const surface = screen.getByRole('application', { name: /tranh tô màu/i })
    surface.focus()
    await userEvent.keyboard('{Enter}')

    unmount()
    await waitFor(async () => expect((await loadProgress('p1'))?.filledCount).toBe(1))
  })
})
```

- [ ] **Step 5: Chạy test để chắc là fail**

Run: `npx vitest run src/ui/__tests__/play.test.tsx`
Expected: FAIL — không resolve được `@/routes/play`

- [ ] **Step 6: Implement route `/play`**

`src/routes/play.tsx`:

> ⚠️ **Annotation Task 28 tại điểm dùng `<PaintCanvas>` — được Task 27 trỏ tới.** Bản implement dưới đây (viết lúc lập plan) gọi `<PaintCanvas puzzle={puzzle} engine={paint.engine} ... />` KHÔNG có `key`/`revision`, và effect dọn dẹp lúc rời màn chỉ gọi thẳng `paintRef.current.flush()`. Final fix wave đã thêm HAI thứ mà bản dưới đây thiếu:
>
> 1. **`key={resetCount}`** trên `<PaintCanvas>` (kèm state `resetCount` tăng mỗi lần xác nhận "Tô lại từ đầu"): `PaintEngine.reset()` mutate bitset tại chỗ, không đổi tham chiếu `engine`, nên nếu không remount, layer base của `PaintCanvas` giữ nguyên màu đã tô cũ. Đây thay cho `getCanvasRef()` liệt kê ở Task 27 — API đó chưa từng được xây.
> 2. **`revision={paint.revision}`** — sửa C1 (xem annotation đầy đủ ở Task 27, ngay chỗ liệt kê `getCanvasRef`): `usePaint` tăng `revision` đúng một lần sau khi phục hồi tiến độ đã lưu xong, và `PaintCanvas` đưa prop này vào dependency của `redrawAll` để vẽ lại layer base sau restore.
>
> Nếu thực thi lại task này, áp dụng cả hai cơ chế trên tại đúng JSX `<PaintCanvas ... />` ở Step 6 bên dưới, thay vì theo đúng chữ ký không `key`/`revision` như viết ở đây.

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SoundBoard } from '@/audio/synth'
import type { Puzzle } from '@/core/types'
import { loadOriginal, loadPuzzle, saveThumbnail } from '@/data/local-cache'
import { CompletionBanner } from '@/ui/components/completion-banner'
import { PaintCanvas } from '@/ui/components/paint-canvas'
import { PaletteBar } from '@/ui/components/palette-bar'
import { usePaint } from '@/ui/hooks/use-paint'
import { makeThumbnail } from '@/ui/make-thumbnail'

export default function PlayRoute() {
  const { id = '' } = useParams()
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPuzzle(null)
    setLoadError(null)
    loadPuzzle(id)
      .then((p) => alive && setPuzzle(p))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [id])

  if (loadError) {
    return (
      <main style={{ padding: 24 }}>
        <p role="alert" style={{ color: '#b91c1c' }}>{loadError}</p>
        <Link to="/library">Về thư viện</Link>
      </main>
    )
  }
  if (!puzzle) return <main style={{ padding: 24 }}>Đang tải…</main>

  return <PlayScreen puzzleId={id} puzzle={puzzle} />
}

function PlayScreen({ puzzleId, puzzle }: { puzzleId: string; puzzle: Puzzle }) {
  const sound = useMemo(() => new SoundBoard(), [])
  const [muted, setMuted] = useState(sound.muted)
  const paint = usePaint(puzzleId, puzzle, sound)
  const [peek, setPeek] = useState(false)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [askReset, setAskReset] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [size, setSize] = useState({ w: 800, h: 520 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef(paint)
  paintRef.current = paint

  // ảnh gốc chỉ tải khi thực sự cần (bấm xem, hoặc hoàn thành)
  useEffect(() => {
    if (!peek && !showDone) return
    if (originalUrl) return
    let url: string | null = null
    void loadOriginal(puzzleId).then((blob) => {
      if (!blob) return
      url = URL.createObjectURL(blob)
      setOriginalUrl(url)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [peek, showDone, originalUrl, puzzleId])

  useEffect(() => {
    if (paint.isComplete) setShowDone(true)
  }, [paint.isComplete])

  // đo khung để canvas vừa cửa sổ
  useEffect(() => {
    const measure = (): void => {
      const el = wrapRef.current
      if (!el) return
      setSize({ w: Math.max(320, el.clientWidth), h: Math.max(240, window.innerHeight - 260) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // phím số chọn màu — xử lý ở đây vì palette là state của màn này
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1
        if (i < puzzle.palette.length) paintRef.current.selectColor(i)
      } else if (e.key === '0' && puzzle.palette.length >= 10) {
        paintRef.current.selectColor(9)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [puzzle.palette.length])

  // lưu tiến độ + render thumbnail khi rời màn chơi
  useEffect(() => {
    return () => {
      const p = paintRef.current
      void p.flush()
      void makeThumbnail(puzzle, p.engine)
        .then((blob) => saveThumbnail(puzzleId, blob))
        .catch(() => {
          // thumbnail chỉ để trang trí thư viện; thất bại không ảnh hưởng tiến độ
        })
    }
  }, [puzzle, puzzleId])

  const toggleMute = useCallback(() => {
    const next = !sound.muted
    sound.setMuted(next)
    setMuted(next)
  }, [sound])

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/library">← Thư viện</Link>
        <strong>{`Tranh`}</strong>
        <span>{puzzle.regions.length} vùng</span>
        <span>
          {paint.filledCount} / {puzzle.regions.length} ·{' '}
          {Math.round(paint.progress * 100)}%
        </span>
        <button type="button" onClick={() => setPeek((v) => !v)}>
          {peek ? 'Ẩn ảnh gốc' : 'Xem ảnh gốc'}
        </button>
        <button type="button" onClick={toggleMute}>
          {muted ? 'Bật tiếng' : 'Tắt tiếng'}
        </button>
        <button type="button" onClick={() => setAskReset(true)}>
          Tô lại từ đầu
        </button>
      </header>

      <p aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {paint.announcement}
      </p>

      <PaletteBar
        palette={puzzle.palette}
        remaining={paint.remaining}
        selected={paint.selectedColor}
        onSelect={paint.selectColor}
      />

      <div ref={wrapRef}>
        <PaintCanvas
          puzzle={puzzle}
          engine={paint.engine}
          selectedColor={paint.selectedColor}
          onPaintRegion={paint.paint}
          onFirstPointer={() => sound.unlock()}
          width={size.w}
          height={size.h}
        />
      </div>

      {peek && originalUrl && (
        <img src={originalUrl} alt="Ảnh gốc" style={{ maxWidth: 320, borderRadius: 8 }} />
      )}

      {askReset && (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận tô lại" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', zIndex: 20 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
            <p>Xoá toàn bộ tiến độ của tranh này?</p>
            <button
              type="button"
              onClick={() => {
                paint.reset()
                setAskReset(false)
                setShowDone(false)
              }}
            >
              Xoá tiến độ
            </button>{' '}
            <button type="button" onClick={() => setAskReset(false)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {showDone && paint.isComplete && (
        <CompletionBanner originalUrl={originalUrl} onClose={() => setShowDone(false)} />
      )}
    </main>
  )
}
```

- [ ] **Step 7: Chạy test**

Run: `npx vitest run src/ui/__tests__/make-thumbnail.test.ts src/ui/__tests__/play.test.tsx`
Expected: 15 passed

- [ ] **Step 8: Commit**

```bash
git add src/ui/make-thumbnail.ts src/ui/components/completion-banner.tsx src/routes/play.tsx src/ui/__tests__/make-thumbnail.test.ts src/ui/__tests__/play.test.tsx
git commit -m "feat(ui): màn chơi hoàn chỉnh với xem ảnh gốc, mừng hoàn thành, thumbnail

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 29: Màn `/library`, routing và kiểm tra tay toàn luồng

**Files:**
- Create: `src/routes/library.tsx`, `src/App.tsx` (ghi đè file Vite tạo), `src/main.tsx` (ghi đè)
- Modify: `index.html` — đổi `<title>` thành `Tô màu theo số`
- Delete: `src/App.css`, `src/index.css` phần mẫu của Vite (giữ file, xoá nội dung mẫu), `src/assets/react.svg`
- Test: `src/ui/__tests__/library.test.tsx`

**Interfaces:**
- Consumes: `listPuzzles`/`loadThumbnail`/`deletePuzzle`/`loadProgress` (Task 22)
- Produces:
  - `<LibraryRoute />` — default export của `src/routes/library.tsx`
  - `<App />` với `createHashRouter`: `/` → chuyển tới `/library` · `/library` · `/new` · `/play/:id`

**Dùng hash router, không phải browser router.** Deploy static không có server rewrite; với browser router thì F5 ở `/play/abc` sẽ ra 404. Hash router (`#/play/abc`) hoạt động ở mọi kiểu hosting tĩnh, kể cả mở file trực tiếp.

- [ ] **Step 1: Viết test**

`src/ui/__tests__/library.test.tsx`:

```tsx
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompressionStream, DecompressionStream } from 'node:stream/web'
Object.assign(globalThis, { CompressionStream, DecompressionStream })

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { encodePuzzleBin, encodeRegions } from '@/core/codec/puzzle-format'
import { gzip } from '@/data/compress'
import {
  listPuzzles,
  resetDatabaseForTests,
  saveProgress,
  savePuzzle,
  saveThumbnail,
} from '@/data/local-cache'
import { DEFAULT_PARAMS, type RegionMeta, type Rgb } from '@/core/types'
import LibraryRoute from '@/routes/library'

const palette: Rgb[] = [[1, 2, 3]]
const regions: RegionMeta[] = [
  { id: 0, colorIndex: 0, area: 4, minX: 0, minY: 0, maxX: 3, maxY: 0, anchorX: 0, anchorY: 0, anchorR: 1, hasLabel: false },
]

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:thumb'), writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true })
})

async function seed(id: string, title: string, createdAt: number, regionCount = 4) {
  await savePuzzle(
    {
      id,
      title,
      createdAt,
      width: 4,
      height: 1,
      colorCount: 1,
      regionCount,
      palette,
      params: DEFAULT_PARAMS,
      usedMinArea: 1,
    },
    await gzip(encodePuzzleBin({ width: 4, height: 1, palette, regionCount: 1, regionMap: new Uint32Array(4) })),
    await gzip(new TextEncoder().encode(encodeRegions(regions))),
    new Blob([new Uint8Array([1])]),
  )
}

beforeEach(async () => {
  await resetDatabaseForTests()
})

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<LibraryRoute />} />
        <Route path="/new" element={<div>màn tạo mới</div>} />
        <Route path="/play/:id" element={<div>màn chơi</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LibraryRoute', () => {
  it('thư viện rỗng → gợi ý tạo tranh mới', async () => {
    renderLibrary()
    await waitFor(() => expect(screen.getByText(/chưa có tranh nào/i)).toBeTruthy())
    expect(screen.getByRole('link', { name: /tạo tranh mới/i })).toBeTruthy()
  })

  it('hiện danh sách puzzle, mới nhất trước', async () => {
    await seed('a', 'Tranh cũ', 100)
    await seed('b', 'Tranh mới', 900)
    renderLibrary()

    await waitFor(() => expect(screen.getByText('Tranh mới')).toBeTruthy())
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(['Tranh mới', 'Tranh cũ'])
  })

  it('hiện tiến độ theo phần trăm', async () => {
    await seed('a', 'Tranh', 100, 4)
    await saveProgress({
      puzzleId: 'a',
      filled: new Uint8Array([0b0000_0011]),
      filledCount: 2,
      activeSeconds: 0,
      completedAt: null,
      updatedAt: 0,
    })
    renderLibrary()
    await waitFor(() => expect(screen.getByText(/50%/)).toBeTruthy())
  })

  it('puzzle chưa có thumbnail hiện placeholder', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())
    expect(screen.getByText(/chưa tô/i)).toBeTruthy()
  })

  it('có thumbnail thì hiện ảnh', async () => {
    await seed('a', 'Tranh', 100)
    await saveThumbnail('a', new Blob([new Uint8Array([1])], { type: 'image/webp' }))
    renderLibrary()
    await waitFor(() => expect(screen.getByAltText(/Tranh/)).toBeTruthy())
  })

  it('mỗi card có link vào màn chơi', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())
    expect(screen.getByRole('link', { name: /tô tranh/i }).getAttribute('href')).toBe('/play/a')
  })

  it('xoá cần xác nhận, rồi card biến mất', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xoá/i }))
    await userEvent.click(screen.getByRole('button', { name: /^xoá tranh$/i }))

    await waitFor(() => expect(screen.queryByText('Tranh')).toBeNull())
    expect(await listPuzzles()).toHaveLength(0)
  })

  it('huỷ xác nhận thì không xoá', async () => {
    await seed('a', 'Tranh', 100)
    renderLibrary()
    await waitFor(() => expect(screen.getByText('Tranh')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /xoá/i }))
    await userEvent.click(screen.getByRole('button', { name: /huỷ/i }))

    expect(screen.getByText('Tranh')).toBeTruthy()
    expect(await listPuzzles()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run: `npx vitest run src/ui/__tests__/library.test.tsx`
Expected: FAIL — không resolve được `@/routes/library`

- [ ] **Step 3: Implement `/library`**

`src/routes/library.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deletePuzzle,
  listPuzzles,
  loadProgress,
  loadThumbnail,
  type PuzzleRecord,
} from '@/data/local-cache'

interface Card {
  rec: PuzzleRecord
  percent: number
  thumbUrl: string | null
}

export default function LibraryRoute() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [askDelete, setAskDelete] = useState<string | null>(null)

  const reload = async (): Promise<Card[]> => {
    const recs = await listPuzzles()
    return Promise.all(
      recs.map(async (rec) => {
        // chỉ đọc metadata + tiến độ + thumbnail; KHÔNG tải puzzle.bin
        const [prog, thumb] = await Promise.all([loadProgress(rec.id), loadThumbnail(rec.id)])
        return {
          rec,
          percent: rec.regionCount ? Math.round(((prog?.filledCount ?? 0) / rec.regionCount) * 100) : 0,
          thumbUrl: thumb ? URL.createObjectURL(thumb) : null,
        }
      }),
    )
  }

  useEffect(() => {
    let alive = true
    let made: string[] = []
    void reload().then((c) => {
      if (!alive) return
      made = c.map((x) => x.thumbUrl).filter((u): u is string => u !== null)
      setCards(c)
    })
    return () => {
      alive = false
      for (const u of made) URL.revokeObjectURL(u)
    }
  }, [])

  const remove = async (id: string): Promise<void> => {
    await deletePuzzle(id)
    setAskDelete(null)
    setCards(await reload())
  }

  if (!cards) return <main style={{ padding: 24 }}>Đang tải…</main>

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Thư viện tranh</h1>
        <Link to="/new">Tạo tranh mới</Link>
      </header>

      {cards.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: '#475569' }}>
          <p>Chưa có tranh nào.</p>
          <Link to="/new">Tạo tranh mới</Link>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {cards.map(({ rec, percent, thumbUrl }) => (
            <li key={rec.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: '#f1f5f9' }}>
                {thumbUrl ? (
                  <img src={thumbUrl} alt={rec.title} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Chưa tô</span>
                )}
              </div>
              <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>{rec.title}</h2>
                <small style={{ color: '#64748b' }}>
                  {rec.regionCount} vùng · {rec.colorCount} màu · {percent}%
                </small>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/play/${rec.id}`} aria-label={`Tô tranh ${rec.title}`}>
                    Tô tranh
                  </Link>
                  <button type="button" onClick={() => setAskDelete(rec.id)}>
                    Xoá
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {askDelete && (
        <div role="dialog" aria-modal="true" aria-label="Xác nhận xoá" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
            <p>Xoá tranh này cùng toàn bộ tiến độ?</p>
            <button type="button" onClick={() => void remove(askDelete)}>
              Xoá tranh
            </button>{' '}
            <button type="button" onClick={() => setAskDelete(null)}>
              Huỷ
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Implement App và main**

`src/App.tsx`:

```tsx
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import LibraryRoute from '@/routes/library'
import NewPuzzleRoute from '@/routes/new'
import PlayRoute from '@/routes/play'

/**
 * Hash router, KHÔNG phải browser router: deploy static không có server
 * rewrite, nên với browser router thì F5 ở /play/abc sẽ ra 404. Hash router
 * chạy được ở mọi kiểu hosting tĩnh.
 */
const router = createHashRouter([
  { path: '/', element: <Navigate to="/library" replace /> },
  { path: '/library', element: <LibraryRoute /> },
  { path: '/new', element: <NewPuzzleRoute /> },
  { path: '/play/:id', element: <PlayRoute /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/index.css` — xoá hết nội dung mẫu của Vite, thay bằng:

```css
:root {
  font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  color: #0f172a;
  background: #ffffff;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button {
  font: inherit;
  padding: 6px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

button:disabled {
  cursor: default;
}

a {
  color: #1d4ed8;
}

input[type="text"],
input:not([type]) {
  font: inherit;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
```

Trong `index.html`, đổi `<title>` thành `Tô màu theo số`. Xoá `src/App.css` và `src/assets/react.svg`.

- [ ] **Step 5: Chạy toàn bộ test + typecheck + build**

Run: `npx vitest run src/ui/__tests__/library.test.tsx` → Expected: 8 passed
Run: `npm test` → Expected: all passed
Run: `npm run typecheck` → Expected: không lỗi
Run: `npm run build` → Expected: build thành công, không lỗi

- [ ] **Step 6: Kiểm tra tay toàn luồng (spec §21 mục 2)**

Run: `npm run dev`, rồi lần lượt:

1. Mở app → thấy thư viện rỗng với gợi ý tạo tranh mới.
2. Bấm "Tạo tranh mới" → kéo một tấm tranh Pokémon có môi trường vào.
3. Thấy progress theo tên bước tiếng Việt, rồi hiện preview line-art + số.
4. Kéo slider "độ chi tiết" và "số màu", bấm "Sinh lại" → preview đổi tương ứng.
5. Thử một ảnh nhiều cỏ/mây → xác nhận cảnh báo "quá vụn" xuất hiện kèm gợi ý.
6. Bấm "Lưu và tô" → vào màn chơi.
7. Chọn màu 1, bấm vào vùng số 1 → vùng được tô, có tiếng.
8. Bấm vào vùng số khác → nháy đỏ, không tô, có tiếng khác.
9. Giữ chuột và rê qua nhiều vùng cùng màu → tô cả vệt.
10. Cuộn con lăn để zoom → **điểm dưới con trỏ không trượt đi**; số vẫn đọc được.
11. Giữ `Space` rồi kéo → tranh di chuyển, không tô nhầm.
12. Bấm phím `3` → palette chuyển sang màu 3.
13. Chỉ dùng bàn phím: mũi tên di chuyển, `Enter` tô, `f` fit, `+`/`-` zoom.
14. Tô xong một màu → nghe arpeggio và palette tự nhảy sang màu còn vùng.
15. Bấm "Xem ảnh gốc" → hiện ảnh; bấm lại → ẩn.
16. Tô hết → banner hoàn thành + fanfare + ảnh gốc.
17. Về thư viện → card hiện thumbnail đúng trạng thái đã tô và 100%.
18. F5 giữa lúc đang tô dở một tranh khác → tiến độ còn nguyên.
19. Bấm "Tô lại từ đầu" → xác nhận → tiến độ về 0.
20. Xoá một tranh → xác nhận → card biến mất, F5 vẫn không thấy lại.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): thư viện tranh, routing hash và app shell

Hoàn tất Plan 1: app chạy được đầy đủ không cần backend.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review của plan này

**1. Spec coverage** — đối chiếu từng mục spec với task:

| Spec | Task | Ghi chú |
|---|---|---|
| §6 Stage 0 chuẩn hoá | T15 `resizeToMaxDim` | box filter, không nearest-neighbour |
| §6 Stage 1 làm phẳng | T4, T5 | median 2 lượt + bilateral |
| §6 Stage 2 quantize Lab deterministic | T3, T6, T7 | median-cut thay k-means++ để bỏ PRNG |
| §6 Stage 3 tách vùng 4-hướng | T8 | stack tường minh |
| §6 Stage 4 gộp vùng vụn | T9, T10 | biên chung dài nhất + ΔE + force-merge |
| §6 Stage 5 đặt số | T11 | distance transform, tránh bẫy centroid |
| §6 Stage 6 vẽ viền | T12 | |
| §6 Stage 7 đóng gói | T13, T14 | RLE + định dạng nhị phân |
| §6 preset + bisection minArea | T2, T15, T24 | bisection chỉ lặp Stage 3→4 |
| §8 engine tô, chặn tô sai | T16 | |
| §8 hit-test O(1), zoom/pan | T18 | zoom giữ điểm bất động |
| §8 kéo để tô | T27 | tách rõ chế độ tô/pan |
| §8 highlight theo màu | T19 | |
| §8 palette bar số vùng còn lại | T26 | màu xong bị disabled |
| §8 xem ảnh gốc | T28 | |
| §8 hoàn thành + ảnh gốc | T28 | |
| §8 tô lại từ đầu | T28 | có xác nhận |
| §8 a11y phím số, mũi tên, Enter, aria-live | T27, T28 | |
| §8 autosave debounce 1.5s | T25 | |
| §8 đếm thời gian hoạt động | T25 | chỉ tính khi tab visible |
| §10 âm thanh WebAudio | T20 | |
| §14 IndexedDB là nguồn sự thật | T22 | |
| §14 hợp nhất OR bitset | T13 | `Bitset.or` — Plan 2 dùng |
| §16 màn `/new`, `/play`, `/library` | T24, T28, T29 | |
| §16 thumbnail cache khi rời màn chơi | T28 | |
| §17 lỗi upload, HEIC, timeout, >2000 vùng | T21, T23, T24 | |
| §18 test bất biến + determinism | T8, T10, T11, T12, T15 | |
| §21 kiểm tra tay | T29 Step 6 | |

**Ngoài phạm vi Plan 1, đã có kế hoạch riêng:** §13 data model + §14 phần đồng bộ Supabase → Plan 2 · §7 vector hoá và in → Plan 3 · §9 editor sửa vùng → Plan 4 · §11 chia sẻ và §12 thống kê → Plan 5.

**2. Placeholder scan** — không có "TBD", "TODO", "tương tự Task N", hay bước nào chỉ nói việc mà không có code. Mọi test đều là code chạy được; mọi hàm được gọi ở task sau đều được định nghĩa ở task trước.

**3. Type consistency** — đã đối chiếu:
- `RegionMeta` có `anchorX/anchorY/anchorR/hasLabel` từ T2, được T8 khởi tạo `-1`/`false`, T11 điền thật.
- `RegionRuns` dùng tên trường `offsets/y/x0/x1` nhất quán ở T2, T12, T19, T27.
- `PaintEngine.remainingByColor(colorCount)` nhận tham số ở mọi chỗ gọi (T25, T26).
- `Puzzle` chứa `runs` và `outline` — chỉ do `assemblePuzzle` (T14) và `runPipeline` (T15) tạo, không nơi nào khác dựng thủ công.
- `PipelineParams.minArea` là `number | 'auto'`; T24 truyền `'auto'` khi sinh, T28 lưu số cụ thể vào `params` để Plan 4 replay được.
- `WorkerLike` (T23) khớp đúng tập phương thức mà T17 dùng.
- `checkQuality` ngưỡng `MAX_GOOD_REGIONS`/`MIN_GOOD_REGIONS` chỉ khai báo một chỗ (T24), test khoá giá trị khớp spec.

---

### Task 30: Median không được bịa màu — snap về màu gốc trong cửa sổ

> **Task bổ sung, chèn ngoài thứ tự.** Phát hiện khi thực thi Task 15 và được chủ dự án phê duyệt sửa gốc. Đánh số 30 để không phải đổi số Task 16–29 (việc đó sẽ làm sai mọi brief và ledger đã sinh).

**Files:**
- Modify: `src/core/filters/median.ts`
- Modify: `src/core/filters/__tests__/median.test.ts`
- Modify: `src/core/__tests__/pipeline.test.ts` — trả `k` của test `'ảnh 4 góc 4 màu → khoảng 4 vùng'` về **4**

**Interfaces:**
- Consumes: `RgbaImage` (Task 2)
- Produces: `median3x3(img: RgbaImage, passes: number): RgbaImage` — chữ ký **không đổi**, chỉ đổi hành vi bên trong

**Vấn đề.** `median3x3` lấy median **từng kênh độc lập** (marginal median). Ở biên hai vùng màu, kênh đỏ có thể lấy từ vùng này còn kênh lục lấy từ vùng kia, nên hàm **sinh ra màu chưa từng tồn tại trong ảnh gốc**. Trên fixture `fourQuadrants` 64×64, việc này tạo 30 màu mới (ví dụ `[218,69,41]`), một trong số đó thắng hẳn một cluster k-means 31 pixel — và hệ quả là xanh lá `[30,200,60]` với vàng `[240,230,40]` bị nhập thành một vùng 2048 pixel màu `[159,217,52]`.

Hai cách bào chữa đã bị chứng minh sai bằng đo đạc: hiện tượng **không** loãng đi khi phóng ảnh (giữ nguyên ở 64/128/256px, vì nó là tính chất cấu trúc của thứ tự chia hộp median-cut chứ không phải nhiễu biên), và Stage 4 **không** dọn được (hai vùng bị nhập đều full-size, và chúng chưa từng được gán nhãn riêng ở Stage 2 nên không có gì để tách).

**Cách sửa.** Sau khi tính median từng kênh cho một pixel, **không xuất trực tiếp giá trị đó**. Thay vào đó, chọn trong 9 màu gốc của cửa sổ 3×3 (lấy từ buffer nguồn của lượt đó) màu nào gần giá trị median nhất, rồi xuất màu đó. Đây là xấp xỉ rẻ của vector median: chỉ 9 phép tính khoảng cách mỗi pixel, so với 36 của vector median thật.

Bảo đảm thu được: output của mỗi lượt chỉ chứa màu đã có trong input của lượt đó ⇒ bắc cầu qua cả 2 lượt, output cuối chỉ chứa màu đã có trong ảnh gốc. Không thể bịa màu.

- [ ] **Step 1: Viết test mới cho bất biến "không bịa màu"**

Thêm vào `src/core/filters/__tests__/median.test.ts`:

```ts
it('KHÔNG BAO GIỜ bịa màu: mọi màu output đều tồn tại trong ảnh input', () => {
  // 4 góc 4 màu + nhiễu xác định — cùng dạng với fixture của pipeline
  const w = 32
  const h = 32
  const colors: [number, number, number][] = [
    [220, 30, 30],
    [30, 200, 60],
    [40, 70, 220],
    [240, 230, 40],
  ]
  const img = solid(w, h, [0, 0, 0])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1)
      const c = colors[q]
      const n = ((x * 7 + y * 13) % 5) - 2
      const i = (y * w + x) * 4
      img.data[i] = c[0] + n
      img.data[i + 1] = c[1] + n
      img.data[i + 2] = c[2] + n
    }
  }

  const inputColors = new Set<string>()
  for (let i = 0; i < w * h; i++) {
    inputColors.add(`${img.data[i * 4]},${img.data[i * 4 + 1]},${img.data[i * 4 + 2]}`)
  }

  const out = median3x3(img, 2)

  const invented: string[] = []
  for (let i = 0; i < w * h; i++) {
    const key = `${out.data[i * 4]},${out.data[i * 4 + 1]},${out.data[i * 4 + 2]}`
    if (!inputColors.has(key)) invented.push(key)
  }

  expect(invented).toEqual([])
})

it('vẫn khử được pixel nhiễu đơn lẻ sau khi snap', () => {
  const img = solid(5, 5, [10, 20, 30])
  const c = (2 * 5 + 2) * 4
  img.data[c] = 250
  img.data[c + 1] = 250
  img.data[c + 2] = 250

  const out = median3x3(img, 1)
  expect(px(out, 2, 2)).toEqual([10, 20, 30])
})
```

- [ ] **Step 2: Chạy test để chắc là test đầu FAIL với code hiện tại**

Run (PowerShell): `npx vitest run src/core/filters/__tests__/median.test.ts`
Expected: test `'KHÔNG BAO GIỜ bịa màu'` FAIL, `invented` là một mảng không rỗng. **Ghi lại danh sách màu bịa thực tế vào report** — đó là bằng chứng defect có thật.

- [ ] **Step 3: Sửa `median3x3`**

Trong vòng lặp pixel, sau khi có `mr`/`mg`/`mb` là median từng kênh, chọn màu gốc gần nhất trong cửa sổ:

```ts
// Median từng kênh có thể sinh ra màu KHÔNG tồn tại trong ảnh (marginal median):
// kênh đỏ lấy từ pixel này, kênh lục lấy từ pixel kia. Ở biên hai vùng màu, màu
// bịa đó có thể thắng hẳn một cluster k-means ở Stage 2 và làm hai màu thật bị
// nhập thành một vùng màu pha — đã đo được trên ảnh 4 màu với k=4.
// Cách chặn: snap về màu GỐC gần nhất trong 9 pixel của cửa sổ. Chỉ 9 phép tính
// khoảng cách mỗi pixel, rẻ hơn nhiều so với vector median thật (36 phép).
let bestIdx = 0
let bestDist = Infinity
for (let k = 0; k < 9; k++) {
  const dr = winR[k] - mr
  const dg = winG[k] - mg
  const db = winB[k] - mb
  const d = dr * dr + dg * dg + db * db
  // `<` chứ không `<=` ⇒ tie luôn về chỉ số cửa sổ nhỏ hơn (deterministic)
  if (d < bestDist) {
    bestDist = d
    bestIdx = k
  }
}
dst[o] = winR[bestIdx]
dst[o + 1] = winG[bestIdx]
dst[o + 2] = winB[bestIdx]
```

Cấu trúc lại vòng lặp để thu ba mảng cửa sổ `winR`/`winG`/`winB` (mỗi mảng 9 phần tử, cấp phát một lần ngoài vòng lặp, **không** cấp phát mỗi pixel) cùng lúc với việc thu buffer để tính median. Khoảng cách dùng bình phương Euclid trong RGB — không cần `sqrt`, và không cần Lab vì 9 màu này vốn đã gần nhau.

Giữ nguyên: chữ ký, tính không sửa input, `passes = 0` trả bản sao, biên kẹp toạ độ, alpha đi qua nguyên vẹn, mỗi lượt đọc từ snapshot ổn định và ghi sang buffer riêng.

- [ ] **Step 4: Chạy lại test median**

Run (PowerShell): `npx vitest run src/core/filters/__tests__/median.test.ts`
Expected: tất cả pass, gồm cả test bịa màu và 5 test cũ (khử nhiễu, vùng phẳng không đổi, giữ cạnh, không sửa input, `passes = 0`).

- [ ] **Step 5: Trả `k` của test pipeline về 4 — đây là tiêu chí nghiệm thu thật**

Trong `src/core/__tests__/pipeline.test.ts`, test `'ảnh 4 góc 4 màu → khoảng 4 vùng'`: đổi `k: 5` về `k: 4`, và xoá đoạn comment giải thích lý do phải dùng 5 (nó không còn đúng nữa). Giữ nguyên `minArea: 40`, `targetRegions: 4` và hai assertion `>= 4`, `<= 8`.

Run (PowerShell): `npx vitest run src/core/__tests__/pipeline.test.ts`
Expected: pass, và số vùng phải là **4** chứ không phải 3. Ghi số vùng thực tế vào report.

- [ ] **Step 6: Toàn bộ suite + typecheck**

Run (PowerShell): `npm test` → Expected: all passed
Run (PowerShell): `npm run typecheck` → Expected: không lỗi

Nếu có test nào khác vỡ vì Stage 1 giờ cho output khác, **báo lại chứ không sửa test đó** — đó là thông tin quan trọng.

- [ ] **Step 7: Commit**

```bash
git add src/core/filters/median.ts src/core/filters/__tests__/median.test.ts src/core/__tests__/pipeline.test.ts
git commit -m "fix(core): median không bịa màu, snap về màu gốc trong cửa sổ

Median từng kênh sinh ra màu không tồn tại trong ảnh gốc ở biên hai vùng.
Màu bịa đó thắng được cả một cluster k-means và làm hai màu thật bị nhập
thành một vùng màu pha. Snap kết quả về màu gốc gần nhất trong cửa sổ 3x3
chặn tận gốc, và trả được test pipeline về k=4.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
