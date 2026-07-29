import { motion } from 'framer-motion'
import { ArrowLeft, Brush, Clock, Flame, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  currentStreak,
  formatDuration,
  localDay,
  puzzleMetrics,
  totals,
  type PuzzleStat,
} from '@/core/engine/stats'
import { listActivity, listPuzzles, loadProgress } from '@/data/local-cache'
import { Button } from '@/ui/primitives/button'
import { Card } from '@/ui/primitives/card'
import { PageTitle, Shell, Skeleton } from '@/ui/primitives/misc'

export default function StatsRoute() {
  const [stats, setStats] = useState<PuzzleStat[] | null>(null)
  const [days, setDays] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const recs = await listPuzzles()
        const withProgress = await Promise.all(
          recs.map(async (r) => {
            const p = await loadProgress(r.id)
            return {
              puzzleId: r.id,
              title: r.title,
              regionCount: r.regionCount,
              filledCount: p?.filledCount ?? 0,
              activeSeconds: p?.activeSeconds ?? 0,
              completedAt: p?.completedAt ?? null,
            } satisfies PuzzleStat
          }),
        )
        const act = await listActivity()
        if (!alive) return
        setStats(withProgress)
        setDays(act.map((a) => a.day))
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const t = useMemo(() => (stats ? totals(stats) : null), [stats])
  const streak = useMemo(() => currentStreak(days, localDay(Date.now())), [days])
  const metrics = useMemo(() => (stats ? stats.map(puzzleMetrics) : []), [stats])

  if (error) {
    return (
      <Shell className="max-w-lg">
        <Card className="p-6">
          <p role="alert" className="text-red-300">
            {error}
          </p>
          <Link to="/library" className="mt-4 inline-block text-aqua-400 hover:underline">
            &larr; Về thư viện
          </Link>
        </Card>
      </Shell>
    )
  }
  if (!stats || !t) {
    return (
      <Shell>
        <div className="mb-6 h-9 w-40 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </Shell>
    )
  }

  return (
    <Shell className="max-w-4xl">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-3"
      >
        <PageTitle>Thống kê</PageTitle>
        <Link to="/library">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
            Thư viện
          </Button>
        </Link>
      </motion.header>

      <section className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <StatCard label="Tranh hoàn thành" value={String(t.puzzlesCompleted)} icon={<Trophy size={14} />} delay={0} />
        <StatCard label="Vùng đã tô" value={t.regionsFilled.toLocaleString('vi-VN')} icon={<Brush size={14} />} delay={0.06} />
        <StatCard label="Tổng thời gian" value={formatDuration(t.activeSeconds)} icon={<Clock size={14} />} delay={0.12} />
        <StatCard
          label="Chuỗi ngày liên tiếp"
          value={streak > 0 ? `${streak} ngày` : '—'}
          hint={streak === 0 && days.length > 0 ? 'Chuỗi đã đứt, tô hôm nay để bắt đầu lại' : undefined}
          icon={<Flame size={14} />}
          delay={0.18}
        />
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-bold text-slate-900">Theo từng tranh</h2>
        {metrics.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">
            Chưa có tranh nào.{' '}
            <Link to="/new" className="text-aqua-400 hover:underline">
              Tạo tranh mới
            </Link>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-1">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Tranh</Th>
                  <Th>Tiến độ</Th>
                  <Th>Thời gian</Th>
                  <Th>Vùng/phút</Th>
                  <Th>Hoàn thành</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.puzzleId}>
                    <Td>
                      <Link to={`/play/${m.puzzleId}`}>{m.title}</Link>
                    </Td>
                    <Td>
                      {m.filledCount}/{m.regionCount} · {Math.round(m.progress * 100)}%
                    </Td>
                    <Td>{formatDuration(m.activeSeconds)}</Td>
                    {/* null (chưa tô gì) hiện dấu gạch, KHÔNG hiện "Infinity" */}
                    <Td>{m.regionsPerMinute === null ? '—' : m.regionsPerMinute.toFixed(1)}</Td>
                    <Td>
                      {m.completedAt === null
                        ? '—'
                        : new Date(m.completedAt).toLocaleDateString('vi-VN')}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-400">Số liệu tính từ dữ liệu trong máy này.</p>
    </Shell>
  )
}

/** Một ô số liệu tổng. Icon giúp phân biệt bốn ô khi quét mắt nhanh. */
function StatCard({
  label,
  value,
  hint,
  icon,
  delay,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ReactNode
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 26 }}
    >
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-slate-500">
          {icon}
          <span className="text-xs font-semibold">{label}</span>
        </div>
        {/* tabular-nums: số không nhảy ngang khi giá trị đổi độ dài */}
        <div className="font-display text-2xl font-extrabold tabular-nums text-slate-900">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
      </Card>
    </motion.div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold text-slate-500">
      {children}
    </th>
  )
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-200/70 px-3 py-2 text-slate-700">{children}</td>
}
