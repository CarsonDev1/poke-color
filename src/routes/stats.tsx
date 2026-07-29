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
      <main style={{ padding: 24 }}>
        <p role="alert" style={{ color: '#b91c1c' }}>
          {error}
        </p>
        <Link to="/library">Về thư viện</Link>
      </main>
    )
  }
  if (!stats || !t) return <main style={{ padding: 24 }}>Đang tính…</main>

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, display: 'grid', gap: 20 }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/library">← Thư viện</Link>
        <h1 style={{ margin: 0 }}>Thống kê</h1>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        <Card label="Tranh hoàn thành" value={String(t.puzzlesCompleted)} />
        <Card label="Vùng đã tô" value={t.regionsFilled.toLocaleString('vi-VN')} />
        <Card label="Tổng thời gian" value={formatDuration(t.activeSeconds)} />
        <Card
          label="Chuỗi ngày liên tiếp"
          value={streak > 0 ? `${streak} ngày` : '—'}
          hint={streak === 0 && days.length > 0 ? 'Chuỗi đã đứt, tô hôm nay để bắt đầu lại' : undefined}
        />
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>Theo từng tranh</h2>
        {metrics.length === 0 ? (
          <p style={{ color: '#475569' }}>
            Chưa có tranh nào. <Link to="/new">Tạo tranh mới</Link>
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
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
          </div>
        )}
      </section>

      <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
        Số liệu tính từ dữ liệu trong máy này. Đăng nhập để gộp cả tiến độ từ thiết bị khác.
      </p>
    </main>
  )
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 13, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#94a3b8' }}>{hint}</div>}
    </div>
  )
}

const cell: React.CSSProperties = { border: '1px solid #e2e8f0', padding: '6px 10px', textAlign: 'left' }
function Th({ children }: { children: React.ReactNode }) {
  return <th style={cell}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={cell}>{children}</td>
}
