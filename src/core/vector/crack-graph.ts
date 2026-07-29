export interface Pt {
  x: number
  y: number
}

export interface Chain {
  /** chuỗi điểm toạ độ LATTICE (góc pixel), gồm cả hai đầu */
  points: Pt[]
  /** chỉ số đỉnh lattice ở hai đầu: y * (width + 1) + x */
  startVertex: number
  endVertex: number
  /** hai vùng hai bên; -1 = ngoài ảnh. LUÔN regionA < regionB */
  regionA: number
  regionB: number
}

/** 0 = ngang (sang phải), 1 = dọc (xuống dưới) */
const DIR_H = 0
const DIR_V = 1

/**
 * Dựng crack graph: biên giữa các vùng thành những chuỗi điểm dùng CHUNG.
 *
 * VÌ SAO KHÔNG trace contour từng vùng (D8): làm vậy thì biên chung của hai
 * vùng kề nhau được sinh HAI LẦN, và khi đơn giản hoá độc lập chúng cho ra hai
 * chuỗi điểm khác nhau — in ra là hở kẽ và nét đè lên nhau. Ở đây mỗi biên
 * chung là MỘT chain duy nhất, đơn giản hoá đúng một lần, cả hai vùng dùng lại
 * chính chuỗi đó.
 *
 * Lattice: đỉnh tại góc pixel, lưới (w+1) × (h+1).
 * Crack ngang (x,y)-(x+1,y) tách pixel (x,y-1) trên và (x,y) dưới.
 * Crack dọc  (x,y)-(x,y+1) tách pixel (x-1,y) trái và (x,y) phải.
 */
export function buildCrackGraph(
  regionMap: Uint32Array,
  width: number,
  height: number,
): Chain[] {
  const W = width + 1 // số đỉnh mỗi hàng
  const H = height + 1

  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? -1 : regionMap[y * width + x]

  // Với mỗi đỉnh, crack ngang đi RA PHẢI và crack dọc đi XUỐNG có tồn tại không.
  // Chỉ cần hai hướng vì crack đi trái/lên chính là crack phải/xuống của đỉnh kề.
  const hasH = new Uint8Array(W * H)
  const hasV = new Uint8Array(W * H)
  // hai vùng hai bên mỗi crack
  const sideH = new Int32Array(W * H * 2)
  const sideV = new Int32Array(W * H * 2)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = y * W + x
      if (x < width) {
        const above = at(x, y - 1)
        const below = at(x, y)
        if (above !== below) {
          hasH[v] = 1
          sideH[v * 2] = above
          sideH[v * 2 + 1] = below
        }
      }
      if (y < height) {
        const left = at(x - 1, y)
        const right = at(x, y)
        if (left !== right) {
          hasV[v] = 1
          sideV[v * 2] = left
          sideV[v * 2 + 1] = right
        }
      }
    }
  }

  /** các crack chạm vào đỉnh v, dạng [đỉnh kề, hướng, đỉnh-sở-hữu-crack] */
  function incident(v: number): Array<[number, number, number]> {
    const x = v % W
    const y = (v - x) / W
    const out: Array<[number, number, number]> = []
    // phải
    if (x < width && hasH[v]) out.push([v + 1, DIR_H, v])
    // trái: crack thuộc đỉnh (x-1, y)
    if (x > 0 && hasH[v - 1]) out.push([v - 1, DIR_H, v - 1])
    // xuống
    if (y < height && hasV[v]) out.push([v + W, DIR_V, v])
    // lên: crack thuộc đỉnh (x, y-1)
    if (y > 0 && hasV[v - W]) out.push([v - W, DIR_V, v - W])
    return out
  }

  const degree = new Uint8Array(W * H)
  for (let v = 0; v < W * H; v++) degree[v] = incident(v).length

  /** crack đã đưa vào chain nào chưa; khoá = đỉnh-sở-hữu * 2 + hướng */
  const visited = new Uint8Array(W * H * 2)
  const mark = (owner: number, dir: number): void => {
    visited[owner * 2 + dir] = 1
  }
  const seen = (owner: number, dir: number): boolean => visited[owner * 2 + dir] === 1

  const sidesOf = (owner: number, dir: number): [number, number] =>
    dir === DIR_H
      ? [sideH[owner * 2], sideH[owner * 2 + 1]]
      : [sideV[owner * 2], sideV[owner * 2 + 1]]

  const toPt = (v: number): Pt => {
    const x = v % W
    return { x, y: (v - x) / W }
  }

  const chains: Chain[] = []

  /** đi từ `from` theo crack đã cho tới khi gặp node (bậc ≠ 2) hoặc quay về chỗ cũ */
  function walk(from: number, first: [number, number, number]): Chain {
    const points: Pt[] = [toPt(from)]
    let cur = from
    let step: [number, number, number] | undefined = first

    for (;;) {
      const [next, dir, owner] = step!
      mark(owner, dir)
      points.push(toPt(next))
      cur = next

      // gặp node ⇒ kết thúc chain. Quay về đúng điểm bắt đầu cũng kết thúc
      // (chu trình cô lập toàn đỉnh bậc 2).
      if (degree[cur] !== 2 || cur === from) break

      // đỉnh bậc 2: đi tiếp qua crack còn lại chưa dùng
      const nexts = incident(cur).filter((c) => !seen(c[2], c[1]))
      if (nexts.length === 0) break
      step = nexts[0]
    }

    const [a, b] = sidesOf(first[2], first[1])
    return {
      points,
      startVertex: from,
      endVertex: cur,
      regionA: Math.min(a, b),
      regionB: Math.max(a, b),
    }
  }

  // Lượt 1: bắt đầu từ mọi NODE. Quét theo chỉ số đỉnh tăng dần ⇒ deterministic.
  for (let v = 0; v < W * H; v++) {
    if (degree[v] === 2 || degree[v] === 0) continue
    for (const c of incident(v)) {
      if (seen(c[2], c[1])) continue
      chains.push(walk(v, c))
    }
  }

  // Lượt 2: chu trình cô lập — thành phần liên thông KHÔNG có node nào, ví dụ
  // một vùng nằm hẳn trong vùng khác. Lượt 1 không bao giờ chạm tới chúng, và
  // bỏ qua thì mọi vùng-trong-vùng biến mất khỏi bản in.
  for (let v = 0; v < W * H; v++) {
    if (degree[v] !== 2) continue
    for (const c of incident(v)) {
      if (seen(c[2], c[1])) continue
      chains.push(walk(v, c))
    }
  }

  return chains
}
