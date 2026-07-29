# Vector hoá + in A4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xuất tranh tô màu ra SVG và in được trên A4 **không hở kẽ, không chồng nét**.

**Architecture:** Toàn bộ trong `src/core/vector/` — hàm thuần, `regionMap` vào, chuỗi điểm ra. Chạy trong `vectorize.worker.ts` khi vào màn in.

**Điểm cốt tử (D8):** KHÔNG trace contour từng vùng rồi đơn giản hoá độc lập. Hai vùng kề nhau sẽ đơn giản hoá đường biên chung theo hai cách khác nhau ⇒ in ra hở kẽ và chồng nét. Thay vào đó dựng **crack graph**: biên chung là MỘT chuỗi điểm duy nhất, đơn giản hoá đúng MỘT lần, rồi cả hai vùng dùng chung chuỗi đó.

**Tech Stack:** TypeScript thuần · Web Worker · SVG · CSS `@page`

**Spec:** §7 "Vector hoá & in ấn" · D8 · R4 · §18 (test topology) · §21 mục 2

## Global Constraints

- `src/core/vector/` là **core**: không DOM, không `window`, không import từ `ui`/`data`/`render`/`worker`. Vào là `Uint32Array` + tham số, ra là mảng số.
- **Deterministic**: không `Math.random()`, không `Date.now()`, không phụ thuộc thứ tự lặp `Map`/`Set`. Chuỗi điểm phải byte-identical giữa hai lần chạy.
- `erasableSyntaxOnly: true` — không parameter property, không `enum`, không namespace.
- **Chạy test bằng PowerShell**: `vitest` qua Bash tool trên máy này fail giả mọi file.
- Commit tiếng Việt, Conventional Commits, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Tham số theo spec §7: Douglas-Peucker **ε = 0.75px**, Chaikin **1–2 lượt**, stroke-width **0.6**, `fill-rule="evenodd"`.

## File Structure

```
src/core/vector/crack-graph.ts        T1  lattice → node → chain
src/core/vector/simplify.ts           T2  Douglas-Peucker, giữ 2 đầu
src/core/vector/chaikin.ts            T3  Chaikin, giữ 2 đầu
src/core/vector/rings.ts              T4  ghép chain quanh vùng thành ring khép kín
src/core/vector/svg.ts                T5  xuất SVG (bản tô + bản giải + legend)
src/core/vector/vectorize.ts          T5  xâu T1→T5 thành một hàm
src/worker/vectorize.worker.ts        T6  mỏng: postMessage ↔ core
src/data/vectorize-client.ts          T6
src/routes/print.tsx                  T7  preview A4, 1 trang / 2×2, nút in + tải SVG
```

---

### Task 1: Crack graph — lattice, node, chain

**Files:** Create `src/core/vector/crack-graph.ts`, test `src/core/vector/__tests__/crack-graph.test.ts`

**Interfaces:**
- Consumes: `RegionField`-like `{ regionMap: Uint32Array; width: number; height: number }`
- Produces:
  ```ts
  /** chỉ số đỉnh lattice = y * (width + 1) + x */
  export interface Chain {
    /** chuỗi điểm toạ độ LATTICE (góc pixel), gồm cả hai đầu */
    points: Array<{ x: number; y: number }>
    /** đỉnh lattice ở hai đầu */
    startVertex: number
    endVertex: number
    /** hai vùng hai bên; -1 = ngoài ảnh. LUÔN regionA < regionB */
    regionA: number
    regionB: number
  }
  export function buildCrackGraph(
    regionMap: Uint32Array, width: number, height: number,
  ): Chain[]
  ```

**Định nghĩa chính xác:**

- **Lattice**: đỉnh tại góc pixel, lưới `(w+1) × (h+1)`. Đỉnh `(x, y)` với `x ∈ [0, w]`, `y ∈ [0, h]`.
- **Crack ngang** từ `(x, y)` tới `(x+1, y)`: tách pixel `(x, y-1)` phía trên và `(x, y)` phía dưới. Là crack khi hai pixel đó KHÁC vùng (ngoài ảnh coi là `-1`).
- **Crack dọc** từ `(x, y)` tới `(x, y+1)`: tách pixel `(x-1, y)` bên trái và `(x, y)` bên phải.
- **Node**: đỉnh có **bậc ≠ 2**. Dùng bậc thay vì "≥3 vùng gặp nhau" như spec diễn đạt, vì hai cách tương đương mà bậc thì tính trực tiếp và không phải xử lý riêng biên ảnh. Bậc 4 (hai chuỗi cắt nhau kiểu bàn cờ) cũng là node — nhờ vậy tránh hẳn chuyện phải chọn crack nào nối với crack nào, thứ không có đáp án đúng duy nhất.
- **Chain**: chuỗi crack đi từ node tới node, xuyên qua các đỉnh bậc 2.
- **Chu trình cô lập**: nếu một thành phần liên thông KHÔNG có node nào (toàn đỉnh bậc 2 — ví dụ một vùng hình tròn nằm hẳn trong vùng khác), thì chọn đỉnh nhỏ nhất làm điểm khởi đầu và tạo một chain khép kín `startVertex === endVertex`. Không xử lý ca này thì mọi vùng-trong-vùng biến mất khỏi bản in.

- [ ] **Step 1: Viết test**

```ts
import { describe, expect, it } from 'vitest'
import { buildCrackGraph, type Chain } from '@/core/vector/crack-graph'

/** dựng regionMap từ ASCII, mỗi ký tự là một vùng */
function field(rows: string[]) {
  const height = rows.length
  const width = rows[0].length
  const map = new Uint32Array(width * height)
  const seen = new Map<string, number>()
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!seen.has(ch)) seen.set(ch, seen.size)
      map[y * width + x] = seen.get(ch)!
    }
  })
  return { regionMap: map, width, height }
}

const key = (c: Chain) => `${c.regionA}|${c.regionB}`

describe('buildCrackGraph', () => {
  it('một vùng duy nhất ⇒ chỉ có biên với ngoài ảnh', () => {
    const f = field(['aa', 'aa'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) expect(c.regionA).toBe(-1)
  })

  it('hai vùng cạnh nhau ⇒ có ĐÚNG MỘT chain cho biên chung', () => {
    const f = field(['ab', 'ab'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    const shared = chains.filter((c) => c.regionA === 0 && c.regionB === 1)
    expect(shared).toHaveLength(1)
  })

  it('mỗi chain thuộc ĐÚNG hai vùng, và regionA < regionB', () => {
    const f = field(['abc', 'abc', 'abc'])
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      expect(c.regionA).toBeLessThan(c.regionB)
    }
  })

  it('chain có ít nhất 2 điểm và hai đầu khớp startVertex/endVertex', () => {
    const f = field(['ab', 'cd'])
    const W = f.width + 1
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      expect(c.points.length).toBeGreaterThanOrEqual(2)
      const p0 = c.points[0]
      const pN = c.points[c.points.length - 1]
      expect(p0.y * W + p0.x).toBe(c.startVertex)
      expect(pN.y * W + pN.x).toBe(c.endVertex)
    }
  })

  it('mọi điểm nằm trong lattice [0..w] × [0..h]', () => {
    const f = field(['abc', 'dbe', 'fgh'])
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      for (const p of c.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(f.width)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(f.height)
      }
    }
  })

  it('các điểm liên tiếp trong chain luôn kề nhau 1px (không nhảy)', () => {
    const f = field(['aabb', 'aabb', 'ccdd', 'ccdd'])
    for (const c of buildCrackGraph(f.regionMap, f.width, f.height)) {
      for (let i = 1; i < c.points.length; i++) {
        const d =
          Math.abs(c.points[i].x - c.points[i - 1].x) +
          Math.abs(c.points[i].y - c.points[i - 1].y)
        expect(d).toBe(1)
      }
    }
  })

  /** Vùng nằm HẲN trong vùng khác: không có đỉnh bậc ≠ 2 nào quanh nó. */
  it('vùng lọt hẳn trong vùng khác ⇒ vẫn sinh chain khép kín', () => {
    const f = field([
      'aaaaa',
      'aaaaa',
      'aabaa',
      'aaaaa',
      'aaaaa',
    ])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    const inner = chains.filter((c) => c.regionA === 0 && c.regionB === 1)
    expect(inner).toHaveLength(1)
    // khép kín: hai đầu trùng nhau
    expect(inner[0].startVertex).toBe(inner[0].endVertex)
  })

  it('deterministic: chạy hai lần ra kết quả y hệt', () => {
    const f = field(['abc', 'dbe', 'fgh'])
    const a = buildCrackGraph(f.regionMap, f.width, f.height)
    const b = buildCrackGraph(f.regionMap, f.width, f.height)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('không có crack nào bị dùng hai lần (tổng độ dài chain = tổng số crack)', () => {
    const f = field(['abc', 'dbe', 'fgh'])
    const chains = buildCrackGraph(f.regionMap, f.width, f.height)
    const used = new Set<string>()
    let total = 0
    for (const c of chains) {
      for (let i = 1; i < c.points.length; i++) {
        const a = c.points[i - 1]
        const b = c.points[i]
        // khoá crack không phụ thuộc hướng đi
        const k = [a.x, a.y, b.x, b.y].join(',')
        const kr = [b.x, b.y, a.x, a.y].join(',')
        expect(used.has(k) || used.has(kr)).toBe(false)
        used.add(k)
        total++
      }
    }
    expect(used.size).toBe(total)
  })
})
```

- [ ] **Step 2: Chạy để xác nhận RED** — `npx vitest run src/core/vector/__tests__/crack-graph.test.ts`, Expected: không resolve được module.

- [ ] **Step 3: Implement** (xem code trong Task 1 của phần thực thi bên dưới)

- [ ] **Step 4: Chạy test** — Expected: 10 passed.

- [ ] **Step 5: `npm run typecheck` rồi commit.**

---

### Task 2: Douglas-Peucker

**Files:** Create `src/core/vector/simplify.ts`, test cùng thư mục `__tests__`

**Interfaces:** `simplifyChain(points: Pt[], epsilon: number): Pt[]` với `Pt = { x: number; y: number }`

Giữ NGUYÊN hai đầu — đó là điều kiện để hai vùng kề nhau vẫn khớp nhau tại node sau khi đơn giản hoá. Chain khép kín (`points[0]` trùng điểm cuối) cũng phải giữ đúng tính khép kín đó.

Test bắt buộc có:
- đường thẳng 10 điểm, ε=0.75 ⇒ còn đúng 2 điểm
- bậc thang zigzag ±1px ⇒ bị làm phẳng đáng kể
- hai đầu KHÔNG BAO GIỜ bị bỏ, kể cả ε rất lớn
- ε = 0 ⇒ giữ nguyên mọi điểm không thẳng hàng
- ít hơn 3 điểm ⇒ trả nguyên
- chain khép kín vẫn khép kín sau khi đơn giản hoá
- deterministic

### Task 3: Chaikin

**Files:** Create `src/core/vector/chaikin.ts`

**Interfaces:** `chaikin(points: Pt[], iterations: number): Pt[]`

Giữ nguyên hai đầu (spec §7 mục 5). Mỗi lượt thay mỗi đoạn bằng hai điểm ¼ và ¾.

Test: 1 lượt trên 3 điểm cho số điểm đúng · hai đầu bất biến · `iterations = 0` trả nguyên · điểm luôn nằm trong bao lồi của đầu vào (không "phình" ra ngoài) · deterministic.

### Task 4: Ghép ring — ĐÂY LÀ CHỖ QUYẾT ĐỊNH "KHÔNG HỞ KẼ"

**Files:** Create `src/core/vector/rings.ts`

**Interfaces:**
```ts
export interface RegionRings {
  regionId: number
  /** mỗi ring là chuỗi điểm khép kín (điểm đầu === điểm cuối) */
  rings: Pt[][]
}
export function buildRegionRings(chains: Chain[], regionCount: number): RegionRings[]
```

Với mỗi vùng: lấy mọi chain có vùng đó ở một bên, nối theo endpoint thành vòng khép kín. Vùng có lỗ ⇒ nhiều ring, xuất với `fill-rule="evenodd"` nên KHÔNG cần lo chiều xoay.

**Test bắt buộc — đây là property test mà R4 và §18 đòi:**
- mọi ring khép kín: điểm đầu === điểm cuối
- **hai vùng kề nhau dùng CÙNG chuỗi điểm cho biên chung** (so trực tiếp, sau khi đã simplify) — chính là test chống hở kẽ
- mỗi chain được dùng đúng 2 lần trên toàn bộ output (một lần cho mỗi vùng), trừ chain giáp ngoài ảnh dùng 1 lần
- vùng lọt trong vùng khác ⇒ vùng ngoài có 2 ring
- deterministic

### Task 5: Xuất SVG

**Files:** Create `src/core/vector/svg.ts` và `src/core/vector/vectorize.ts`

**Interfaces:**
```ts
export interface SvgOptions {
  width: number; height: number
  palette: readonly Rgb[]
  /** true = bản giải (fill màu), false = bản để tô (stroke đen + số) */
  solution: boolean
}
export function toSvg(rings: RegionRings[], labels: LabelPos[], o: SvgOptions): string
```

Bản để tô: `<path fill="none" stroke="#000" stroke-width=".6">` + `<text>` số tại anchor, nhãn lấy từ `colorLabel(colorIndex)` — **dùng chung hàm với màn chơi**, không tự sinh lại.
Bản giải: `<path>` fill màu palette, không stroke.

Test: SVG hợp lệ (parse được bằng `DOMParser` trong jsdom) · số `<path>` khớp số vùng · bản để tô có `<text>` với nhãn chữ-số đúng · bản giải không có `stroke` · `fill-rule="evenodd"` có mặt khi vùng nhiều ring · escape XML cho text.

### Task 6: Worker + client

**Files:** `src/worker/vectorize.worker.ts`, `src/data/vectorize-client.ts`

Mỏng như `generate.worker.ts`: tách logic ra `handleVectorize(req, post)` để test được không cần Worker thật. Có timeout + terminate mọi đường ra, theo đúng khuôn `generate-client.ts`.

### Task 7: `/print/:id`

**Files:** `src/routes/print.tsx`, thêm route vào `src/App.tsx`

`@page { size: A4; margin: 10mm }`. Mặc định vừa 1 trang; tuỳ chọn 2×2 trang có nhãn trang và mép chồng 4mm. Trang legend: ô màu + nhãn + hex + số vùng mỗi màu. Tuỳ chọn in kèm trang giải. Nút in và nút tải SVG.

## Self-review

**Spec coverage:** §7 mục 1–3 → T1 · mục 4 → T2 · mục 5 → T3 · mục 6 → T4 · mục 7 → T5 · worker → T6 · in A4 + legend + 2×2 → T7 · R4/§18 property test → T4.

**Chưa phủ, ghi rõ:** `/edit` (editor sửa vùng) và `/shared` + `/stats` KHÔNG thuộc plan này.

**Type consistency:** `Pt = { x: number; y: number }` dùng xuyên suốt T1–T5. `Chain` định nghĩa ở T1, T4 tiêu thụ. `colorLabel` lấy từ `@/core/label-alphabet` — không định nghĩa lại nhãn.
