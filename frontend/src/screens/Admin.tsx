import { useState, useEffect, useCallback, useRef } from 'react'
import { apiRequest } from '../api/client'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type Tab = 'dashboard' | 'drafts' | 'users' | 'matches' | 'tests' | 'content'

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

function MetricCard({ label, val, sub, onClick }: { label: string; val: number | string; sub?: string; onClick?: () => void }) {
  const [pressed, setPressed] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        ...card,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'opacity 0.1s, transform 0.1s',
        opacity: pressed ? 0.55 : 1,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--w)' }}>{val}</div>
      <div style={{ fontSize: 12, color: 'var(--d3)', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Dashboard({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [stats, setStats] = useState<Record<string, any> | null>(null)
  const [recentUsers, setRecentUsers] = useState<any[]>([])

  useEffect(() => {
    adminGet('/stats').then((r: any) => setStats(r)).catch(() => {})
    adminGet('/users?limit=5').then((r: any) => setRecentUsers(r.users || [])).catch(() => {})
  }, [])

  if (!stats) return <div style={{ color: 'var(--d3)', padding: 20 }}>Загрузка...</div>

  const main: { label: string; val: number; tab: Tab }[] = [
    { label: 'Всего пользователей', val: stats.total_users, tab: 'users' },
    { label: 'Активных', val: stats.active_users, tab: 'users' },
    { label: 'Заблокировано', val: stats.banned_users + stats.blocked_users, tab: 'users' },
    { label: 'Матчей', val: stats.total_matches, tab: 'matches' },
    { label: 'Принятых матчей', val: stats.accepted_matches, tab: 'matches' },
    { label: 'Постов (пользователи)', val: stats.user_posts, tab: 'content' },
    { label: 'Постов (бот)', val: stats.bot_posts, tab: 'content' },
    { label: 'Черновиков на проверке', val: stats.pending_drafts, tab: 'drafts' },
  ]

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        {main.map(({ label, val, tab }) => (
          <MetricCard key={label} label={label} val={val} onClick={() => onNavigate(tab)} />
        ))}
        <MetricCard label="тестов пройдено" val={stats.tests_completed_total ?? 0}
          sub={`+${stats.tests_completed_7d ?? 0} за 7 дн`}
          onClick={() => onNavigate('tests')} />
        <MetricCard label="средний профиль" val={`${stats.avg_profile_completeness ?? 0}%`} />
      </div>

      {/* Today's activity */}
      <div style={{ ...card, marginTop: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 10, letterSpacing: '.04em' }}>
          АКТИВНОСТЬ СЕГОДНЯ
        </div>
        {[
          ['Новых пользователей', stats.new_users_today ?? 0],
          ['Отправлено матчей', stats.matches_today ?? 0],
          ['Постов опубликовано', stats.posts_today ?? 0],
          ['Тестов пройдено', stats.tests_today ?? 0],
        ].map(([label, val]) => (
          <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--l)' }}>
            <span style={{ fontSize: 12, color: 'var(--d3)' }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--d1)' }}>{val}</span>
          </div>
        ))}
        {stats.users_with_pending_match > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--d3)' }}>
            С активным матч-таргетом: <strong style={{ color: 'var(--d2)' }}>{stats.users_with_pending_match}</strong>
          </div>
        )}
      </div>

      {/* Recent registrations */}
      {recentUsers.length > 0 && (
        <div onClick={() => onNavigate('users')}
          style={{ ...card, marginTop: 6, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 10, letterSpacing: '.04em' }}>
            ПОСЛЕДНИЕ РЕГИСТРАЦИИ →
          </div>
          {recentUsers.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid var(--l)' }}>
              <div style={{ fontSize: 13, color: 'var(--d1)', fontWeight: 500 }}>
                {u.name || '—'}{u.age ? `, ${u.age}` : ''}
                {u.profile_completeness_pct != null && (
                  <span style={{ fontSize: 10, color: 'var(--d4)', marginLeft: 6 }}>{u.profile_completeness_pct}%</span>
                )}
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
  const [fetching, setFetching] = useState(false)
  const [triggeringBot, setTriggeringBot] = useState(false)
  const [botStatus, setBotStatus] = useState<any>(null)
  const [botStatusOpen, setBotStatusOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(() => {
    adminGet('/drafts?limit=30').then((r: any) => setDrafts(r.drafts)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    adminGet('/bot-status').then((r: any) => setBotStatus(r)).catch(() => {})
  }, [load])

  const fetchFromGithub = async () => {
    setFetching(true)
    try {
      const r: any = await adminPost('/drafts/fetch-from-github')
      if (r.ok) {
        showToast(`Черновик создан из ${r.commits} коммитов`)
        load()
      } else {
        showToast('Нет новых коммитов за 7 дней')
      }
    } catch (e: any) {
      showToast('Ошибка: ' + String(e?.message ?? e).substring(0, 60))
    } finally {
      setFetching(false)
    }
  }

  const triggerBotPost = async () => {
    setTriggeringBot(true)
    try {
      await adminPost('/trigger-bot-post')
      showToast('Пост от Нить Daily опубликован в ленту')
      adminGet('/bot-status').then((r: any) => setBotStatus(r)).catch(() => {})
    } catch (e: any) {
      showToast('Ошибка: ' + String(e?.message ?? e).substring(0, 80))
    } finally {
      setTriggeringBot(false)
    }
  }

  const publish = async (id: number) => {
    try {
      await adminPost(`/drafts/${id}/publish`)
    } catch {
      showToast('Не удалось получить ответ от сервера — проверьте, возможно пост уже опубликован')
    } finally {
      load()
    }
  }

  const discard = async (id: number) => {
    try {
      await adminPost(`/drafts/${id}/discard`)
      load()
    } catch (e: any) { showToast('Ошибка: ' + String(e?.message ?? e).substring(0, 60)) }
  }

  const saveEdit = async (id: number) => {
    try {
      await adminPatch(`/drafts/${id}`, { generated_text: editText })
      setEditId(null)
      load()
    } catch (e: any) { showToast('Ошибка сохранения: ' + String(e?.message ?? e).substring(0, 60)) }
  }

  const regenerate = async (id: number) => {
    try {
      const r: any = await adminPost(`/drafts/${id}/regenerate`)
      setDrafts(ds => ds.map(d => d.id === id ? r : d))
      showToast('Текст перегенерирован')
    } catch (e: any) { showToast('Ошибка перегенерации: ' + String(e?.message ?? e).substring(0, 60)) }
  }

  const generate = async () => {
    if (!newTopic.trim()) return
    setGenerating(true)
    try {
      const res: any = await adminPost('/generate-post', { topic: newTopic })
      await adminPost('/drafts', { type: 'post', raw_text: newTopic, generated_text: res.text })
      setNewTopic('')
      load()
      showToast('Черновик создан')
    } catch (e: any) {
      showToast('Ошибка: ' + String(e?.message ?? e).substring(0, 60))
    } finally {
      setGenerating(false)
    }
  }

  const statusColor: Record<string, string> = {
    pending: '#f0a020', published: '#40c060', discarded: 'var(--d3)',
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 10,
          padding: '10px 16px', fontSize: 13, color: 'var(--d1)', zIndex: 100,
          whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Bot status section */}
      <div style={{ ...card, marginTop: 16 }}>
        <div
          onClick={() => setBotStatusOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--d2)' }}>
            {botStatusOpen ? '▼' : '▶'} Статус бота-редактора
          </div>
          <button
            onClick={e => { e.stopPropagation(); triggerBotPost() }}
            disabled={triggeringBot}
            style={btn(true)}
          >
            {triggeringBot ? '⏳...' : '▶ Опубликовать сейчас'}
          </button>
        </div>
        {botStatusOpen && botStatus && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--l)', paddingTop: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--d3)' }}>Последний пост</span>
                <span style={{ fontSize: 12, color: 'var(--d1)' }}>{fmtDate(botStatus.last_post_at)}</span>
              </div>
              {botStatus.last_post_preview && (
                <div style={{ fontSize: 12, color: 'var(--d3)', fontStyle: 'italic' }}>
                  «{botStatus.last_post_preview}...»
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--d3)' }}>Следующий запуск</span>
                <span style={{ fontSize: 12, color: 'var(--d1)' }}>{fmtDate(botStatus.next_scheduled)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--d3)' }}>Всего постов от бота</span>
                <span style={{ fontSize: 12, color: 'var(--d1)' }}>{botStatus.total_bot_posts}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--d4)' }}>{botStatus.schedule_description}</div>
            </div>
          </div>
        )}
      </div>

      {/* Fetch from GitHub */}
      <div style={{ marginTop: 4, marginBottom: 4 }}>
        <button onClick={fetchFromGithub} disabled={fetching} style={btn()}>
          {fetching ? '⏳ Загружаю...' : '⬇ Загрузить из GitHub'}
        </button>
      </div>

      {/* Generate new post */}
      <div style={{ ...card, marginTop: 12 }}>
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
                  <button onClick={() => regenerate(d.id)} style={btn()}>↻ Перегенерировать</button>
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
  const [sort, setSort] = useState('created_at')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q = '', s = sort, f = filter) => {
    setLoading(true)
    setError(null)
    try {
      const r: any = await adminGet(
        `/users?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}&sort=${s}&filter=${f}`
      )
      setUsers(r.users ?? [])
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [sort, filter])

  useEffect(() => { load() }, [load])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(value, sort, filter), 300)
  }

  const handleSort = (s: string) => { setSort(s); load(search, s, filter) }
  const handleFilter = (f: string) => { setFilter(f); load(search, sort, f) }

  if (selectedId !== null) {
    return (
      <UserDetail
        userId={selectedId}
        onClose={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); load(search) }}
      />
    )
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ marginTop: 16, marginBottom: 8 }}>
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

      {/* Sort/filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'По дате', val: 'created_at' },
          { label: 'По активности', val: 'last_seen' },
          { label: 'По профилю', val: 'profile_completeness_pct' },
        ].map(s => (
          <button key={s.val} onClick={() => handleSort(s.val)}
            style={{ ...btn(sort === s.val), fontSize: 11, padding: '5px 10px' }}>
            {s.label}
          </button>
        ))}
        <div style={{ width: 1, background: 'var(--l)', margin: '2px 2px' }} />
        {[
          { label: 'Все', val: 'all' },
          { label: 'С матч-таргетом', val: 'pending_match' },
          { label: 'Заблокированные', val: 'blocked' },
        ].map(f => (
          <button key={f.val} onClick={() => handleFilter(f.val)}
            style={{ ...btn(filter === f.val), fontSize: 11, padding: '5px 10px' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 20 }}>Загрузка...</div>}

      {error && (
        <div style={{
          background: 'rgba(255,60,60,0.12)', border: '1px solid rgba(255,60,60,0.3)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
          fontSize: 12, color: '#ff6060', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Ошибка загрузки</div>
          <div>{error}</div>
          <button onClick={() => load(search)} style={{ ...btn(), marginTop: 8, fontSize: 11 }}>Повторить</button>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 30 }}>Нет пользователей</div>
      )}

      {users.map(u => (
        <div
          key={u.id}
          onClick={() => setSelectedId(u.id)}
          style={{ ...card, cursor: 'pointer', transition: 'opacity 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--w)' }}>
                {u.name || '—'} {u.age ? `· ${u.age}` : ''} {u.city ? `· ${u.city}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--d3)', marginTop: 2 }}>
                ID: {u.id} · {u.onboarding_step}
                {u.profile_completeness_pct != null && (
                  <span style={{ marginLeft: 6, color: 'var(--d4)' }}>{u.profile_completeness_pct}%</span>
                )}
                {u.is_admin && <span style={{ color: '#7B5EFF', marginLeft: 6 }}>ADMIN</span>}
                {u.is_banned && <span style={{ color: '#ff4466', marginLeft: 6 }}>BAN</span>}
                {u.is_blocked && <span style={{ color: '#f08020', marginLeft: 6 }}>BLOCKED</span>}
              </div>
              {u.last_seen && (
                <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 2 }}>
                  {new Date(u.last_seen).toLocaleString('ru')}
                </div>
              )}
            </div>
            <div style={{ color: 'var(--d3)', fontSize: 18, marginLeft: 8 }}>›</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── User Detail panel ─────────────────────────────────────────────────────────

function UserDetail({ userId, onClose, onDeleted }: {
  userId: number
  onClose: () => void
  onDeleted: () => void
}) {
  const [user, setUser] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [detailTab, setDetailTab] = useState<'profile' | 'data' | 'activity'>('profile')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, p] = await Promise.all([
        adminGet(`/users/${userId}`),
        adminGet(`/users/${userId}/posts`).catch(() => ({ posts: [] })),
      ])
      setUser(u)
      setEditData({
        name: (u as any).name || '',
        age: (u as any).age || '',
        city: (u as any).city || '',
        occupation: (u as any).occupation || '',
        goal: (u as any).goal || '',
        partner_preference: (u as any).partner_preference || '',
      })
      setPosts((p as any).posts || [])
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { reload() }, [reload])

  const save = async () => {
    setSaving(true)
    try {
      await adminPatch(`/users/${userId}`, editData)
      await reload()
      setEditing(false)
    } catch (e: any) {
      alert('Ошибка: ' + String(e?.message ?? e))
    } finally { setSaving(false) }
  }

  const toggleFlag = async (flag: string, val: boolean) => {
    try {
      await adminPatch(`/users/${userId}`, { [flag]: val })
      setUser((u: any) => ({ ...u, [flag]: val }))
    } catch (e: any) { alert('Ошибка: ' + String(e?.message ?? e)) }
  }

  const runMatching = async () => {
    try {
      await adminPost(`/run-matching/${userId}`)
      alert('Матчинг запущен')
    } catch (e: any) { alert('Ошибка: ' + String(e?.message ?? e)) }
  }

  const deleteUser = async () => {
    if (!confirm(`Удалить пользователя ${user?.name} навсегда?`)) return
    try {
      await adminDelete(`/users/${userId}`)
      onDeleted()
    } catch (e: any) { alert('Ошибка: ' + String(e?.message ?? e)) }
  }

  const deletePost = async (postId: number) => {
    if (!confirm('Удалить пост?')) return
    try {
      await adminDelete(`/posts/${postId}`)
      setPosts(p => p.filter(x => x.id !== postId))
    } catch (e: any) { alert('Ошибка: ' + String(e?.message ?? e)) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--l)', background: 'var(--bg3)',
    color: 'var(--w)', fontSize: 13, fontFamily: 'Inter',
    boxSizing: 'border-box',
  }

  const FlagToggle = ({ flag, label, color = '#7B5EFF' }: { flag: string; label: string; color?: string }) => {
    const val = user?.[flag]
    return (
      <div
        onClick={() => toggleFlag(flag, !val)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', borderBottom: '1px solid var(--l)', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13, color: val ? color : 'var(--d2)' }}>{label}</span>
        <div style={{
          width: 38, height: 22, borderRadius: 11,
          background: val ? color : 'var(--bg3)',
          border: '1px solid var(--l)', position: 'relative', transition: 'background 0.2s',
        }}>
          <div style={{
            position: 'absolute', top: 2,
            left: val ? 17 : 2,
            width: 16, height: 16, borderRadius: 8,
            background: 'var(--w)', transition: 'left 0.2s',
          }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 10,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid var(--l)',
        position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1, flexShrink: 0,
      }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--d2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--w)' }}>{user?.name || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--d4)' }}>ID: {userId}</div>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={btn()}>Редактировать</button>
        )}
      </div>

      {loading && <div style={{ color: 'var(--d3)', padding: 24, textAlign: 'center' }}>Загрузка...</div>}
      {error && <div style={{ color: '#ff6060', padding: 16, fontSize: 12 }}>{error}</div>}

      {user && (
        <div style={{ padding: '0 16px 32px' }}>
          {/* Photos */}
          {user.photos?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0', scrollbarWidth: 'none' }}>
              {user.photos.map((ph: any) => (
                <img key={ph.id} src={ph.url} alt="" style={{
                  width: 80, height: 80, objectFit: 'cover',
                  borderRadius: 10, flexShrink: 0, border: '1px solid var(--l)',
                }} />
              ))}
            </div>
          )}

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: 4 }}>
            {([['profile', 'Профиль'], ['data', 'Данные'], ['activity', 'Активность']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setDetailTab(t)} style={{ ...btn(detailTab === t), fontSize: 11 }}>
                {label}
              </button>
            ))}
          </div>

          {/* Profile tab */}
          {detailTab === 'profile' && (
            <>
              {editing ? (
                <div style={{ ...card }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 10, letterSpacing: '.04em' }}>РЕДАКТИРОВАНИЕ</div>
                  {([
                    ['name', 'Имя'],
                    ['age', 'Возраст'],
                    ['city', 'Город'],
                    ['occupation', 'Профессия'],
                    ['goal', 'Цель (romantic/friendship/open)'],
                    ['partner_preference', 'Предпочтение (male/female/any)'],
                  ] as [string, string][]).map(([field, label]) => (
                    <div key={field} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--d3)', marginBottom: 4 }}>{label}</div>
                      <input
                        value={editData[field] ?? ''}
                        onChange={e => setEditData(d => ({ ...d, [field]: field === 'age' ? Number(e.target.value) || '' : e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={save} disabled={saving} style={btn(true)}>{saving ? 'Сохраняю...' : 'Сохранить'}</button>
                    <button onClick={() => setEditing(false)} style={btn()}>Отмена</button>
                  </div>
                </div>
              ) : (
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 10, letterSpacing: '.04em' }}>ПРОФИЛЬ</div>
                  {/* Completeness bar */}
                  {user.profile_completeness_pct != null && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--d3)' }}>Заполненность</span>
                        <span style={{ fontSize: 11, color: 'var(--d2)', fontWeight: 600 }}>{user.profile_completeness_pct}%</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: '#7B5EFF', borderRadius: 2, width: `${user.profile_completeness_pct}%` }} />
                      </div>
                    </div>
                  )}
                  {[
                    ['Имя', user.name], ['Возраст', user.age], ['Город', user.city],
                    ['Профессия', user.occupation], ['Цель', user.goal],
                    ['Предпочтение', user.partner_preference], ['Тип личности', user.personality_type],
                    ['Telegram ID', user.telegram_id], ['Этап онбординга', user.onboarding_step],
                    ['Постов', user.posts_count],
                    ['Регистрация', user.created_at ? new Date(user.created_at).toLocaleDateString('ru') : '—'],
                    ['Последний вход', user.last_seen ? new Date(user.last_seen).toLocaleString('ru') : '—'],
                  ].map(([label, val]) => val != null && val !== '' ? (
                    <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--l)' }}>
                      <span style={{ fontSize: 12, color: 'var(--d3)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: 'var(--d1)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{String(val)}</span>
                    </div>
                  ) : null)}
                  {user.profile_text && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--d2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                      «{user.profile_text}»
                    </div>
                  )}
                </div>
              )}

              {/* Filled patterns */}
              {user.filled_patterns_named && Object.keys(user.filled_patterns_named).length > 0 && (
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 8, letterSpacing: '.04em' }}>ЗАПОЛНЕНО</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.values(user.filled_patterns_named).map((name: any) => (
                      <span key={name} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(64,192,96,0.1)', color: '#40c060', border: '1px solid rgba(64,192,96,0.2)' }}>{name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing patterns */}
              {user.missing_patterns_named?.length > 0 && (
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 8, letterSpacing: '.04em' }}>НЕ ЗАПОЛНЕНО</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {user.missing_patterns_named.map((name: string) => (
                      <span key={name} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,180,0,0.12)', color: '#f0a020', border: '1px solid rgba(255,180,0,0.2)' }}>{name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Flags */}
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 6, letterSpacing: '.04em' }}>СТАТУСЫ</div>
                <FlagToggle flag="is_active" label="Активен" color="#40c060" />
                <FlagToggle flag="is_admin" label="Администратор" color="#7B5EFF" />
                <FlagToggle flag="is_blocked" label="Заблокирован" color="#f08020" />
                <FlagToggle flag="is_banned" label="Забанен" color="#ff4466" />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={runMatching} style={btn()}>▶ Запустить матчинг</button>
                <button onClick={deleteUser} style={dangerBtn}>Удалить аккаунт</button>
              </div>
            </>
          )}

          {/* Data tab */}
          {detailTab === 'data' && (
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 10, letterSpacing: '.04em' }}>СОБРАННЫЕ ДАННЫЕ</div>
              {user.collected_data_readable && Object.keys(user.collected_data_readable).length > 0 ? (
                Object.entries(user.collected_data_readable).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--l)', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--d3)', flexShrink: 0 }}>{key}</span>
                    <span style={{ fontSize: 12, color: 'var(--d1)', textAlign: 'right', wordBreak: 'break-word' }}>{String(val)}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: 'var(--d4)', textAlign: 'center', padding: 12 }}>Нет данных</div>
              )}
            </div>
          )}

          {/* Activity tab */}
          {detailTab === 'activity' && (
            <>
              {/* Pending match target */}
              {user.pending_match_target && (
                <div style={{ ...card, background: 'rgba(123,94,255,0.06)', border: '1px solid rgba(123,94,255,0.2)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#a880ff', marginBottom: 8, letterSpacing: '.04em' }}>АКТИВНЫЙ МАТЧ-ТАРГЕТ</div>
                  <div style={{ fontSize: 13, color: 'var(--d1)' }}>{user.pending_match_target.name || `ID ${user.pending_match_target.user_id}`}</div>
                  {user.pending_match_target.missing_patterns?.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--d3)' }}>
                      Не хватает: {user.pending_match_target.missing_patterns.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Completed tests */}
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 8, letterSpacing: '.04em' }}>
                  ПРОЙДЕННЫЕ ТЕСТЫ ({user.completed_tests?.length || 0})
                </div>
                {user.completed_tests?.length > 0 ? (
                  user.completed_tests.map((t: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--l)' }}>
                      <span style={{ fontSize: 12, color: 'var(--d2)' }}>{t.category}</span>
                      <span style={{ fontSize: 11, color: 'var(--d3)' }}>{t.result_key} · {new Date(t.completed_at).toLocaleDateString('ru')}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--d4)', textAlign: 'center', padding: 8 }}>Нет пройденных тестов</div>
                )}
              </div>

              {/* Matches */}
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 8, letterSpacing: '.04em' }}>
                  МАТЧИ ({user.matches_list?.length || 0})
                </div>
                {user.matches_list?.length > 0 ? (
                  user.matches_list.map((m: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--l)' }}>
                      <span style={{ fontSize: 12, color: 'var(--d2)' }}>{m.partner_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--d3)' }}>
                        {m.status}{m.compatibility_score ? ` · ${Math.round(m.compatibility_score * 100)}%` : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--d4)', textAlign: 'center', padding: 8 }}>Нет матчей</div>
                )}
              </div>

              {/* Posts */}
              {posts.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 8, letterSpacing: '.04em' }}>ПОСТЫ ({posts.length})</div>
                  {posts.map(p => (
                    <div key={p.id} style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, marginRight: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--d4)', marginBottom: 4 }}>
                            {new Date(p.created_at).toLocaleDateString('ru')} · ♥ {p.likes_count} · 💬 {p.comments_count}
                            {p.has_test && <span style={{ color: '#7B5EFF', marginLeft: 6 }}>ТЕСТ</span>}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--d1)', lineHeight: 1.4 }}>{p.text}</div>
                        </div>
                        <button onClick={() => deletePost(p.id)} style={dangerBtn}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Matches tab ───────────────────────────────────────────────────────────────

function MatchesTab() {
  const [matches, setMatches] = useState<any[]>([])
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  useEffect(() => {
    adminGet('/matches?limit=50').then((r: any) => setMatches(r.matches)).catch(() => {})
  }, [])

  const openMatch = async (m: any) => {
    setSelectedMatch(m)
    setLoadingMsgs(true)
    try {
      const r: any = await adminGet(`/chats/${m.id}/messages`)
      setMessages(r.messages || [])
    } catch { setMessages([]) }
    setLoadingMsgs(false)
  }

  const statusColor: Record<string, string> = {
    pending: 'var(--d3)', accepted: '#40c060', rejected: '#ff6060',
  }

  if (selectedMatch) {
    const m = selectedMatch
    const senderName = (id: number) => id === m.user1_id ? m.user1_name : m.user2_name
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--l)', flexShrink: 0 }}>
          <button onClick={() => setSelectedMatch(null)} style={{ background: 'none', border: 'none', color: 'var(--d2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--w)' }}>{m.user1_name} ↔ {m.user2_name}</div>
            <div style={{ fontSize: 11, color: 'var(--d4)' }}>
              {m.compatibility_score ? `${Math.round(m.compatibility_score * 100)}% совместимость · ` : ''}
              {new Date(m.created_at).toLocaleDateString('ru')}
            </div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: statusColor[m.status] || 'var(--d3)', fontWeight: 600 }}>{m.status.toUpperCase()}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loadingMsgs && <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 20 }}>Загрузка...</div>}
          {!loadingMsgs && messages.length === 0 && (
            <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 20 }}>Сообщений нет</div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--d4)', marginBottom: 2 }}>
                {senderName(msg.sender_id)} · {new Date(msg.created_at).toLocaleString('ru')}
              </div>
              <div style={{ ...card, padding: '8px 12px', marginBottom: 0, display: 'inline-block', maxWidth: '85%' }}>
                <div style={{ fontSize: 13, color: 'var(--d1)' }}>{msg.text || `[${msg.content_type}]`}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ marginTop: 4 }}>
        {matches.length === 0 && (
          <div style={{ color: 'var(--d3)', textAlign: 'center', padding: 20 }}>Нет матчей</div>
        )}
        {matches.map(m => (
          <div key={m.id} onClick={() => openMatch(m)}
            style={{ ...card, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--w)' }}>
                  {m.user1_name} ↔ {m.user2_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--d3)', marginTop: 3 }}>
                  {m.compatibility_score ? `${Math.round(m.compatibility_score * 100)}% · ` : ''}
                  {m.chat_status} · {new Date(m.created_at).toLocaleDateString('ru')}
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

// ── Tests tab ─────────────────────────────────────────────────────────────────

function TestsTab() {
  const [templates, setTemplates] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)
  const [totalTests, setTotalTests] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      adminGet('/test-templates'),
      adminGet('/test-results?limit=10'),
      adminGet('/stats'),
    ]).then(([t, r, s]: any[]) => {
      setTemplates(t.templates || [])
      setResults(r.results || [])
      setTotalTests((s as any).tests_completed_total ?? 0)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
    return `${Math.floor(diff / 86400)} дн назад`
  }

  if (loading) return <div style={{ color: 'var(--d3)', padding: 24, textAlign: 'center' }}>Загрузка...</div>

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16, marginBottom: 16 }}>
        <MetricCard label="шаблонов" val={templates.length} />
        <MetricCard label="пройдено всего" val={totalTests} />
        <MetricCard label="ср. прохождений" val={templates.length ? Math.round(totalTests / templates.length) : 0} />
      </div>

      {/* Templates */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginBottom: 8, letterSpacing: '.04em' }}>
        ШАБЛОНЫ ТЕСТОВ
      </div>
      {templates.map(t => (
        <div key={t.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--w)', marginBottom: 2 }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--d3)' }}>
                {t.category} · {t.pattern_key} · Использован: {t.used_count} раз
                {t.completions_count > 0 && ` · Пройден: ${t.completions_count} раз`}
              </div>
              {t.last_used_at && (
                <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 2 }}>
                  Последний раз: {fmtDate(t.last_used_at)}
                </div>
              )}
            </div>
            <button onClick={() => setSelectedTemplate(t)} style={{ ...btn(), fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
              Вопросы
            </button>
          </div>
        </div>
      ))}

      {/* Recent results */}
      {results.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--d3)', marginTop: 16, marginBottom: 8, letterSpacing: '.04em' }}>
            ПОСЛЕДНИЕ ПРОХОЖДЕНИЯ
          </div>
          {results.map((r, i) => (
            <div key={i} style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'var(--bg4)', border: '1px solid var(--l)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--d3)' }}>{r.user_name?.[0] || '?'}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--d1)' }}>
                  {r.user_name} · <span style={{ color: 'var(--d3)', fontWeight: 400 }}>{r.test_title}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--d3)' }}>
                  Результат: {r.result_key} · {fmtDate(r.completed_at)}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Template questions modal */}
      {selectedTemplate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setSelectedTemplate(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{
            position: 'relative', background: 'var(--bg2)',
            borderRadius: '20px 20px 0 0', padding: '0 20px 40px',
            maxHeight: '85dvh', overflowY: 'auto',
            border: '1px solid var(--l)', borderBottom: 'none',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--d4)', margin: '12px auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--w)' }}>{selectedTemplate.title}</div>
              <button onClick={() => setSelectedTemplate(null)} style={{ background: 'none', border: 'none', color: 'var(--d3)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            {(selectedTemplate.base_questions || []).map((q: any, qi: number) => (
              <div key={qi} style={{ ...card, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--d1)', marginBottom: 8 }}>
                  {qi + 1}. {q.text}
                </div>
                {q.options?.map((opt: any) => (
                  <div key={opt.key} style={{ fontSize: 12, color: 'var(--d3)', padding: '3px 0' }}>
                    <span style={{ color: 'var(--d4)' }}>{opt.key})</span> {opt.text}
                    <span style={{ color: 'rgba(123,94,255,0.7)', marginLeft: 8 }}>→ {opt.result}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Content tab ───────────────────────────────────────────────────────────────

function Content() {
  const [tab, setTab] = useState<'posts' | 'comments'>('posts')
  const [postFilter, setPostFilter] = useState('all')
  const [posts, setPosts] = useState<any[]>([])
  const [comments, setComments] = useState<any[]>([])

  const loadPosts = useCallback((f: string) => {
    adminGet(`/posts?limit=30&filter=${f}`).then((r: any) => setPosts(r.posts)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'posts') {
      loadPosts(postFilter)
    } else {
      adminGet('/comments?limit=30').then((r: any) => setComments(r.comments)).catch(() => {})
    }
  }, [tab, postFilter, loadPosts])

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

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['posts', 'comments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...btn(tab === t) }}>
            {t === 'posts' ? 'Посты' : 'Комментарии'}
          </button>
        ))}
      </div>

      {/* Post filter */}
      {tab === 'posts' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Все', val: 'all' },
            { label: 'От бота', val: 'bot' },
            { label: 'От пользователей', val: 'users' },
            { label: 'С тестами', val: 'with_test' },
          ].map(f => (
            <button key={f.val} onClick={() => setPostFilter(f.val)}
              style={{ ...btn(postFilter === f.val), fontSize: 11, padding: '5px 10px' }}>
              {f.label}
            </button>
          ))}
        </div>
      )}

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
                {p.has_test && p.test_title && (
                  <span style={{ marginLeft: 8, color: 'var(--d3)' }}>
                    🧪 {p.test_title} · Пройдено: {p.test_completions_count}
                  </span>
                )}
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
  { id: 'tests', label: 'Тесты' },
  { id: 'content', label: 'Контент' },
]

export default function Admin({ onBack }: AdminProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [authStatus, setAuthStatus] = useState<string | null>(null)

  useEffect(() => {
    adminGet('/stats')
      .then(() => setAuthStatus('ok'))
      .catch((e: any) => setAuthStatus(String(e?.message ?? e)))
  }, [])

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
        {authStatus && authStatus !== 'ok' && (
          <div style={{ fontSize: 10, color: '#ff6060', flex: 1, textAlign: 'right', wordBreak: 'break-all' }}>
            ⚠ {authStatus.substring(0, 80)}
          </div>
        )}
        {authStatus === 'ok' && (
          <div style={{ fontSize: 10, color: '#40c060', marginLeft: 'auto' }}>✓ auth ok</div>
        )}
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
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
        {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'drafts' && <Drafts />}
        {activeTab === 'users' && <Users />}
        {activeTab === 'matches' && <MatchesTab />}
        {activeTab === 'tests' && <TestsTab />}
        {activeTab === 'content' && <Content />}
      </div>
    </div>
  )
}
