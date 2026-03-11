import { useState, useEffect, useCallback, useRef } from 'react'
import { apiRequest } from '../api/client'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type Tab = 'dashboard' | 'drafts' | 'users' | 'matches' | 'content'

interface AdminProps {
  onBack: () => void
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function adminGet(path: string) {
  return apiRequest(`/api/admin${path}`)
}
async function adminPost(path: string, body?: any) {
  return apiRequest(`/api/admin${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
}
async function adminPatch(path: string, body: any) {
  return apiRequest(`/api/admin${path}`, { method: 'PATCH', body: JSON.stringify(body) })
}
async function adminDelete(path: string) {
  return apiRequest(`/api/admin${path}`, { method: 'DELETE' })
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = {
  background: 'var(--bg2)', border: '1px solid var(--l)',
  borderRadius: 14, padding: '14px 16px', marginBottom: 10,
}

const btn = (accent = false): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 9, border: '1px solid var(--l)',
  background: accent ? '#7B5EFF' : 'var(--bg3)',
  color: accent ? '#fff' : 'var(--d2)',
  fontSize: 12, fontWeight: 600, fontFamily: 'Inter', cursor: 'pointer',
})

const dangerBtn: React.CSSProperties = {
  ...btn(), background: 'rgba(255,60,60,0.12)', color: '#ff6060', borderColor: 'rgba(255,60,60,0.25)',
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

function MetricCard({ label, val, onClick }: { label: string; val: number; onClick: () => void }) {
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        ...card,
        cursor: 'pointer',
        transition: 'opacity 0.1s, transform 0.1s',
        opacity: pressed ? 0.55 : hovered ? 0.8 : 1,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--w)' }}>{val}</div>
      <div style={{ fontSize: 12, color: 'var(--d3)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function Dashboard({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [recentUsers, setRecentUsers] = useState<any[]>([])
  const [recentPressed, setRecentPressed] = useState(false)
  const [recentHovered, setRecentHovered] = useState(false)

  useEffect(() => {
    adminGet('/stats').then((r: any) => setStats(r)).catch(() => {})
    adminGet('/users?limit=5').then((r: any) => setRecentUsers(r.users || [])).catch(() => {})
  }, [])

  if (!stats) return <div style={{ color: 'var(--d3)', padding: 20 }}>Загрузка...</div>

  const items: { label: string; val: number; tab: Tab }[] = [
    { label: 'Всего пользователей', val: stats.total_users, tab: 'users' },
    { label: 'Активных', val: stats.active_users, tab: 'users' },
    { label: 'Заблокировано', val: stats.banned_users + stats.blocked_users, tab: 'users' },
    { label: 'Матчей', val: stats.total_matches, tab: 'matches' },
    { label: 'Принятых матчей', val: stats.accepted_matches, tab: 'matches' },
    { label: 'Постов (пользователи)', val: stats.user_posts, tab: 'content' },
    { label: 'Постов (бот)', val: stats.bot_posts, tab: 'content' },
    { label: 'Комментариев', val: stats.total_comments, tab: 'content' },
    { label: 'Черновиков на проверке', val: stats.pending_drafts, tab: 'drafts' },
  ]

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        {items.map(({ label, val, tab }) => (
          <MetricCard key={label} label={label} val={val} onClick={() => onNavigate(tab)} />
        ))}
      </div>

      {/* Recent registrations */}
      {recentUsers.length > 0 && (
        <div
          onClick={() => onNavigate('users')}
          onMouseEnter={() => setRecentHovered(true)}
          onMouseLeave={() => { setRecentHovered(false); setRecentPressed(false) }}
          onMouseDown={() => setRecentPressed(true)}
          onMouseUp={() => setRecentPressed(false)}
          onTouchStart={() => setRecentPressed(true)}
          onTouchEnd={() => setRecentPressed(false)}
          style={{
            ...card,
            marginTop: 6,
            cursor: 'pointer',
            transition: 'opacity 0.1s, transform 0.1s',
            opacity: recentPressed ? 0.55 : recentHovered ? 0.8 : 1,
            transform: recentPressed ? 'scale(0.97)' : 'scale(1)',
            userSelect: 'none',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 10, letterSpacing: '.04em' }}>
            ПОСЛЕДНИЕ РЕГИСТРАЦИИ →
          </div>
          {recentUsers.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid var(--l)' }}>
              <div style={{ fontSize: 13, color: 'var(--d1)', fontWeight: 500 }}>
                {u.name || '—'}{u.age ? `, ${u.age}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--d4)' }}>
                {u.city || ''}{u.city && u.created_at ? ' · ' : ''}{u.created_at ? new Date(u.created_at).toLocaleDateString('ru') : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Drafts tab ────────────────────────────────────────────────────────────────

function Drafts() {
  const [drafts, setDrafts] = useState<any[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    adminGet('/drafts?limit=30').then((r: any) => setDrafts(r.drafts)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const publish = async (id: number) => {
    await adminPost(`/drafts/${id}/publish`)
    load()
  }

  const discard = async (id: number) => {
    await adminPost(`/drafts/${id}/discard`)
    load()
  }

  const saveEdit = async (id: number) => {
    await adminPatch(`/drafts/${id}`, { generated_text: editText })
    setEditId(null)
    load()
  }

  const generate = async () => {
    if (!newTopic.trim()) return
    setGenerating(true)
    try {
      const res: any = await adminPost('/generate-post', { topic: newTopic })
      const draft: any = await adminPost('/drafts', { type: 'post', raw_text: newTopic, generated_text: res.text })
      setNewTopic('')
      load()
    } catch { /* ignore */ } finally {
      setGenerating(false)
    }
  }

  const statusColor: Record<string, string> = {
    pending: '#f0a020', published: '#40c060', discarded: 'var(--d3)',
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Generate new */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--w)', marginBottom: 10 }}>Сгенерировать пост</div>
        <input
          value={newTopic}
          onChange={e => setNewTopic(e.target.value)}
          placeholder="Тема поста..."
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 10,
            border: '1px solid var(--l)', background: 'var(--bg3)',
            color: 'var(--w)', fontSize: 13, fontFamily: 'Inter',
            boxSizing: 'border-box', marginBottom: 10,
          }}
        />
        <button onClick={generate} disabled={generating} style={btn(true)}>
          {generating ? 'Генерирую...' : 'Сгенерировать и сохранить черновик'}
        </button>
      </div>

      {drafts.length === 0 && (
        <div style={{ color: 'var(--d3)', padding: '20px 0', textAlign: 'center' }}>Черновиков нет</div>
      )}

      {drafts.map(d => (
        <div key={d.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: statusColor[d.status] || 'var(--d3)', fontWeight: 600 }}>
              {d.status.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: 'var(--d4)' }}>
              {new Date(d.created_at).toLocaleDateString('ru')}
            </span>
          </div>

          {d.github_commits && (
            <div style={{ fontSize: 11, color: 'var(--d3)', marginBottom: 8 }}>
              {(d.github_commits as any[]).map((c: any) => `${c.id}: ${c.message}`).join(' · ')}
            </div>
          )}

          {editId === d.id ? (
            <>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={6}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1px solid var(--l)', background: 'var(--bg3)',
                  color: 'var(--w)', fontSize: 13, fontFamily: 'Inter',
                  boxSizing: 'border-box', resize: 'vertical', marginBottom: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => saveEdit(d.id)} style={btn(true)}>Сохранить</button>
                <button onClick={() => setEditId(null)} style={btn()}>Отмена</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--d1)', lineHeight: 1.5, marginBottom: 10 }}>
                {(d.generated_text || d.raw_text || '').substring(0, 200)}
                {(d.generated_text || d.raw_text || '').length > 200 ? '...' : ''}
              </div>
              {d.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <button onClick={() => { setEditId(d.id); setEditText(d.generated_text || d.raw_text || '') }} style={btn()}>Редактировать</button>
                  <button onClick={() => publish(d.id)} style={btn(true)}>Опубликовать</button>
                  <button onClick={() => discard(d.id)} style={dangerBtn}>Отклонить</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function Users() {
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const r: any = await adminGet(`/users?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`)
      setUsers(r.users)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(value), 300)
  }

  const block = async (id: number) => {
    await adminPost(`/users/${id}/block`)
    load(search)
  }
  const unblock = async (id: number) => {
    await adminPost(`/users/${id}/unblock`)
    load(search)
  }
  const del = async (id: number) => {
    if (!confirm('Удалить пользователя?')) return
    await adminDelete(`/users/${id}`)
    load(search)
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Поиск по имени..."
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 10,
            border: '1px solid var(--l)', background: 'var(--bg3)',
            color: 'var(--w)', fontSize: 13, fontFamily: 'Inter',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {loading && <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 20 }}>Загрузка...</div>}

      {users.map(u => (
        <div key={u.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--w)' }}>
                {u.name || '—'} {u.age ? `· ${u.age}` : ''} {u.city ? `· ${u.city}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--d3)', marginTop: 2 }}>
                ID: {u.id} · TG: {u.telegram_id} · {u.onboarding_step}
                {u.is_admin && <span style={{ color: '#7B5EFF', marginLeft: 6 }}>ADMIN</span>}
                {u.is_banned && <span style={{ color: '#ff4466', marginLeft: 6 }}>BANNED</span>}
                {u.is_blocked && <span style={{ color: '#f08020', marginLeft: 6 }}>BLOCKED</span>}
              </div>
              {u.last_seen && (
                <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 2 }}>
                  Был: {new Date(u.last_seen).toLocaleString('ru')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {u.is_blocked
                ? <button onClick={() => unblock(u.id)} style={btn()}>Разблок</button>
                : <button onClick={() => block(u.id)} style={{ ...btn(), color: '#f08020' }}>Блок</button>
              }
              <button onClick={() => del(u.id)} style={dangerBtn}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Matches tab ───────────────────────────────────────────────────────────────

function MatchesTab() {
  const [matches, setMatches] = useState<any[]>([])

  useEffect(() => {
    adminGet('/matches?limit=50').then((r: any) => setMatches(r.matches)).catch(() => {})
  }, [])

  const statusColor: Record<string, string> = {
    pending: 'var(--d3)', accepted: '#40c060', rejected: '#ff6060',
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ marginTop: 4 }}>
        {matches.length === 0 && (
          <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 20 }}>Нет матчей</div>
        )}
        {matches.map(m => (
          <div key={m.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--d1)' }}>
                  Пользователи: {m.user1_id} ↔ {m.user2_id}
                </div>
                <div style={{ fontSize: 11, color: 'var(--d3)', marginTop: 3 }}>
                  Совместимость: {m.compatibility_score ? `${Math.round(m.compatibility_score * 100)}%` : '—'}
                  · Chat: {m.chat_status}
                  · {new Date(m.created_at).toLocaleDateString('ru')}
                </div>
              </div>
              <span style={{ fontSize: 11, color: statusColor[m.status] || 'var(--d3)', fontWeight: 600 }}>
                {m.status.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Content tab ───────────────────────────────────────────────────────────────

function Content() {
  const [tab, setTab] = useState<'posts' | 'comments'>('posts')
  const [posts, setPosts] = useState<any[]>([])
  const [comments, setComments] = useState<any[]>([])
  const [botTopic, setBotTopic] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (tab === 'posts') {
      adminGet('/posts?limit=30').then((r: any) => setPosts(r.posts)).catch(() => {})
    } else {
      adminGet('/comments?limit=30').then((r: any) => setComments(r.comments)).catch(() => {})
    }
  }, [tab])

  const deletePost = async (id: number) => {
    if (!confirm('Удалить пост?')) return
    await adminDelete(`/posts/${id}`)
    setPosts(p => p.filter(x => x.id !== id))
  }

  const deleteComment = async (id: number) => {
    if (!confirm('Удалить комментарий?')) return
    await adminDelete(`/comments/${id}`)
    setComments(c => c.filter(x => x.id !== id))
  }

  const createBotPost = async () => {
    if (!botTopic.trim()) return
    setPosting(true)
    try {
      const genRes: any = await adminPost('/generate-post', { topic: botTopic })
      await adminPost('/bot-post', { text: genRes.text })
      setBotTopic('')
      alert('Пост опубликован!')
    } catch { /* ignore */ } finally { setPosting(false) }
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Quick bot post */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--w)', marginBottom: 10 }}>Быстрый бот-пост</div>
        <input
          value={botTopic}
          onChange={e => setBotTopic(e.target.value)}
          placeholder="Тема для генерации..."
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 10,
            border: '1px solid var(--l)', background: 'var(--bg3)',
            color: 'var(--w)', fontSize: 13, fontFamily: 'Inter',
            boxSizing: 'border-box', marginBottom: 10,
          }}
        />
        <button onClick={createBotPost} disabled={posting} style={btn(true)}>
          {posting ? 'Публикую...' : 'Сгенерировать и опубликовать'}
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['posts', 'comments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...btn(tab === t),
          }}>
            {t === 'posts' ? 'Посты' : 'Комментарии'}
          </button>
        ))}
      </div>

      {tab === 'posts' && posts.map(p => (
        <div key={p.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--d3)', marginBottom: 4 }}>
                ID {p.id} · {p.is_bot_post ? 'Бот' : `User ${p.author_id}`} · {new Date(p.created_at).toLocaleDateString('ru')}
                {p.has_test && <span style={{ color: '#7B5EFF', marginLeft: 6 }}>ТЕСТ</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--d1)', lineHeight: 1.4 }}>
                {p.text?.substring(0, 120)}{p.text?.length > 120 ? '...' : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 4 }}>
                ♥ {p.likes_count} · 💬 {p.comments_count}
              </div>
            </div>
            <button onClick={() => deletePost(p.id)} style={dangerBtn}>✕</button>
          </div>
        </div>
      ))}

      {tab === 'comments' && comments.map(c => (
        <div key={c.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--d3)', marginBottom: 4 }}>
                Пост {c.post_id} · User {c.author_id} · {new Date(c.created_at).toLocaleDateString('ru')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--d1)' }}>{c.text}</div>
            </div>
            <button onClick={() => deleteComment(c.id)} style={dangerBtn}>✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Admin screen ─────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'drafts', label: 'Черновики' },
  { id: 'users', label: 'Пользователи' },
  { id: 'matches', label: 'Матчи' },
  { id: 'content', label: 'Контент' },
]

export default function Admin({ onBack }: AdminProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'var(--d2)',
          fontSize: 22, cursor: 'pointer', padding: '0 6px 0 0', lineHeight: 1,
        }}>←</button>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.05em', color: 'var(--w)' }}>
          ADMIN
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', overflowX: 'auto', gap: 4,
        padding: '10px 16px', borderBottom: '1px solid var(--l)',
        flexShrink: 0, scrollbarWidth: 'none',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '7px 14px', borderRadius: 10, whiteSpace: 'nowrap',
              border: activeTab === t.id ? '1px solid #7B5EFF' : '1px solid var(--l)',
              background: activeTab === t.id ? 'rgba(123,94,255,0.15)' : 'var(--bg3)',
              color: activeTab === t.id ? '#a880ff' : 'var(--d2)',
              fontSize: 12, fontWeight: 600, fontFamily: 'Inter', cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'drafts' && <Drafts />}
        {activeTab === 'users' && <Users />}
        {activeTab === 'matches' && <MatchesTab />}
        {activeTab === 'content' && <Content />}
      </div>
    </div>
  )
}
