import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile, deleteProfile, uploadPhotos, deletePhoto, setPrimaryPhoto } from '../api/profile'

interface ProfileProps {
  onBack: () => void
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

export default function Profile({ onBack }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileData>({})
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

  useEffect(() => {
    getProfile()
      .then((data: any) => {
        setProfile(data.user || data)
        setPhotos((data.photos || []).filter((p: PhotoData) => p.url))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: '32px', height: '32px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--d2)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>
          ПРОФИЛЬ
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 32px' }}>
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
          </>
        )}
      </div>
    </div>
  )
}
