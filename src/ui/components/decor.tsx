import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { DECOR_BG } from '@/ui/decor-manifest'

/**
 * Chọn một phần tử theo `seed` — ỔN ĐỊNH, không random.
 *
 * Dùng seed thay vì `Math.random()` vì background phải giữ nguyên qua mỗi lần
 * re-render: random sẽ đổi ảnh mỗi khi component render lại (đổi state, resize,
 * StrictMode mount kép), tạo ra hiện tượng nền nhấp nháy đổi ảnh liên tục.
 */
function pickStable<T>(list: readonly T[], seed: string): T | null {
  if (list.length === 0) return null
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return list[Math.abs(h) % list.length]
}

/** 5 phút — nhịp đổi ảnh nền */
export const BG_ROTATE_MS = 5 * 60 * 1000

/**
 * Nền anime cho toàn app, TỰ ĐỔI ẢNH mỗi 5 phút.
 *
 * Bản đầu tôi làm mờ `blur-2xl` + `opacity 0.22` + lớp phủ 75–95% — cộng lại thì
 * ảnh gần như vô hình, tức là mất hẳn thứ mà nó tồn tại để làm. Giờ ảnh hiện rõ
 * (opacity 1, chỉ mờ nhẹ) và việc giữ chữ đọc được dồn hết vào MỘT lớp phủ trắng
 * ~62%, cộng thẻ nội dung nền trắng đục hơn.
 *
 * Vẫn còn một chút blur, không phải zero: ảnh nét căng phía sau chữ khiến mắt
 * liên tục bị hút vào chi tiết nền thay vì đọc nội dung. `blur-[2px]` đủ để đẩy
 * nền ra sau mà vẫn nhận ra rõ đó là cảnh gì.
 *
 * Crossfade hai lớp `<img>` khi đổi ảnh — cắt cứng ở nền toàn màn hình rất giật.
 *
 * `aria-hidden` + `pointer-events-none`: thuần trang trí, không lọt vào
 * accessibility tree hay ăn cú click.
 */
export function AmbientBackground({
  seed,
  className,
  rotateMs = BG_ROTATE_MS,
}: {
  seed: string
  className?: string
  rotateMs?: number
}) {
  // Vị trí bắt đầu suy ra từ seed ⇒ mỗi trang mở ra một ảnh khác nhau, nhưng
  // cùng một trang thì luôn khởi đầu bằng cùng ảnh (không nhấp nháy khi render lại).
  const startIndex = useMemo(() => {
    const s = pickStable(DECOR_BG, seed)
    return s ? DECOR_BG.indexOf(s) : 0
  }, [seed])

  const [step, setStep] = useState(0)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setStep(0)
    setBroken(false)
  }, [seed])

  useEffect(() => {
    if (DECOR_BG.length < 2) return          // một ảnh thì không có gì để đổi
    const t = setInterval(() => setStep((s) => s + 1), rotateMs)
    return () => clearInterval(t)
  }, [rotateMs])

  if (broken || DECOR_BG.length === 0) return null
  const src = DECOR_BG[(startIndex + step) % DECOR_BG.length]

  return (
    <div
      aria-hidden
      // print:hidden BAT BUOC: nen gio o goc app nen no nam ngoai khoi `screen-only`
        // cua /print — khong an thi anh nen se in ra giay.
        className={cn(
          'pointer-events-none fixed inset-0 z-0 overflow-hidden print:hidden',
          className,
        )}
    >
      {/*
        `key={src}` để mỗi ảnh là một phần tử RIÊNG — nhờ vậy AnimatePresence
        giữ ảnh cũ lại trong lúc ảnh mới mờ dần hiện lên (crossfade). Nếu chỉ đổi
        `src` trên cùng một <img> thì ảnh nhảy cứng sang ảnh mới.
      */}
      <AnimatePresence initial={false}>
        <motion.img
          key={src}
          src={src}
          alt=""
          onError={() => setBroken(true)}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.8 }, scale: { duration: 12, ease: 'easeOut' } }}
          className="absolute inset-0 h-full w-full object-cover blur-[2px]"
        />
      </AnimatePresence>

      {/*
        Lớp phủ TRẮNG — thứ duy nhất giữ cho chữ đọc được. Không có nó thì tương
        phản phụ thuộc hoàn toàn vào việc ảnh nền lúc đó sáng hay tối.

        ĐẬM Ở TRÊN, NHẠT Ở GIỮA: tiêu đề trang nằm trên cùng và không có thẻ nào
        đỡ phía sau, nên chỗ đó cần nhiều trắng; phần giữa toàn là thẻ nội dung
        (tự đục 90%) nên để nền hiện rõ được.

        Ba con số này chọn bằng ẢNH CHỤP THẬT tu Chrome headless, không đoán:
        62% đều -> nền vô hình; 78% ở trên -> cả vùng header trắng bệch, mà đó
        đúng là phần người dùng nhìn nhiều nhất. Tôi đã làm mất nền ba lần vì ưu
        tiên tương phản quá tay, nên đừng nâng mấy con số này lên mà không chụp lại.
      */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/52 via-white/34 to-white/44" />
    </div>
  )
}
