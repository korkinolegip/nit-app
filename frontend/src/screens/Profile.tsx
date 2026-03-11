import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile, deleteProfile, uploadPhotos, deletePhoto, setPrimaryPhoto, getMyTests, CompletedTest } from '../api/profile'
import { getUserFeed, getUserFeedStats, FeedPost, toggleLike, toggleSave, deletePost } from '../api/feed'

interface ProfileProps {
  onBack: () => void
  onGoToChat?: () => void
  onNavigateViews?: () => void
  onNavigateSaved?: () => void
  onOpenSettings?: () => void
  isPaused?: boolean
  onTogglePause?: () => void
  isAdmin?: boolean
  onNavigateAdmin?: () => void
  viewsBadge?: number
}

interface ProfileData {
  name?: string
  age?: number
  city?: string
  gender?: string
  goal?: string
  occupation?: string
  personality_type?: string
  profile_text?: string
  profile_completeness_pct?: number
  missing_patterns?: string[]
}

interface PhotoData {
  id: number
  url: string
  is_primary: boolean
  moderation_status: string
}

const GOAL_LABELS: Record<string, string> = {
  romantic: 'Романтика',
  friendship: 'Дружба',
  hobby_partner: 'Партнёр по хобби',
  travel_companion: 'Попутчик',
  professional: 'Профессиональное',
  open: 'Открыт ко всему',
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн`
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

export default function Profile({ onBack, onGoToChat, onNavigateViews, onNavigateSaved, onOpenSettings, isPaused = false, onTogglePause, isAdmin = false, onNavigateAdmin, viewsBadge = 0 }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileData & { id?: number }>({})
  const [photos, setPhotos] = useState<PhotoData[]>([])
  const [photoIndex, setPhotoIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'about' | 'posts'>('about')
  const [stats, setStats] = useState<{ posts_count: number; total_likes: number } | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [myTests, setMyTests] = useState<CompletedTest[]>([])

  useEffect(() => {
    getProfile()
      .then((data: any) => {
        const user = data.user || data
        setProfile(user)
        setPhotos((data.photos || []).filter((p: PhotoData) => p.url))
        if (user.id) {
          getUserFeedStats(user.id)
            .then(s => setStats(s))
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    getMyTests().then(r => setMyTests(r.tests)).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab !== 'posts' || !profile.id || postsLoading || posts.length > 0) return
    setPostsLoading(true)
    getUserFeed(profile.id)
      .then(p => setPosts(p))
      .catch(() => {})
      .finally(() => setPostsLoading(false))
  }, [activeTab, profile.id])

  const startEdit = (field: string, value: string) => {
    setEditing(field)
    setEditValue(value)
  }

  const saveEdit = async () => {
    if (!editing) return
    const updated = { ...profile, [editing]: editing === 'age' ? Number(editValue) : editValue }
    setProfile(updated)
    setEditing(null)
    try {
      await updateProfile({ [editing]: updated[editing as keyof ProfileData] as any })
    } catch {
      // silently fail
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setDeleteError(false)
    try {
      await deleteProfile()
      window.location.reload()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
      setDeleteError(true)
    }
  }

  const touchStartX = useRef<number>(0)

  const MAX_PHOTOS = 5
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_FILE_SIZE = 10 * 1024 * 1024

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    e.target.value = ''
    setUploadError(null)
    if (!selected.length) return

    const available = MAX_PHOTOS - approvedPhotos.length
    if (available <= 0) return

    const invalid = selected.find(f => !ALLOWED_TYPES.includes(f.type))
    if (invalid) {
      setUploadError('Допустимые форматы: JPG, PNG, WEBP')
      return
    }
    const tooBig = selected.find(f => f.size > MAX_FILE_SIZE)
    if (tooBig) {
      setUploadError('Максимальный размер файла — 10 МБ')
      return
    }

    let accepted = selected
    if (accepted.length > available) {
      accepted = accepted.slice(0, available)
      setUploadError(`Можно добавить ещё ${available}. Лишние файлы убраны.`)
    }

    const newPending = accepted.map(file => ({ file, preview: URL.createObjectURL(file) }))
    setPendingFiles(prev => {
      const combined = [...prev, ...newPending]
      if (combined.length > available) {
        const trimmed = combined.slice(0, available)
        setUploadError(`Выбрано максимум ${available} фото`)
        return trimmed
      }
      return combined
    })
  }

  const handleRemovePending = (index: number) => {
    setPendingFiles(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
    setUploadError(null)
  }

  const handleUpload = async () => {
    if (!pendingFiles.length) return
    setUploadingPhoto(true)
    setUploadError(null)
    try {
      await uploadPhotos(pendingFiles.map(p => p.file))
      pendingFiles.forEach(p => URL.revokeObjectURL(p.preview))
      setPendingFiles([])
      const data: any = await getProfile()
      setPhotos((data.photos || []).filter((p: PhotoData) => p.url))
      setPhotoIndex(0)
    } catch (err: any) {
      setUploadError(err?.message || 'Ошибка загрузки. Попробуй ещё раз.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleDeletePhoto = async (photoId: number) => {
    try {
      await deletePhoto(photoId)
      const newPhotos = photos.filter(p => p.id !== photoId)
      setPhotos(newPhotos)
      setPhotoIndex(i => Math.min(i, Math.max(0, newPhotos.filter(p => p.moderation_status === 'approved' && p.url).length - 1)))
    } catch {
      // silently fail
    }
  }

  const handleSetPrimary = async (photoId: number) => {
    try {
      await setPrimaryPhoto(photoId)
      setPhotos(prev => prev.map(p => ({ ...p, is_primary: p.id === photoId })))
    } catch {
      // silently fail
    }
  }

  const approvedPhotos = photos.filter(p => p.moderation_status === 'approved' && p.url)
  const currentPhoto = approvedPhotos[photoIndex]

  const fields: { key: keyof ProfileData; label: string; format?: (v: unknown) => string }[] = [
    { key: 'name', label: 'Имя' },
    { key: 'age', label: 'Возраст', format: (v) => v ? `${v} лет` : '' },
    { key: 'city', label: 'Город' },
    { key: 'occupation', label: 'Занятие' },
    { key: 'goal', label: 'Ищу', format: (v) => GOAL_LABELS[v as string] || (v as string) || '' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>
          ПРОФИЛЬ
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px calc(88px + env(safe-area-inset-bottom, 0px))' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--d3)' }} />
          </div>
        ) : (
          <>
            {/* Photos */}
            <div style={{ marginBottom: '24px' }}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={handleFilesSelected} />

              {approvedPhotos.length > 0 ? (
                <>
                  {/* Main photo with swipe */}
                  <div
                    style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '20px', overflow: 'hidden', background: 'var(--bg3)', border: '1px solid var(--l)', marginBottom: 10 }}
                    onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
                    onTouchEnd={e => {
                      const dx = e.changedTouches[0].clientX - touchStartX.current
                      if (dx < -40 && photoIndex < approvedPhotos.length - 1) setPhotoIndex(i => i + 1)
                      if (dx > 40 && photoIndex > 0) setPhotoIndex(i => i - 1)
                    }}
                  >
                    <img src={currentPhoto?.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                    {/* Primary badge */}
                    {currentPhoto?.is_primary && (
                      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,.6)', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: 'white', fontWeight: 600 }}>
                        Главное
                      </div>
                    )}

                    {/* Controls overlay */}
                    <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 }}>
                      {!currentPhoto?.is_primary && (
                        <button
                          onClick={() => currentPhoto && handleSetPrimary(currentPhoto.id)}
                          style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 8, padding: '6px 10px', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter' }}
                        >
                          ★ Главное
                        </button>
                      )}
                      <button
                        onClick={() => currentPhoto && handleDeletePhoto(currentPhoto.id)}
                        style={{ background: 'rgba(200,0,0,.7)', border: 'none', borderRadius: 8, padding: '6px 10px', color: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter' }}
                      >
                        Удалить
                      </button>
                    </div>

                    {/* Arrow nav */}
                    {photoIndex > 0 && (
                      <button onClick={() => setPhotoIndex(i => i - 1)} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: 'white', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                    )}
                    {photoIndex < approvedPhotos.length - 1 && (
                      <button onClick={() => setPhotoIndex(i => i + 1)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: 'white', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                    )}
                  </div>

                  {/* Dots */}
                  {approvedPhotos.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                      {approvedPhotos.map((_, i) => (
                        <div key={i} onClick={() => setPhotoIndex(i)} style={{ width: i === photoIndex ? 18 : 6, height: 6, borderRadius: 3, cursor: 'pointer', background: i === photoIndex ? 'var(--w)' : 'var(--d4)', transition: 'all .2s' }} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <div style={{ width: 88, height: 88, borderRadius: '24px', background: 'var(--bg3)', border: '1px solid var(--l)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: 'var(--d3)' }}>
                    {profile.name ? profile.name[0].toUpperCase() : '?'}
                  </div>
                </div>
              )}

              {/* Pending previews */}
              {pendingFiles.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.07em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: 8 }}>
                    К загрузке — {pendingFiles.length}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {pendingFiles.map((p, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--bg3)' }}>
                        <img src={p.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => handleRemovePending(i)}
                          style={{
                            position: 'absolute', top: 4, right: 4,
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'rgba(0,0,0,.65)', border: 'none',
                            color: '#fff', cursor: 'pointer', fontSize: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error message */}
              {uploadError && (
                <div style={{ fontSize: 12, color: '#ff5050', marginBottom: 8, textAlign: 'center' }}>
                  {uploadError}
                </div>
              )}

              {/* Upload button (visible when pending files selected) */}
              {pendingFiles.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploadingPhoto}
                  style={{
                    width: '100%', padding: '12px', marginBottom: 8,
                    background: 'var(--w)', border: 'none', borderRadius: '12px',
                    color: 'var(--bg)', fontFamily: 'Inter', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    opacity: uploadingPhoto ? 0.6 : 1,
                  }}
                >
                  {uploadingPhoto ? 'Загружаю...' : `Загрузить ${pendingFiles.length} фото`}
                </button>
              )}

              {/* Add photo button */}
              {approvedPhotos.length + pendingFiles.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  style={{ width: '100%', padding: '11px', background: 'none', border: '1px dashed var(--d4)', borderRadius: '12px', color: 'var(--d3)', fontFamily: 'Inter', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                >
                  + Добавить фото ({approvedPhotos.length + pendingFiles.length}/5)
                </button>
              )}
            </div>

            {/* Quick-access navigation cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {onNavigateViews && (
                <button
                  onClick={onNavigateViews}
                  style={{
                    background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', position: 'relative', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 20 }}>👁</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--d1)', fontFamily: 'Inter' }}>Просмотры</span>
                  {viewsBadge > 0 && (
                    <div style={{
                      position: 'absolute', top: 8, right: 10,
                      background: '#ff4466', color: '#fff',
                      borderRadius: 20, minWidth: 18, height: 18,
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px',
                    }}>
                      {viewsBadge > 99 ? '99+' : viewsBadge}
                    </div>
                  )}
                </button>
              )}
              {onNavigateSaved && (
                <button
                  onClick={onNavigateSaved}
                  style={{
                    background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 20 }}>🔖</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--d1)', fontFamily: 'Inter' }}>Отложенные</span>
                </button>
              )}
            </div>
            {isAdmin && onNavigateAdmin && (
              <button
                onClick={onNavigateAdmin}
                style={{
                  width: '100%', background: 'rgba(123,94,255,0.08)',
                  border: '1px solid rgba(123,94,255,0.3)', borderRadius: 14,
                  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', marginBottom: 12, textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20 }}>🛡️</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(160,130,255,1)', fontFamily: 'Inter' }}>Админ-панель</span>
              </button>
            )}

            {/* Stats row */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8, marginBottom: 16,
            }}>
              {[
                { value: stats?.posts_count ?? 0, label: 'постов' },
                { value: stats?.total_likes ?? 0, label: 'лайков' },
                { value: profile.profile_completeness_pct != null ? `${profile.profile_completeness_pct}%` : '—', label: 'профиль' },
              ].map(({ value, label }) => (
                <div key={label} style={{
                  background: 'var(--bg3)', border: '1px solid var(--l)',
                  borderRadius: 14, padding: '12px 16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--d1)', fontFamily: 'Inter', letterSpacing: '-0.02em' }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--d3)', fontFamily: 'Inter', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Completeness progress bar */}
            {profile.profile_completeness_pct != null && profile.profile_completeness_pct < 100 && (
              <div style={{
                background: 'var(--bg3)', border: '1px solid var(--l)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--d2)', fontFamily: 'Inter' }}>
                    Профиль заполнен на {profile.profile_completeness_pct}%
                  </div>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: `${profile.profile_completeness_pct}%`,
                    background: profile.profile_completeness_pct >= 90 ? '#22c55e' : profile.profile_completeness_pct >= 70 ? '#3b82f6' : profile.profile_completeness_pct >= 40 ? '#f59e0b' : 'var(--d3)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, color: 'var(--d3)', fontFamily: 'Inter' }}>
                    Расскажи больше → найдём точное совпадение
                  </div>
                  {onGoToChat && (
                    <button
                      onClick={onGoToChat}
                      style={{
                        background: 'none', border: '1px solid var(--l)',
                        borderRadius: 8, padding: '5px 10px',
                        color: 'var(--d2)', fontSize: 12, fontFamily: 'Inter',
                        fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Дополнить
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div style={{
              display: 'flex', gap: 0, marginBottom: 20,
              background: 'var(--bg3)', borderRadius: 12, padding: 4,
              border: '1px solid var(--l)',
            }}>
              {(['about', 'posts'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
                    borderRadius: 9, fontFamily: 'Inter', fontSize: 13, fontWeight: 500,
                    background: activeTab === tab ? 'var(--bg2)' : 'none',
                    color: activeTab === tab ? 'var(--d1)' : 'var(--d3)',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab === 'about' ? 'О себе' : 'Посты'}
                </button>
              ))}
            </div>

            {/* Posts tab */}
            {activeTab === 'posts' && (
              <div>
                {postsLoading ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--d3)', fontFamily: 'Inter', fontSize: 13 }}>Загружаю...</div>
                ) : posts.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '40px 20px',
                    color: 'var(--d3)', fontFamily: 'Inter', fontSize: 14,
                  }}>
                    Ещё ничего не опубликовано
                  </div>
                ) : (
                  posts.map(post => (
                    <div key={post.id} style={{
                      background: 'var(--bg3)', border: '1px solid var(--l)',
                      borderRadius: 14, padding: 14, marginBottom: 10,
                    }}>
                      {post.text && (
                        <div style={{ fontSize: 14, color: 'var(--d1)', fontFamily: 'Inter', lineHeight: 1.55, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                          {post.text}
                        </div>
                      )}
                      {post.media_url && (
                        <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                          <img src={post.media_url} alt="" style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 240 }} />
                        </div>
                      )}
                      {post.hashtags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {post.hashtags.map(tag => (
                            <span key={tag} style={{ fontSize: 12, color: 'rgba(130,170,255,.8)', fontFamily: 'Inter' }}>#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <button
                          onClick={async () => {
                            try {
                              const res = await toggleLike(post.id)
                              const delta = res.liked ? 1 : -1
                              setPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_liked: res.liked, likes_count: res.likes_count } : p))
                              setStats(prev => prev ? { ...prev, total_likes: Math.max(0, prev.total_likes + delta) } : prev)
                            } catch { /* ignore */ }
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: post.is_liked ? '#ff4466' : 'var(--d3)', fontSize: 12, fontFamily: 'Inter', padding: 0 }}
                        >
                          ❤ {post.likes_count > 0 ? post.likes_count : ''}
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--d3)', fontFamily: 'Inter' }}>
                          💬 {post.comments_count > 0 ? post.comments_count : ''}
                        </span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 11, color: 'var(--d4)', fontFamily: 'Inter' }}>{timeAgo(post.created_at)}</span>
                        {post.is_mine && (
                          <button
                            onClick={async () => {
                              try {
                                await deletePost(post.id)
                                setStats(prev => prev ? {
                                  posts_count: prev.posts_count - 1,
                                  total_likes: Math.max(0, prev.total_likes - post.likes_count),
                                } : prev)
                                setPosts(prev => prev.filter(p => p.id !== post.id))
                              } catch { /* ignore */ }
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--d4)', fontSize: 18, padding: 0 }}
                          >×</button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* О себе tab content */}
            {activeTab === 'about' && <>

            {/* Personality type */}
            {profile.personality_type && (
              <div style={{
                marginBottom: '16px', padding: '14px 16px',
                background: 'var(--bg3)', border: '1px solid var(--l)',
                borderRadius: '14px',
              }}>
                <div style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const, color: 'var(--d3)', marginBottom: '6px',
                }}>
                  Тип личности
                </div>
                <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--w)', marginBottom: 4 }}>
                  {profile.personality_type}
                </div>
                {profile.profile_text && (
                  <div style={{ fontSize: '13px', color: 'var(--d2)', lineHeight: 1.6 }}>
                    {profile.profile_text}
                  </div>
                )}
              </div>
            )}

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fields.map(({ key, label, format }) => {
                const raw = profile[key]
                const display = format ? format(raw) : (raw?.toString() || '')
                const isEditingThis = editing === key

                return (
                  <div key={key} style={{
                    background: 'var(--bg3)', border: '1px solid var(--l)',
                    borderRadius: '14px', padding: '14px 16px',
                  }}>
                    <div style={{
                      fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const, color: 'var(--d3)',
                      marginBottom: '6px',
                    }}>
                      {label}
                    </div>
                    {isEditingThis ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit()}
                          style={{
                            flex: 1, background: 'var(--bg)', border: '1px solid var(--l)',
                            borderRadius: '8px', padding: '8px 10px',
                            color: 'var(--d1)', fontFamily: 'Inter',
                            fontSize: '15px', outline: 'none',
                          }}
                        />
                        <button
                          onClick={saveEdit}
                          style={{
                            background: 'var(--w)', color: 'var(--bg)',
                            border: 'none', borderRadius: '8px',
                            padding: '8px 14px', fontFamily: 'Inter',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Сохранить
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span style={{
                          fontSize: '15px', color: display ? 'var(--d1)' : 'var(--d4)',
                          fontWeight: 300, letterSpacing: '-0.01em',
                        }}>
                          {display || 'Не указано'}
                        </span>
                        <button
                          onClick={() => startEdit(key, raw?.toString() || '')}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--d3)', padding: '4px',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tests section */}
            {myTests.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--d3)', marginBottom: 10 }}>
                  Пройденные тесты
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                  {myTests.map(t => (
                    <div
                      key={t.test_id}
                      title={t.result_title}
                      style={{
                        padding: '7px 12px', borderRadius: 20,
                        background: 'rgba(123,94,255,0.12)', border: '1px solid rgba(123,94,255,0.3)',
                        fontSize: 12, color: 'rgba(160,130,255,1)', fontFamily: 'Inter', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <span>✓</span>
                      <span>{t.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{
              marginTop: '20px', padding: '14px 16px',
              background: 'var(--bg3)', border: '1px solid var(--l)',
              borderRadius: '14px',
              fontSize: '13px', color: 'var(--d3)', lineHeight: 1.6,
            }}>
              Можешь изменить профиль здесь вручную или просто написать Нити в чат
            </div>

            {/* Delete profile */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                marginTop: '32px', width: '100%', padding: '14px',
                background: 'none', border: '1px solid rgba(255,80,80,.3)',
                borderRadius: '13px', fontFamily: 'Inter', fontSize: '14px',
                fontWeight: 500, cursor: 'pointer',
                color: confirmDelete ? '#ff5050' : 'rgba(255,80,80,.6)',
              }}
            >
              {deleting ? 'Удаляем...' : confirmDelete ? 'Подтвердить удаление профиля' : 'Удалить профиль'}
            </button>
            {confirmDelete && !deleting && (
              <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--d3)', marginTop: '8px' }}>
                Все данные и фото будут удалены. Нажми ещё раз для подтверждения.
              </p>
            )}
            {deleteError && (
              <p style={{ textAlign: 'center', fontSize: '12px', color: '#ff5050', marginTop: '8px' }}>
                Не удалось удалить профиль. Попробуй ещё раз.
              </p>
            )}
            </>}
          </>
        )}
      </div>
    </div>
  )
}
