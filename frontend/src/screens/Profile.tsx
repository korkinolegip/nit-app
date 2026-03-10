import { useState, useEffect } from 'react'
import { getProfile, updateProfile, deleteProfile } from '../api/profile'

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
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getProfile()
      .then((data: ProfileData) => setProfile(data))
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
      await updateProfile({ [editing]: updated[editing as keyof ProfileData] })
    } catch {
      // silently fail — will sync on next load
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await deleteProfile()
      // Reload app — clears token, user starts fresh
      window.location.reload()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

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
            {/* Avatar placeholder */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
              <div style={{
                width: 88, height: 88, borderRadius: '24px',
                background: 'var(--bg3)', border: '1px solid var(--l)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '32px', color: 'var(--d3)',
              }}>
                {profile.name ? profile.name[0].toUpperCase() : '?'}
              </div>
            </div>

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
          </>
        )}
      </div>
    </div>
  )
}
