import { useState, useEffect } from 'react'
import { getMyViewers, getIViewed, ProfileViewer } from '../api/views'
import Loader from '../components/Loader'

interface ProfileViewsProps {
  onBack: () => void
}

type Tab = 'viewers' | 'viewed'

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000

  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`
  if (diff < 86400 * 2) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function formatDuration(sec: number | null): string | null {
  if (!sec) return null
  if (sec < 10) return 'быстрый взгляд'
  if (sec < 30) return `${sec} сек`
  if (sec < 60) return 'около минуты'
  return `${Math.round(sec / 60)} мин`
}

export default function ProfileViews({ onBack }: ProfileViewsProps) {
  const [tab, setTab] = useState<Tab>('viewers')
  const [viewers, setViewers] = useState<ProfileViewer[]>([])
  const [viewed, setViewed] = useState<ProfileViewer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [v1, v2] = await Promise.all([getMyViewers(), getIViewed()])
        setViewers(v1.views)
        setViewed(v2.views)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const currentList = tab === 'viewers' ? viewers : viewed

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)', background: 'var(--bg)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--d2)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ПРОСМОТРЫ</div>
        <div style={{ width: 32 }} />
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', padding: '12px 16px 0',
        gap: 8, flexShrink: 0,
      }}>
        {([
          { key: 'viewers' as const, label: 'Смотрели меня', count: viewers.length },
          { key: 'viewed' as const, label: 'Я смотрел(а)', count: viewed.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '10px 8px',
              background: tab === t.key ? 'var(--w)' : 'var(--bg3)',
              border: tab === t.key ? 'none' : '1px solid var(--l)',
              borderRadius: 12,
              color: tab === t.key ? 'var(--bg)' : 'var(--d2)',
              fontFamily: 'Inter', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t.label} {t.count > 0 && `(${t.count})`}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <Loader />
        ) : currentList.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--d3)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>👁</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--d2)', marginBottom: 8 }}>
              {tab === 'viewers' ? 'Пока никто не заходил' : 'Ты ещё никого не смотрел(а)'}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              {tab === 'viewers'
                ? 'Просмотры появятся когда кто-то откроет твой профиль'
                : 'Просмотри профили в матчах — они появятся здесь'
              }
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentList.map(item => (
              <ViewerCard key={item.view_id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ViewerCard({ item }: { item: ProfileViewer }) {
  const durationText = formatDuration(item.duration_seconds)

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: 'var(--bg)',
          border: '1px solid var(--l)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: 'var(--d3)',
        }}>
          {item.photo_url
            ? <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (item.name?.[0] ?? '?')
          }
        </div>
        {/* Online dot */}
        {item.is_online && (
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 10, height: 10, borderRadius: '50%',
            background: '#22c55e', border: '2px solid var(--bg3)',
          }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--w)', marginBottom: 2 }}>
          {item.name}{item.age ? `, ${item.age}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--d3)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.city && <span>{item.city}</span>}
          {item.city && (item.last_seen_text || durationText) && <span>·</span>}
          {item.is_online
            ? <span style={{ color: '#22c55e' }}>онлайн</span>
            : item.last_seen_text && <span>{item.last_seen_text}</span>
          }
        </div>
        {durationText && (
          <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 3 }}>
            Смотрел(а) {durationText}
          </div>
        )}
      </div>

      {/* Time */}
      <div style={{ fontSize: 11, color: 'var(--d4)', flexShrink: 0, textAlign: 'right' }}>
        {formatDate(item.seen_at)}
      </div>
    </div>
  )
}
