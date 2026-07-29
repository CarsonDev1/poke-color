import { compactField } from '@/core/editor/edit-ops'
import { computeAnchors } from '@/core/regions/label-anchor'
import { mergeUnlabellable } from '@/core/regions/merge-small'
import { buildOutline } from '@/core/regions/outline'
import { buildRegionRuns } from '@/core/regions/region-runs'
import type { Puzzle, RegionField, Rgb } from '@/core/types'

/**
 * Dựng lại TOÀN BỘ metadata + anchor + outline + runs từ `regionMap`.
 *
 * Cố tình tính lại tất cả thay vì cập nhật tăng dần (spec §9): gộp một vùng làm
 * đổi diện tích, bbox, chỗ đặt nhãn, đường viền và pixel-run của nó VÀ của mọi
 * vùng kề. Cập nhật tăng dần cho từng thứ đó là năm cơ hội để trạng thái lệch
 * nhau, và lệch kiểu này chỉ lộ ra rất muộn — lúc in hoặc lúc tô.
 *
 * `recomputeAnchors = false` để bỏ bước gộp-vùng-không-nhãn khi người dùng chỉ
 * đổi màu: đổi màu không làm đổi hình dạng nên gộp thêm là thay đổi ngoài ý muốn.
 */
export function recomputePuzzle(
  field: RegionField,
  palette: readonly Rgb[],
  minLabelRadius: number,
  opts: { mergeUnlabelled?: boolean } = {},
): Puzzle {
  const compact = compactField(field)

  const anchored = opts.mergeUnlabelled
    ? mergeUnlabellable(compact, minLabelRadius)
    : computeAnchors(compact, minLabelRadius)

  const outline = buildOutline(anchored)
  const runs = buildRegionRuns(anchored)

  return {
    width: anchored.width,
    height: anchored.height,
    palette: palette.slice(),
    regionMap: anchored.regionMap,
    regions: anchored.regions,
    runs,
    outline,
  }
}
