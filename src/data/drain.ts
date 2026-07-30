import {
  dequeueOutbox,
  listOutbox,
  listPuzzles,
  loadBlobs,
  loadPuzzleRecord,
} from '@/data/local-cache'
import { syncProgress } from '@/data/progress-repo'
import {
  deleteRemotePuzzle,
  listRemotePuzzles,
  pullPuzzle,
  uploadPuzzle,
} from '@/data/puzzle-repo'

/**
 * File riêng, KHÔNG nhập vào `sync.ts`, để tránh vòng import: `progress-repo`
 * đã import `sync.ts` cho `mergeProgress`, nên nếu `sync.ts` import lại
 * `progress-repo` thì thành vòng.
 */

export interface DrainOutcome {
  /** số việc đẩy xong */
  done: number
  /** số việc còn lại (thất bại, sẽ thử lại lần sau) */
  remaining: number
  /**
   * Số việc bị BỎ vì không bao giờ làm được nữa — puzzle đã không còn trong máy
   * nên không có gì để đẩy lên. Trước đây những mục này bị `continue` mà KHÔNG
   * dequeue, nên chúng nằm lại vĩnh viễn: banner "chưa đồng bộ · 1" không bao giờ
   * tắt và bấm "Đồng bộ ngay" bao nhiêu lần cũng vô ích.
   */
  dropped: number
}

/**
 * Đẩy hết việc đang chờ lên Supabase.
 *
 * Puzzle đi TRƯỚC progress: `progress.puzzle_id` có khoá ngoại tới `puzzles`,
 * nên đẩy tiến độ của một puzzle chưa tồn tại trên server sẽ lỗi khoá ngoại và
 * mãi không bao giờ thành công.
 *
 * Việc nào lỗi thì để nguyên trong outbox — repo tự quyết định dequeue hay
 * không, ở đây chỉ đếm.
 */
export async function drainOutbox(userId: string): Promise<DrainOutcome> {
  const items = await listOutbox()
  if (items.length === 0) return { done: 0, remaining: 0, dropped: 0 }

  // Thứ tự: 'delete' → 'puzzle' → 'progress'.
  //
  //  - 'delete' trước tiên: nếu để sau, một mục 'puzzle' còn sót có thể ĐẨY LẠI
  //    puzzle vừa xoá lên server, rồi 'delete' xoá đi — hoặc tệ hơn, đúng thứ tự
  //    ngược lại thì puzzle sống lại.
  //  - 'puzzle' trước 'progress': `progress.puzzle_id` có khoá ngoại tới
  //    `puzzles`, đẩy tiến độ của puzzle chưa tồn tại là lỗi khoá ngoại và không
  //    bao giờ tự khỏi.
  const RANK = { delete: 0, puzzle: 1, progress: 2 } as const
  const ordered = [...items].sort(
    (a, b) => RANK[a.kind] - RANK[b.kind] || a.queuedAt - b.queuedAt,
  )

  let done = 0
  let dropped = 0

  for (const item of ordered) {
    try {
      if (item.kind === 'delete') {
        // Xoá thì THỬ LẠI mãi, không bỏ: mất mạng không phải lý do để quên ý
        // định xoá của người dùng.
        if (await deleteRemotePuzzle(item.puzzleId, userId)) {
          await dequeueOutbox('delete', item.puzzleId)
          done++
        }
        continue
      }

      /*
        Puzzle KHÔNG CÒN trong máy ⇒ mục này KHÔNG BAO GIỜ đẩy được, phải BỎ.

        Trước đây chỗ này `continue` mà không dequeue, nên mục nằm lại vĩnh viễn:
        `pending` không bao giờ về 0, banner "chưa đồng bộ · N" luôn hiện, và bấm
        "Đồng bộ ngay" bao nhiêu lần cũng không đổi gì — đúng lỗi đã gặp.

        Bỏ là đúng chứ không phải mất dữ liệu: dữ liệu nguồn đã không còn, nên
        không có gì để đẩy lên. Việc xoá trên server (nếu cần) là một mục 'delete'
        riêng, không liên quan tới mục này.
      */
      const rec = await loadPuzzleRecord(item.puzzleId)
      if (!rec) {
        await dequeueOutbox(item.kind, item.puzzleId)
        dropped++
        continue
      }

      if (item.kind === 'puzzle') {
        // Thiếu blob thì cũng không đẩy được — cùng lý do như trên.
        if (!(await loadBlobs(item.puzzleId))) {
          await dequeueOutbox('puzzle', item.puzzleId)
          dropped++
          continue
        }
        const r = await uploadPuzzle(item.puzzleId, userId)
        if (r.ok) done++
      } else {
        await syncProgress(item.puzzleId, userId, rec.regionCount)
        done++
      }
    } catch {
      // giữ trong outbox, thử lại lần sau
    }
  }

  const left = await listOutbox()
  return { done, remaining: left.length, dropped }
}

export interface PullOutcome {
  /** số puzzle MỚI tải từ server về máy này */
  pulled: number
  /** số puzzle đã hợp nhất lại tiến độ */
  merged: number
}

/**
 * KÉO VỀ: tải puzzle có trên server mà máy này chưa có, và hợp nhất tiến độ của
 * những puzzle đã có.
 *
 * Đây là nửa còn thiếu của "đồng bộ". Trước đó app chỉ đẩy lên, nên mở ở browser
 * khác hay điện thoại thì IndexedDB rỗng và thư viện trống trơn dù server có đủ
 * dữ liệu — đúng thứ người dùng gặp.
 *
 * Hai việc, không phải một:
 *  - puzzle THIẾU  ⇒ `pullPuzzle` tải 3 tệp + metadata về
 *  - puzzle ĐÃ CÓ ⇒ `syncProgress` hợp nhất bitset hai chiều (OR), để "tô dở
 *    trên máy tính, tô tiếp trên điện thoại" thật sự hoạt động
 *
 * Không ném ra ngoài: mất mạng thì trả về số 0 và app vẫn chạy với dữ liệu cục bộ.
 */
export async function pullDown(userId: string): Promise<PullOutcome> {
  let pulled = 0
  let merged = 0

  try {
    const [remote, local, outbox] = await Promise.all([
      listRemotePuzzles(userId),
      listPuzzles(),
      listOutbox(),
    ])
    const localIds = new Set(local.map((p) => p.id))
    /**
     * Id đang CHỜ XOÁ. Bỏ qua chúng là bắt buộc: nếu lệnh xoá chưa đẩy được lên
     * server (mất mạng), server vẫn còn puzzle đó và nếu kéo về thì puzzle vừa
     * xoá sẽ SỐNG LẠI ngay trước mắt người dùng.
     */
    const pendingDelete = new Set(
      outbox.filter((o) => o.kind === 'delete').map((o) => o.puzzleId),
    )

    for (const r of remote) {
      if (pendingDelete.has(r.id)) continue
      try {
        if (!localIds.has(r.id)) {
          if (await pullPuzzle(r, userId)) {
            pulled++
            // vừa tải xong thì kéo luôn tiến độ, nếu không người dùng thấy 0%
            // trên một bức đã tô dở ở máy khác
            await syncProgress(r.id, userId, r.regionCount)
          }
          continue
        }
        await syncProgress(r.id, userId, r.regionCount)
        merged++
      } catch {
        // một puzzle lỗi không được chặn những cái còn lại
      }
    }
  } catch {
    // không có mạng / chưa cấu hình Supabase — im lặng, dùng dữ liệu cục bộ
  }

  return { pulled, merged }
}
