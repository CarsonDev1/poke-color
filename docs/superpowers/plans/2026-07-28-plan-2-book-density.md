# Plan 2 — Độ chi tiết ngang trang sách + nhãn chữ-số 30 ký tự

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa output từ ~300 vùng / 12 màu số-thuần lên ~4500 vùng / 30 màu nhãn chữ-số, ngang mật độ trang sách tham chiếu.

**Architecture:** Không có module mới nào. Đây là (a) một hàm nhãn dùng chung thay cho bốn chỗ tự sinh `+1`, (b) đổi hằng số mặc định và trần tham số, (c) hiệu chỉnh lại ngưỡng cảnh báo, (d) một task đo lường thật để quyết định `maxDim` và timeout thay vì đoán. Thuật toán Stage 0–7 **không đổi một dòng**.

**Tech Stack:** Vite · React · TypeScript · Vitest — đã có sẵn trên `master`.

**Spec:** [§22 của design doc](../specs/2026-07-27-pokemon-color-by-number-design.md)

## Global Constraints

- **Luật phụ thuộc `core/`**: file trong `src/core/` không được import từ `src/ui/`, `src/data/`, `src/render/`, `src/worker/`, và không được chạm `window`, `document`, `Image`, `Canvas`, `fetch`, `crypto`. Whole-branch review của Plan 1 xác nhận 0 vi phạm qua 62 commit — giữ nguyên thành tích đó.
- **Deterministic**: không `Math.random()`, `Date.now()`, `new Date()`, không phụ thuộc thứ tự lặp `Map`/`Set` trong `core/`. Task 15 của Plan 1 có test chạy pipeline hai lần và so byte-identical; nó phải tiếp tục xanh.
- **Bảng nhãn**: `LABEL_ALPHABET = '1234567890abcdefhklmnprstuvxyz'` — đúng 30 ký tự, **bỏ `g i j o q w`** (tránh nhầm `g`↔`9`, `i`↔`1`, `o`↔`0`, `q`↔`9`, `j`↔`i`, `w`↔`vv`).
- **Giá trị mới** (copy nguyên từ spec §22): `maxDim` 2000 · `k` mặc định 24, cho phép 6–30 · `targetRegions` mặc định 4500, cho phép 200–6000 · `smoothing` mặc định **0** · `minLabelRadius` 3 · `MAX_GOOD_REGIONS` 8000 · `MIN_GOOD_REGIONS` 20 (không đổi) · median 3×3 vẫn **2 lượt** (chỉ bilateral hạ về 0).
- **Preset**: Dễ = k 10 / 400 · Vừa = k 16 / 1200 · Khó = k 24 / 3000 · Ngang sách = k 30 / 4500.
- **Ngôn ngữ UI**: tiếng Việt, hardcode.
- `tsconfig.app.json` bật `erasableSyntaxOnly: true` — không dùng constructor parameter property, `enum`, namespace.
- **Chạy test bằng PowerShell**, không dùng Bash tool: `vitest` qua Bash tool trên máy Windows này fail giả mọi file với `Cannot read properties of undefined (reading 'config')`.
- **Commit sau mỗi task**, message tiếng Việt theo Conventional Commits, kèm `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Test output phải sạch — React `act()` warning tính là nhiễu.

## File Structure

```
src/core/label-alphabet.ts          T1  MỚI — bảng nhãn + colorLabel(), thuần, không import
src/core/__tests__/label-alphabet.test.ts   T1
src/render/label-layer.ts           T2  đổi dòng 41: String(colorIndex+1) -> colorLabel()
src/ui/components/palette-bar.tsx   T2  đổi dòng 34 và 56
src/routes/play.tsx                 T2  đổi dòng 165 (thông báo aria-live)
src/core/types.ts                   T3  DEFAULT_PARAMS, PRESETS, PresetName
src/core/__tests__/types.test.ts    T3  test khoá hằng số — PHẢI cập nhật cùng lúc
src/ui/quality-check.ts             T4  MAX_GOOD_REGIONS 2000 -> 8000
src/ui/__tests__/quality-check.test.ts     T4
src/ui/components/tune-panel.tsx    T4  trần slider + radio preset thứ tư
src/ui/__tests__/tune-panel.test.tsx       T4
(không file nào)                     T5  ĐO LƯỜNG — báo số liệu, không sửa code
(tuỳ kết quả T5)                     T6  điều chỉnh theo số đo + kiểm chứng browser
```

`colorLabel` đặt trong `src/core/` chứ không phải `src/render/` vì cả `render/` và `ui/` đều cần nó, và `core/` là tầng duy nhất cả hai được phép import.

---

### Task 1: Bảng nhãn chữ-số và `colorLabel()`

**Files:**
- Create: `src/core/label-alphabet.ts`
- Test: `src/core/__tests__/label-alphabet.test.ts`

**Interfaces:**
- Consumes: không có — module thuần, không import gì
- Produces:
  - `LABEL_ALPHABET: string` — `'1234567890abcdefhklmnprstuvxyz'`, đúng 30 ký tự
  - `MAX_LABELLED_COLORS: number` — `LABEL_ALPHABET.length`
  - `colorLabel(colorIndex: number): string`

**Vì sao bảng này, không phải `String(i+1)`:** legend trang sách tham chiếu chạy `1 2 3 4 5 6 7 8 9 0` rồi `a b c d e f h k l m n p r s t u v x y z`. Nó **cố tình bỏ `g i j o q w`** vì khi in nhỏ `g` lẫn với `9`, `i` với `1`, `o` với `0`, `q` với `9`, `j` với `i`, và `w` đọc như `vv`. Sao chép nguyên quy ước đó.

**Vì sao một hàm dùng chung:** nhãn hiện đang được sinh ở **bốn** chỗ độc lập (`label-layer.ts:41`, `palette-bar.tsx:34`, `palette-bar.tsx:56`, `play.tsx:165`). Nhãn in trên tranh mà lệch nhãn trên nút là lỗi không type checker nào bắt được, và người dùng gặp ngay lần đầu dùng. Whole-branch review của Plan 1 đã nêu đúng rủi ro này.

- [ ] **Step 1: Viết test**

`src/core/__tests__/label-alphabet.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { colorLabel, LABEL_ALPHABET, MAX_LABELLED_COLORS } from '@/core/label-alphabet'

describe('LABEL_ALPHABET', () => {
  it('có đúng 30 ký tự', () => {
    expect(LABEL_ALPHABET).toHaveLength(30)
    expect(MAX_LABELLED_COLORS).toBe(30)
  })

  it('bắt đầu bằng 1..9 rồi 0, khớp legend trang sách', () => {
    expect(LABEL_ALPHABET.slice(0, 10)).toBe('1234567890')
  })

  it('phần chữ bỏ đúng g i j o q w', () => {
    const letters = LABEL_ALPHABET.slice(10)
    expect(letters).toBe('abcdefhklmnprstuvxyz')
    for (const skipped of ['g', 'i', 'j', 'o', 'q', 'w']) {
      expect(letters).not.toContain(skipped)
    }
  })

  it('không có ký tự trùng', () => {
    expect(new Set(LABEL_ALPHABET).size).toBe(LABEL_ALPHABET.length)
  })
})

describe('colorLabel', () => {
  it('colorIndex 0 ra "1" — người dùng đếm từ 1, nội bộ đếm từ 0', () => {
    expect(colorLabel(0)).toBe('1')
  })

  it('colorIndex 9 ra "0", khớp quy ước legend', () => {
    expect(colorLabel(9)).toBe('0')
  })

  it('colorIndex 10 ra "a" — bắt đầu phần chữ', () => {
    expect(colorLabel(10)).toBe('a')
  })

  it('colorIndex 29 ra "z" — ký tự cuối', () => {
    expect(colorLabel(29)).toBe('z')
  })

  it('phủ toàn dải 0..29 không trùng, không rỗng', () => {
    const labels = Array.from({ length: 30 }, (_, i) => colorLabel(i))
    expect(new Set(labels).size).toBe(30)
    for (const l of labels) expect(l).toHaveLength(1)
  })

  it('ngoài phạm vi thì báo lỗi kèm số, không trả rỗng', () => {
    expect(() => colorLabel(30)).toThrow(/30/)
    expect(() => colorLabel(-1)).toThrow(/-1/)
    expect(() => colorLabel(1.5)).toThrow(/1\.5/)
  })
})
```

- [ ] **Step 2: Chạy test để chắc là fail**

Run (PowerShell): `npx vitest run src/core/__tests__/label-alphabet.test.ts`
Expected: FAIL — không resolve được `@/core/label-alphabet`

- [ ] **Step 3: Implement**

`src/core/label-alphabet.ts`:

```ts
/**
 * Bảng nhãn màu, sao chép nguyên quy ước legend của sách tham chiếu:
 * `1 2 3 4 5 6 7 8 9 0` rồi `a b c d e f h k l m n p r s t u v x y z`.
 *
 * CỐ TÌNH bỏ `g i j o q w`. Khi in nhỏ trong một vùng vài chục pixel,
 * `g` lẫn với `9`, `i` với `1`, `o` với `0`, `q` với `9`, `j` với `i`,
 * và `w` đọc thành `vv`. Đừng "hoàn thiện" bảng bằng cách thêm lại chúng.
 *
 * Số 0 nằm ở vị trí thứ 10 (không phải đầu) vì người dùng đếm màu từ 1;
 * `colorLabel(0) === '1'`.
 */
export const LABEL_ALPHABET = '1234567890abcdefhklmnprstuvxyz'

/** Trần số màu mà bảng nhãn phủ được. `k` trong PipelineParams không được vượt. */
export const MAX_LABELLED_COLORS = LABEL_ALPHABET.length

/**
 * Nhãn hiển thị cho một `colorIndex` (0-based nội bộ).
 *
 * PHẢI là nguồn duy nhất sinh nhãn. Nhãn in trên tranh (`drawLabels`) mà lệch
 * nhãn trên nút palette (`PaletteBar`) hay lệch thông báo aria-live là lỗi
 * không type checker nào bắt được và người dùng gặp ngay lần đầu dùng.
 */
export function colorLabel(colorIndex: number): string {
  if (
    !Number.isInteger(colorIndex) ||
    colorIndex < 0 ||
    colorIndex >= LABEL_ALPHABET.length
  ) {
    throw new Error(
      `colorIndex ${colorIndex} ngoài phạm vi bảng nhãn 0..${LABEL_ALPHABET.length - 1}`,
    )
  }
  return LABEL_ALPHABET[colorIndex]
}
```

- [ ] **Step 4: Chạy test**

Run (PowerShell): `npx vitest run src/core/__tests__/label-alphabet.test.ts`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/label-alphabet.ts src/core/__tests__/label-alphabet.test.ts
git commit -m "feat(core): bảng nhãn chữ-số 30 ký tự và colorLabel()

Sao chép quy ước legend sách tham chiếu, bỏ g i j o q w vì lẫn với chữ số
khi in nhỏ. Một hàm duy nhất cho cả bốn chỗ đang tự sinh nhãn.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Bốn chỗ sinh nhãn đi qua `colorLabel`

**Files:**
- Modify: `src/render/label-layer.ts:41`
- Modify: `src/ui/components/palette-bar.tsx:34` và `:56`
- Modify: `src/routes/play.tsx:165`
- Test: `src/render/__tests__/label-layer.test.ts`, `src/ui/__tests__/palette-bar.test.tsx`, `src/ui/__tests__/play.test.tsx` — cập nhật assertion

**Interfaces:**
- Consumes: `colorLabel(colorIndex)` (Task 1)
- Produces: không có API mới

**Bốn chỗ, không phải ba.** Whole-branch review của Plan 1 đếm ba chỗ; nó bỏ sót `play.tsx:165`, nơi sinh thông báo aria-live `Vùng ${regionId}, màu ${region.colorIndex + 1}`. Người dùng đọc màn hình nghe nhãn từ chỗ này, nên nếu nó lệch thì họ được đọc một nhãn không tồn tại trên tranh.

Với `k` mặc định lên 24 (Task 3), ba chỗ trong số này sẽ hiển thị `13`…`24` trong khi tranh in `c`…`n` nếu không sửa — nên Task 2 **phải** xong trước Task 3, không được đảo thứ tự.

- [ ] **Step 1: Sửa test trước, để chúng fail đúng chỗ**

Trong `src/render/__tests__/label-layer.test.ts`, test hiện assert `drawn` chứa `'1'` và `'3'` cho `colorIndex` 0 và 2. Với `colorLabel` thì `colorIndex` 0 → `'1'`, 2 → `'3'` — **không đổi**. Thêm một test mới phủ vùng chữ:

```ts
it('colorIndex >= 10 dùng nhãn chữ, không phải số hai chữ số', () => {
  const ctx = fakeCtx()
  const p = puzzleWithColorIndex(10) // vùng duy nhất, colorIndex 10, hasLabel true
  drawLabels(ctx, p, new PaintEngine(p.regions), V, 200, 200)
  const drawn = ctx.fillText.mock.calls.map((c) => c[0])
  expect(drawn).toContain('a')
  expect(drawn).not.toContain('11')
})
```

Thêm helper `puzzleWithColorIndex(colorIndex: number)` dựng puzzle 4×1 một vùng với palette đủ dài (`colorIndex + 1` màu) và `hasLabel: true`, theo đúng khuôn `puzzle()` đã có trong file.

Trong `src/ui/__tests__/palette-bar.test.tsx`, thêm:

```ts
it('nút thứ 11 trở đi hiện nhãn chữ trong cả text và aria-label', () => {
  const palette: Rgb[] = Array.from({ length: 12 }, (_, i) => [i * 20, 100, 150] as Rgb)
  render(
    <PaletteBar
      palette={palette}
      remaining={new Uint32Array(12).fill(1)}
      selected={null}
      onSelect={vi.fn()}
    />,
  )
  expect(screen.getByRole('radio', { name: /màu a, còn 1 vùng/i })).toBeTruthy()
  expect(screen.getByRole('radio', { name: /màu b, còn 1 vùng/i })).toBeTruthy()
  expect(screen.queryByRole('radio', { name: /màu 11/i })).toBeNull()
})
```

- [ ] **Step 2: Chạy để xác nhận RED**

Run (PowerShell): `npx vitest run src/render/__tests__/label-layer.test.ts src/ui/__tests__/palette-bar.test.tsx`
Expected: FAIL — nhãn hiện ra là `'11'` và `'12'` thay vì `'a'` và `'b'`. Ghi lại output thật.

- [ ] **Step 3: Sửa `label-layer.ts`**

Thay dòng 41:

```ts
// TRƯỚC: const text = String(r.colorIndex + 1)
const text = colorLabel(r.colorIndex)
```

Thêm `import { colorLabel } from '@/core/label-alphabet'`. `src/render/` được phép import `src/core/` — đúng luật phụ thuộc.

- [ ] **Step 4: Sửa `palette-bar.tsx`**

Dòng 34 và 56, dùng một biến chung để hai chỗ không thể lệch:

```ts
const label = colorLabel(i)
// aria-label:
aria-label={done ? `Màu ${label}, đã tô xong` : `Màu ${label}, còn ${left} vùng`}
// text hiển thị:
<span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
```

- [ ] **Step 5: Sửa `play.tsx`**

Dòng 165:

```ts
setLiveMessage(`Vùng ${regionId}, màu ${colorLabel(region.colorIndex)}`)
```

- [ ] **Step 6: Chạy toàn bộ, sửa các assertion còn lệch**

Run (PowerShell): `npm test`

Test nào assert nhãn số cho `colorIndex >= 10` sẽ fail — sửa sang nhãn chữ đúng. **Không** đổi test nào assert `colorIndex` 0–9, vì nhãn của chúng không đổi. Nếu có test fail vì lý do khác nhãn, **dừng và báo** — đó là thông tin, không phải việc cần chữa.

- [ ] **Step 7: `npm run typecheck` và commit**

```bash
git add src/render/label-layer.ts src/ui/components/palette-bar.tsx src/routes/play.tsx src/render/__tests__/label-layer.test.ts src/ui/__tests__/palette-bar.test.tsx src/ui/__tests__/play.test.tsx
git commit -m "refactor(ui): bốn chỗ sinh nhãn màu đi qua colorLabel()

Gồm cả thông báo aria-live ở play.tsx mà review Plan 1 bỏ sót khi đếm
ba chỗ. Nhãn in trên tranh và nhãn trên nút giờ không thể lệch nhau.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Hằng số mặc định và preset mới

**Files:**
- Modify: `src/core/types.ts` — `DEFAULT_PARAMS`, `PRESETS`, `PresetName`
- Test: `src/core/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `MAX_LABELLED_COLORS` (Task 1)
- Produces: `PresetName = 'de' | 'vua' | 'kho' | 'sach'`; `DEFAULT_PARAMS` và `PRESETS` với giá trị mới

**Điều ngược trực giác phải hiểu trước khi sửa:** toàn bộ Stage 1 được thiết kế để **diệt** vùng vụn, vì Plan 1 cho rằng vụn là xấu. Trang sách tham chiếu chứng minh ngược lại — vụn **là** sản phẩm. Nên `smoothing` về **0**: bilateral làm phẳng gradient rất tốt, và đó chính là thứ xoá texture nước/mây/cỏ tạo nên độ chi tiết. Median 3×3 vẫn giữ 2 lượt vì nó diệt noise JPEG mà không phá cạnh, và Task 30 của Plan 1 đã đảm bảo nó không bịa màu.

- [ ] **Step 1: Sửa test khoá hằng số**

`src/core/__tests__/types.test.ts` hiện khoá giá trị cũ. Thay bằng:

```ts
it('khớp giá trị trong spec §22', () => {
  expect(DEFAULT_PARAMS).toEqual({
    maxDim: 2000,
    k: 24,
    minArea: 'auto',
    targetRegions: 4500,
    smoothing: 0,
    mergeDeltaE: 6,
    minLabelRadius: 3,
  })
})

it('có đúng 4 preset khớp spec §22', () => {
  expect(PRESETS).toEqual({
    de: { k: 10, targetRegions: 400 },
    vua: { k: 16, targetRegions: 1200 },
    kho: { k: 24, targetRegions: 3000 },
    sach: { k: 30, targetRegions: 4500 },
  })
})

it('không preset nào vượt trần bảng nhãn', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    expect(p.k, `preset ${name}`).toBeLessThanOrEqual(MAX_LABELLED_COLORS)
  }
  expect(DEFAULT_PARAMS.k).toBeLessThanOrEqual(MAX_LABELLED_COLORS)
})
```

Thêm `import { MAX_LABELLED_COLORS } from '@/core/label-alphabet'`.

Test cuối là thứ ngăn một `k` tương lai vượt 30 rồi làm `colorLabel` throw giữa lúc vẽ.

- [ ] **Step 2: Chạy để xác nhận RED**

Run (PowerShell): `npx vitest run src/core/__tests__/types.test.ts`
Expected: FAIL — nhận `maxDim: 1400`, `k: 12`, ba preset. Ghi output thật.

- [ ] **Step 3: Sửa `types.ts`**

```ts
export const DEFAULT_PARAMS: PipelineParams = {
  maxDim: 2000,
  k: 24,
  minArea: 'auto',
  targetRegions: 4500,
  // 0 lượt bilateral, KHÔNG phải 2 (spec §22): bilateral làm phẳng gradient
  // rất tốt, và đó chính là thứ xoá texture nước/mây/cỏ tạo nên độ chi tiết
  // ngang trang sách. Median 3x3 vẫn 2 lượt — nó diệt noise JPEG mà không
  // phá cạnh và Task 30 của Plan 1 đảm bảo nó không bịa màu.
  smoothing: 0,
  mergeDeltaE: 6,
  // 3px, không phải 7: ở 4500 vùng thì phần lớn vùng nhỏ hơn bán kính 7 và
  // sẽ không có nhãn nào cả.
  minLabelRadius: 3,
}

export type PresetName = 'de' | 'vua' | 'kho' | 'sach'

export const PRESETS: Record<PresetName, Pick<PipelineParams, 'k' | 'targetRegions'>> = {
  de: { k: 10, targetRegions: 400 },
  vua: { k: 16, targetRegions: 1200 },
  kho: { k: 24, targetRegions: 3000 },
  sach: { k: 30, targetRegions: 4500 },
}
```

Cập nhật cả comment trên `PipelineParams.maxDim` / `.k` / `.smoothing` / `.minLabelRadius` nếu chúng ghi dải cũ.

- [ ] **Step 4: Chạy toàn bộ**

Run (PowerShell): `npm test`

Test pipeline của Plan 1 dùng params tường minh nên phần lớn không ảnh hưởng. **Nếu test determinism hoặc test bất biến nào fail, dừng và báo** — nghĩa là đổi mặc định làm lộ một phụ thuộc ẩn, và đó là thông tin quan trọng hơn việc chữa cho xanh.

- [ ] **Step 5: `npm run typecheck` và commit**

```bash
git add src/core/types.ts src/core/__tests__/types.test.ts
git commit -m "feat(core): mặc định mới ngang trang sách, thêm preset thứ tư

maxDim 2000, k 24 (trần 30), targetRegions 4500, smoothing 0,
minLabelRadius 3. smoothing về 0 vì bilateral xoá đúng cái texture
tạo nên độ chi tiết.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ngưỡng cảnh báo và trần slider

**Files:**
- Modify: `src/ui/quality-check.ts` — `MAX_GOOD_REGIONS`
- Modify: `src/ui/components/tune-panel.tsx` — trần slider, radio preset thứ tư
- Test: `src/ui/__tests__/quality-check.test.ts`, `src/ui/__tests__/tune-panel.test.tsx`

**Interfaces:**
- Consumes: `PRESETS`, `PresetName` (Task 3), `MAX_LABELLED_COLORS` (Task 1)
- Produces: không có API mới; `TuneValue.preset` giờ nhận thêm `'sach'`

**Ngưỡng cũ giờ sai hẳn.** `MAX_GOOD_REGIONS = 2000` từng nghĩa "quá vụn để tô". Ở chế độ mới, 2000 là **dưới** mặc định 4500 — nếu để nguyên thì mọi puzzle sinh ở mặc định đều bị app tự cảnh báo là lỗi. Nâng lên 8000.

- [ ] **Step 1: Sửa test ngưỡng**

`src/ui/__tests__/quality-check.test.ts`:

```ts
it('ngưỡng khớp spec §22', () => {
  expect(MAX_GOOD_REGIONS).toBe(8000)
  expect(MIN_GOOD_REGIONS).toBe(20)
})

it('4500 vùng — đúng mặc định mới — là ok, không cảnh báo', () => {
  expect(checkQuality(4500).level).toBe('ok')
})

it('vẫn cảnh báo khi thật sự quá vụn', () => {
  expect(checkQuality(8001).level).toBe('qua-vun')
})
```

Sửa các test biên cũ dùng `2000` sang `8000`.

- [ ] **Step 2: Sửa test TunePanel**

```ts
it('hiện đủ 4 preset gồm Ngang sách', () => {
  render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
  expect(screen.getByRole('radio', { name: /dễ/i })).toBeTruthy()
  expect(screen.getByRole('radio', { name: /vừa/i })).toBeTruthy()
  expect(screen.getByRole('radio', { name: /khó/i })).toBeTruthy()
  expect(screen.getByRole('radio', { name: /ngang sách/i })).toBeTruthy()
})

it('chọn Ngang sách áp k 30 và 4500 vùng', async () => {
  const onChange = vi.fn()
  render(<TunePanel value={value} onChange={onChange} disabled={false} />)
  await userEvent.click(screen.getByRole('radio', { name: /ngang sách/i }))
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ preset: 'sach', k: 30, targetRegions: 4500 }),
  )
})

it('trần slider khớp spec §22', () => {
  render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
  const mau = screen.getByLabelText(/số màu/i)
  expect(mau.getAttribute('min')).toBe('6')
  expect(mau.getAttribute('max')).toBe('30')
  const chiTiet = screen.getByLabelText(/độ chi tiết/i)
  expect(chiTiet.getAttribute('min')).toBe('200')
  expect(chiTiet.getAttribute('max')).toBe('6000')
})

it('trần số màu không vượt bảng nhãn', () => {
  render(<TunePanel value={value} onChange={vi.fn()} disabled={false} />)
  const max = Number(screen.getByLabelText(/số màu/i).getAttribute('max'))
  expect(max).toBeLessThanOrEqual(MAX_LABELLED_COLORS)
})
```

- [ ] **Step 3: Chạy để xác nhận RED**

Run (PowerShell): `npx vitest run src/ui/__tests__/quality-check.test.ts src/ui/__tests__/tune-panel.test.tsx`
Expected: FAIL — ngưỡng còn 2000, chỉ có 3 preset, trần slider còn 24/2000.

- [ ] **Step 4: Sửa `quality-check.ts`**

```ts
/**
 * Ngưỡng theo spec §22, KHÔNG phải §17. Bản gốc đặt 2000 vì cho rằng vùng
 * vụn là lỗi; trang sách tham chiếu chứng minh ngược lại — 4500 vùng là
 * MỤC TIÊU. Để 2000 thì mọi puzzle sinh ở mặc định đều bị app tự tố là lỗi.
 */
export const MAX_GOOD_REGIONS = 8000
export const MIN_GOOD_REGIONS = 20
```

- [ ] **Step 5: Sửa `tune-panel.tsx`**

Thêm `sach: 'Ngang sách'` vào `PRESET_LABELS`, và đổi trần:

```ts
// slider số màu
min={6}
max={MAX_LABELLED_COLORS}
// slider độ chi tiết
min={200}
max={6000}
step={100}
```

Import `MAX_LABELLED_COLORS` từ `@/core/label-alphabet` — dùng hằng số thay số 30 viết cứng, để trần slider không thể lệch khỏi bảng nhãn.

Với 4 preset, kiểm layout: nhãn `(30 màu · ~4500 vùng)` dài hơn trước, và Plan 1 đã ghi lỗi gãy dòng ở đây (browser finding C). Nếu 4 nút không vừa một dòng, cho container `flex-wrap: wrap` và `gap` — đừng viết tắt nhãn.

- [ ] **Step 6: Chạy toàn bộ + typecheck, rồi commit**

Run (PowerShell): `npm test` rồi `npm run typecheck`

```bash
git add src/ui/quality-check.ts src/ui/components/tune-panel.tsx src/ui/__tests__/quality-check.test.ts src/ui/__tests__/tune-panel.test.tsx
git commit -m "feat(ui): ngưỡng cảnh báo 8000 và trần slider theo spec §22

2000 từng nghĩa quá vụn; giờ nó dưới mặc định 4500 nên mọi puzzle mặc
định sẽ bị tự tố là lỗi. Trần số màu lấy từ MAX_LABELLED_COLORS để không
lệch khỏi bảng nhãn.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ĐO LƯỜNG — pipeline ở mặc định mới trên ảnh thật

**Files:** không sửa file nào. Task này **báo số liệu**.

**Interfaces:**
- Consumes: mọi thứ từ Task 1–4
- Produces: một báo cáo số liệu để quyết định Task 6

**Vì sao đo chứ không đoán.** `maxDim` 2000 là ~2× số pixel của 1400, và bisection chạy lại Stage 3→4 tới 6 lần. Timeout hiện tại là **60 giây** và spec §22 ghi rõ *"có thể phải nâng — phải đo, không đoán"*. Ngoài ra `minLabelRadius` 3 làm số nhãn được vẽ tăng vọt, và `drawLabels` gọi `strokeText` + `fillText` cho từng nhãn mỗi frame — ở 4500 vùng đó là ~9000 lệnh vẽ text mỗi lần redraw. Cả hai là rủi ro hiệu năng thật, và không unit test nào đo được.

- [ ] **Step 1: Dựng một ảnh test có texture thật**

Ảnh phẳng tổng hợp không đo được gì có ý nghĩa — nó cho bậc thang thô như Plan 1 đã phát hiện. Cần ảnh có texture. Dùng PowerShell + `System.Drawing` dựng một khung cảnh 1600×1200 gồm: trời gradient, dải núi nhiều tầng xám khác nhau, mặt nước có sóng (nhiều dải ngang mảnh màu gần nhau), và một hình sinh vật với vài chi tiết nhỏ. Lưu vào `.superpowers/measure-scene.png` (đã gitignore).

Nếu bạn có ảnh Pokémon thật nào trong máy thì tốt hơn — nhưng **không** commit nó.

- [ ] **Step 2: Đo bằng một script Node dùng chính pipeline**

Viết một script tạm **ngoài repo** (thư mục temp), import `runPipeline` từ source đã build hoặc qua `vite-node`, decode ảnh bằng `sharp` nếu có sẵn hoặc bằng cách đọc RGBA thô mà bạn tự dựng. Nếu không dựng được đường decode ngoài browser, **đo trong browser** thay thế: `npm run dev`, mở `#/new`, upload ảnh, và đọc số từ UI cộng `performance.now()` trong console.

Đo và ghi lại, cho **cả bốn preset**:

| Preset | Số vùng thực tế | `usedMinArea` | Thời gian tổng | Vùng có nhãn / tổng |
|---|---|---|---|---|

- [ ] **Step 3: Đo riêng thời gian một frame vẽ nhãn**

Ở preset Ngang sách, sau khi puzzle load xong, đo thời gian một lần `drawLabels` đầy đủ (bọc `performance.now()` quanh nó, hoặc dùng Performance panel). Ghi lại con số.

Ngưỡng cần đạt: một frame phải dưới **16 ms** để zoom/pan còn mượt 60fps. Nếu vượt, ghi rõ vượt bao nhiêu.

- [ ] **Step 4: Báo cáo, KHÔNG tự sửa**

Viết vào report:
- Bảng bốn preset ở trên
- Thời gian một frame `drawLabels` ở preset Ngang sách
- Thời gian sinh puzzle có vượt 60s ở preset nào không
- Ảnh chụp preview ở preset Ngang sách để so mắt với trang sách tham chiếu
- **Kết luận rõ ràng**: cần nâng timeout không, cần hạ `maxDim` không, `drawLabels` có cần tối ưu không

**Dừng ở đây và báo.** Task 6 phụ thuộc số liệu này. Không tự ý sửa hằng số dựa trên cảm giác.

---

### Task 6: Điều chỉnh theo số đo + kiểm chứng browser

**Files:** tuỳ kết luận Task 5. Ứng viên: `src/data/generate-client.ts` (`PIPELINE_TIMEOUT_MS`), `src/core/types.ts` (`maxDim`), `src/render/label-layer.ts` (tối ưu vẽ nhãn).

**Interfaces:**
- Consumes: số liệu Task 5
- Produces: mặc định đã hiệu chỉnh bằng đo lường

- [ ] **Step 1: Áp điều chỉnh Task 5 kết luận**

Chỉ sửa những gì số liệu đòi. Nếu Task 5 kết luận không cần gì, nói vậy và bỏ qua sang Step 2.

Nếu cần nâng timeout: sửa `PIPELINE_TIMEOUT_MS` và **cập nhật cả thông báo timeout**, vì nó hiện nói "hơn 60 giây".

Nếu `drawLabels` vượt 16ms/frame: cách tối ưu ít rủi ro nhất là bỏ `strokeText` (viền trắng quanh chữ) khi số nhãn trong viewport vượt một ngưỡng — nó tốn gấp đôi và chỉ cần khi chữ nằm trên nền tối. Đừng viết lại thuật toán vẽ.

- [ ] **Step 2: Chạy toàn bộ + typecheck + build**

Run (PowerShell): `npm test`, `npm run typecheck`, `npm run build` — cả ba phải sạch.

- [ ] **Step 3: Kiểm chứng browser thật, so mắt với trang sách**

`npm run dev`, rồi:

1. Upload ảnh test, chọn preset **Ngang sách**
2. Xác nhận preview có mật độ vùng gần trang sách tham chiếu — không phải vài trăm vùng lớn
3. Xác nhận nhãn hiển thị là **chữ-số** (`a`, `b`, `c`… xuất hiện, không có `13`, `24`)
4. Xác nhận legend palette có 30 nút với nhãn khớp nhãn trên tranh
5. Lưu, vào màn chơi, tô vài vùng — xác nhận highlight-theo-màu tìm được vùng nhỏ
6. Zoom sâu — xác nhận nhãn vẫn đọc được và không giật
7. Về thư viện — xác nhận thumbnail có viền, không trắng trơn
8. Vào lại — xác nhận tiến độ còn (đây là bug C1 của Plan 1, đừng để nó quay lại)

Chụp ảnh preview và đính vào report.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: hiệu chỉnh mặc định theo số đo thật trên ảnh có texture

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review của plan này

**1. Spec coverage** — §22 đối chiếu từng mục:

| §22 yêu cầu | Task |
|---|---|
| Bảng nhãn 30 ký tự, bỏ `g i j o q w` | T1 |
| Một hàm dùng chung cho mọi chỗ sinh nhãn | T1 + T2 (bốn chỗ, không ba) |
| `maxDim` 2000 | T3, có thể điều chỉnh ở T6 |
| `k` 6–30, mặc định 24 | T3 (mặc định) + T4 (trần slider) |
| `targetRegions` 200–6000, mặc định 4500 | T3 + T4 |
| `smoothing` mặc định 0 | T3 |
| `minLabelRadius` 3 | T3 |
| `MAX_GOOD_REGIONS` 8000 | T4 |
| Preset thứ tư "Ngang sách" 30/4500 | T3 + T4 |
| "Pipeline chậm hơn — phải đo, không đoán" | T5 + T6 |
| Hệ quả: điện thoại phải zoom nhiều | T6 Step 3 mục 6 kiểm zoom |

Không mục nào của §22 thiếu task. Median giữ 2 lượt — đúng spec, không cần task.

**2. Placeholder scan** — không có "TBD"/"TODO"/"tương tự Task N". T5 và T6 cố tình không có code cứng vì chúng là task đo-rồi-quyết; tiêu chí chấp nhận của chúng là số liệu cụ thể (60s, 16ms) chứ không phải cảm giác.

**3. Type consistency** — `colorLabel(colorIndex: number): string` và `MAX_LABELLED_COLORS: number` dùng thống nhất ở T1–T4. `PresetName` thêm `'sach'` ở T3 và `TuneValue.preset` ở T4 nhận nó qua chính `PresetName` nên không thể lệch. `MAX_GOOD_REGIONS`/`MIN_GOOD_REGIONS` giữ nguyên tên.

**Một điểm thứ tự bắt buộc:** T2 phải xong trước T3. Đảo lại thì `k` lên 24 trong khi bốn chỗ vẫn sinh `+1`, và tranh sẽ in `c`…`n` trong khi nút hiện `13`…`24`.

---

## Kết quả ĐO của Task 5 (số liệu thật, không phải dự đoán)

Khung cảnh tổng hợp có texture, 1600×1200, `k=30`, chạy trên máy dev.

**Chi phí từng stage** — `maxDim` 2000, k=30:

| stage | ms | % |
|---|---|---|
| resize | 3 | ~0 |
| median3x3 ×2 | 7690 | 44% |
| quantize k=30 | 9059 | 52% |
| labelRegions | 88 | 0.5% |
| mergeSmall | 219 | 1% |
| computeAnchors | 199 | 1% |

**Bốn preset:**

```
de    k=10 target= 400 => vung=  122 mau=10 minArea= 300 nhan=  65(53%)  9061ms
vua   k=16 target=1200 => vung=  262 mau=16 minArea= 100 nhan= 104(40%)  9770ms
kho   k=24 target=3000 => vung= 5137 mau=24 minArea=   1 nhan= 255( 5%) 10617ms
sach  k=30 target=4500 => vung= 7282 mau=30 minArea=   1 nhan= 652( 9%) 12395ms
DEFAULT (2600x1950 -> 2000x1500): vung=1756 minArea=41 nhan=206  19687ms
```

**Đường cong minArea → số vùng** (minArea tường minh, không bisection):

```
minArea  vung   co-nhan  %nhan
      1  7282      652      9%
      2  5712      652     11%
      3  4595      652     14%
      4  4324      653     15%
      8  3118      653     21%
     16  2141      656     31%
     41  1258      648     52%
     64   523      143     27%
```

**Phân bố anchorR ở minArea=3 (4595 vùng):** anchorR 1 → 2220 vùng · 2 → 898 · 3 → 41 · 4 → 412 · 5–8 → 14 · ≥9 → 56.

**smoothing:** `0 → 7282 vùng` · `2 → 458 vùng`. Bilateral xoá **94%** độ chi tiết — giả thuyết của §22 được chứng minh bằng số.

### Ba phát hiện, hai trong đó là defect chặn

**D1 — bisection không tìm nổi target (chặn).** `targetRegions` 4500 LÀ đạt được: minArea=3 cho 4595 vùng. Nhưng `BISECTION_MAX_ITERS = 6` là tìm nhị phân trên dải vài nghìn — không thể hội tụ. Nó trả 7282 (sach) và 1756 (default). Slider "độ chi tiết" nói dối người dùng ở cả hai đầu.

**D2 — 86% vùng không có số (chặn).** Ở 4595 vùng chỉ 652 vùng có nhãn. Nguyên nhân KHÔNG phải vùng nhỏ mà là vùng **mỏng**: sliver 1×40px có area 40 nên sống sót mọi `minArea`, nhưng không chứa nổi một ký tự, không hiện được màu đã tô, và không bấm được trên điện thoại. Quét `minArea` 1→41 không bao giờ đưa tỉ lệ nhãn quá 52%, và giá phải trả là mất 3300 vùng. **`minArea` là đòn sai: nó lọc theo DIỆN TÍCH trong khi thứ quyết định vùng dùng được là BÁN KÍNH TRONG.** Vùng trong trang sách đều đặn nên vùng nào cũng có số.

**D3 — thời gian (cần theo dõi).** 19.7s ở 2000×1500 trên máy dev, và 96% chi phí nằm ở median + quantize. Timeout 60s là mỏng cho điện thoại (3× chậm ⇒ ~60s+).

### Task 7: điều kiện độ dày trong mergeSmallRegions

**Files:** `src/core/regions/merge-small.ts`, test `src/core/__tests__/merge-small.test.ts`

Điều kiện CẦN, rẻ, dùng dữ liệu đã có sẵn (area + bbox tính trong `rebuild`): vùng chứa được đường tròn bán kính r thì cả hai chiều bbox phải ≥ 2r. Thêm tham số `minThickness`, mặc định 0 để không đổi hành vi cũ:

```ts
const tooSmall = (r: RegionMeta): boolean =>
  r.area < minArea ||
  Math.min(r.maxX - r.minX + 1, r.maxY - r.minY + 1) < minThickness
```

Dùng CHUNG một predicate cho cả ba vòng (pass, force-merge) — hiện mỗi vòng tự viết lại `r.area < minArea`, và để chúng lệch nhau là cách chắc chắn sinh vòng lặp vô tận.

Chi phí: **0ms**. Không gọi distance transform.

### Task 8: mop-up chính xác sau bisection

**Files:** `src/core/regions/merge-small.ts` (hàm mới `mergeUnlabellable`), `src/core/pipeline.ts`

Điều kiện bbox ở Task 7 là CẦN chứ không ĐỦ — vùng hình chữ C có bbox to mà bán kính trong vẫn nhỏ. Sau khi bisection hội tụ, chạy tối đa 3 lượt: `computeAnchors` → gộp mọi vùng `!hasLabel` vào láng giềng biên dài nhất → rebuild. Đặt NGOÀI bisection vì mỗi lượt tốn ~420ms; trong bisection 20 vòng sẽ là 34s.

### Task 9: ngân sách bisection và timeout

**Files:** `src/core/pipeline.ts`, `src/data/generate-client.ts`

`BISECTION_MAX_ITERS` 6 → 20. Mỗi vòng chỉ ~300ms (labelRegions 88 + mergeSmall 219) nên +14 vòng ≈ +4.2s — rẻ so với 17s của median+quantize. `PIPELINE_TIMEOUT_MS` 60_000 → 180_000 và sửa cả câu thông báo đang nói "60 giây".

### Kết quả sau khi sửa (Task 7–9) — kiểm trên HAI loại ảnh

Giả thuyết "tranh minh hoạ cho nhiều vùng đều đặn hơn ảnh chụp" là chỗ dựa của
quyết định `minLabelRadius=2`, nên đã kiểm bằng fixture riêng chứ không tin suông.

| preset | target | ảnh kiểu CHỤP | tranh MINH HOẠ | có nhãn |
|---|---|---|---|---|
| de | 400 | 112 | **301** | 100% |
| vua | 1200 | 263 | **1342** | 100% |
| kho | 3000 | 268 | **2640** | 100% |
| sach | 4500 | 661 | **2640** | 100% |

Ba điều được chứng minh:

1. **100% vùng có nhãn** trên tranh minh hoạ — D2 đã sửa xong (trước: 9%).
2. **Bisection đã bắt được target**: 301/400, 1342/1200, 2640/3000. Trước khi
   nâng `BISECTION_MAX_ITERS` thì lệch 60–80%.
3. `sach` chạm trần 2640 vì ẢNH hết chi tiết, không phải vì lỗi. Số vùng phụ
   thuộc nội dung ảnh; `quality-check` không báo động vì 2640 nằm trong
   [20, 8000] — đúng.

Tranh minh hoạ còn nhanh gấp 4 (5s so với 20s): ít màu phân biệt hơn nên k-means
hội tụ sớm hơn.

### Hai defect PHÁT SINH trong lúc sửa, cả hai do đo mới lộ ra

- **Nối chuỗi union-find.** Gộp vùng-mỏng-vào-vùng-mỏng nối A→B→C ngay trong một
  lượt. Giả thuyết ban đầu của tôi cho rằng đây là nguyên nhân chính làm số vùng
  tụt 7282→672; đo lại sau khi sửa cho 661 — **giả thuyết SAI**, nguyên nhân
  chính là bản thân ngưỡng độ dày. Bản sửa vẫn giữ vì nó đúng và gần như miễn phí.
- **Force-merge O(n) lần rebuild toàn ảnh.** Bản gốc `break` sau mỗi lần gộp để
  tránh nối chuỗi — chấp nhận được khi chỉ vài vùng lọt tới đó theo điều kiện
  area, nhưng với điều kiện độ dày thì hàng trăm vùng lọt tới và mỗi vòng là một
  `buildAdjacency` + `rebuild` quét trọn ~1.9M pixel: **đo được 144s** cho một
  lần sinh. Thay bằng ghép từng cặp rời nhau (`touched`) — nhiều cặp mỗi lượt mà
  đường gộp vẫn dài tối đa 2.
