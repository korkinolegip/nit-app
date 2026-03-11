import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FeedPost, FeedComment,
  getFeed, createPost, deletePost, uploadPostMedia,
  toggleLike, toggleRepost, toggleSave,
  getComments, addComment, deleteComment,
} from '../api/feed'

// ─── Time helper ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн`
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const mod10 = abs % 10
  if (abs > 10 && abs < 20) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PostSkeleton() {
  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 18, padding: '16px',
      border: '1px solid var(--l)', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg3)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div>
          <div style={{ width: 100, height: 12, borderRadius: 6, background: 'var(--bg3)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 60, height: 10, borderRadius: 6, background: 'var(--bg3)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      </div>
      <div style={{ height: 14, borderRadius: 6, background: 'var(--bg3)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: 14, borderRadius: 6, background: 'var(--bg3)', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: FeedPost
  onLike: (id: number) => void
  onRepost: (id: number) => void
  onSave: (id: number) => void
  onComment: (id: number) => void
  onDelete: (id: number) => void
}

function PostCard({ post, onLike, onRepost, onSave, onComment, onDelete }: PostCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const needsTruncate = (post.text?.length ?? 0) > 200

  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 18, overflow: 'hidden',
      border: '1px solid var(--l)', marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: 'var(--bg4)', overflow: 'hidden',
          border: '1px solid var(--l)',
        }}>
          {post.author.avatar_url ? (
            <img src={post.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: 'var(--d3)',
            }}>
              {post.is_bot_post ? '✦' : (post.author.name?.[0] || '?')}
            </div>
          )}
        </div>

        {/* Name + time */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter', letterSpacing: '-0.01em' }}>
            {post.author.name}
            {post.author.age ? <span style={{ color: 'var(--d3)', fontWeight: 400 }}>, {post.author.age}</span> : null}
            {post.is_bot_post && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 600,
                color: 'rgba(255,255,255,.35)', letterSpacing: '.04em',
                background: 'var(--bg4)', borderRadius: 4, padding: '1px 5px',
                verticalAlign: 'middle',
              }}>
                редакция
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--d3)', fontFamily: 'Inter', marginTop: 1 }}>
            {timeAgo(post.created_at)}
          </div>
        </div>

        {/* Three-dot menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              background: 'none', border: 'none', padding: '4px 8px',
              cursor: 'pointer', color: 'var(--d3)', fontSize: 18, lineHeight: 1,
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
              <div style={{
                position: 'absolute', right: 0, top: 28, zIndex: 11,
                background: 'var(--bg3)', border: '1px solid var(--l)',
                borderRadius: 12, overflow: 'hidden', minWidth: 140,
              }}>
                {post.is_mine ? (
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(post.id) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'none', border: 'none',
                      color: '#ff4466', fontSize: 13, fontFamily: 'Inter', cursor: 'pointer',
                    }}
                  >
                    Удалить
                  </button>
                ) : (
                  <button
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'none', border: 'none',
                      color: 'var(--d2)', fontSize: 13, fontFamily: 'Inter', cursor: 'pointer',
                    }}
                  >
                    Пожаловаться
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Text */}
      {post.text && (
        <div style={{ padding: '10px 14px 0' }}>
          <div style={{
            fontSize: 14, lineHeight: 1.55, color: 'var(--d1)', fontFamily: 'Inter',
            display: '-webkit-box', WebkitLineClamp: expanded ? undefined : 4,
            WebkitBoxOrient: 'vertical', overflow: expanded ? undefined : 'hidden',
            whiteSpace: 'pre-wrap',
          }}>
            {post.text}
          </div>
          {needsTruncate && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                background: 'none', border: 'none', padding: '4px 0 0',
                fontSize: 13, color: 'var(--d3)', cursor: 'pointer', fontFamily: 'Inter',
              }}
            >
              читать далее
            </button>
          )}
        </div>
      )}

      {/* Image */}
      {post.media_url && (
        <div style={{ marginTop: 10, width: '100%', maxHeight: 360, overflow: 'hidden' }}>
          <img
            src={post.media_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div style={{ padding: '8px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {post.hashtags.map(tag => (
            <span key={tag} style={{
              fontSize: 12, color: 'rgba(130,170,255,.8)', fontFamily: 'Inter', fontWeight: 500,
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{
        padding: '10px 14px 14px',
        display: 'flex', alignItems: 'center', gap: 0,
        borderTop: '1px solid var(--l)', marginTop: 12,
      }}>
        <ActionBtn
          icon={<HeartIcon filled={post.is_liked} />}
          count={post.likes_count}
          active={post.is_liked}
          activeColor="#ff4466"
          onClick={() => onLike(post.id)}
        />
        <ActionBtn
          icon={<CommentIcon />}
          count={post.comments_count}
          onClick={() => onComment(post.id)}
        />
        <ActionBtn
          icon={<RepostIcon filled={post.is_reposted} />}
          count={post.reposts_count}
          active={post.is_reposted}
          activeColor="rgba(130,200,130,.9)"
          onClick={() => onRepost(post.id)}
        />
        <ActionBtn
          icon={<BookmarkIcon filled={post.is_saved} />}
          count={null}
          active={post.is_saved}
          activeColor="rgba(200,170,255,.9)"
          onClick={() => onSave(post.id)}
        />
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, color: 'var(--d3)', fontFamily: 'Inter',
        }}>
          <EyeIcon />
          {post.views_count}
        </div>
      </div>
    </div>
  )
}

function ActionBtn({
  icon, count, onClick, active = false, activeColor = 'var(--d1)',
}: {
  icon: React.ReactNode; count: number | null
  onClick: () => void; active?: boolean; activeColor?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 10px 4px 0',
        color: active ? activeColor : 'var(--d3)',
        fontSize: 12, fontFamily: 'Inter', fontWeight: 500,
        transition: 'color 0.15s',
      }}
    >
      {icon}
      {count !== null && count > 0 && count}
    </button>
  )
}

// SVG Icons
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z" strokeLinejoin="round" />
    </svg>
  )
}
function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinejoin="round" />
    </svg>
  )
}
function RepostIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.2 : 1.8}>
      <path d="M17 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" strokeLinecap="round" />
      <path d="M7 23l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" />
    </svg>
  )
}
function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinejoin="round" />
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// ─── Create Post Sheet ────────────────────────────────────────────────────────

interface CreateSheetProps {
  onClose: () => void
  onCreated: (post: FeedPost) => void
}

function CreateSheet({ onClose, onCreated }: CreateSheetProps) {
  const [text, setText] = useState('')
  const [mediaKey, setMediaKey] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const preview = URL.createObjectURL(file)
      setMediaPreview(preview)
      const res = await uploadPostMedia(file)
      setMediaKey(res.media_key)
      setMediaType(res.media_type)
    } catch (err) {
      alert('Не удалось загрузить файл')
      setMediaPreview(null)
    } finally {
      setIsUploading(false)
    }
  }

  const canPost = (text.trim().length > 0 || mediaKey) && !isPosting && !isUploading

  const handlePost = async () => {
    if (!canPost) return
    setIsPosting(true)
    try {
      const post = await createPost({
        text: text.trim() || undefined,
        media_key: mediaKey || undefined,
        media_type: mediaType || undefined,
      })
      onCreated(post)
    } catch {
      alert('Не удалось опубликовать пост')
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', background: 'var(--bg2)',
        borderRadius: '20px 20px 0 0', padding: '0 20px 40px',
        border: '1px solid var(--l)', borderBottom: 'none',
        animation: 'slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        maxHeight: '85dvh', overflow: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--d4)', margin: '12px auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter' }}>Новый пост</span>
          <button
            onClick={handlePost}
            disabled={!canPost}
            style={{
              background: canPost ? 'var(--w)' : 'var(--bg4)',
              color: canPost ? 'var(--bg)' : 'var(--d4)',
              border: 'none', borderRadius: 10, padding: '7px 16px',
              fontSize: 13, fontWeight: 600, fontFamily: 'Inter',
              cursor: canPost ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
          >
            {isPosting ? '...' : 'Опубликовать'}
          </button>
        </div>

        {/* Text input */}
        <textarea
          placeholder="Что у тебя нового?"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={500}
          rows={5}
          style={{
            width: '100%', background: 'var(--bg3)', border: '1px solid var(--l)',
            borderRadius: 14, padding: '12px 14px', color: 'var(--d1)',
            fontSize: 15, fontFamily: 'Inter', resize: 'none', outline: 'none',
            boxSizing: 'border-box', lineHeight: 1.5,
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--d3)', marginTop: 4, fontFamily: 'Inter' }}>
          {text.length}/500
        </div>

        {/* Media preview */}
        {mediaPreview && (
          <div style={{ position: 'relative', marginTop: 12 }}>
            <img src={mediaPreview} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover' }} />
            <button
              onClick={() => { setMediaKey(null); setMediaPreview(null); setMediaType(null) }}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                width: 28, height: 28, color: '#fff', cursor: 'pointer',
                fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Photo button */}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          style={{
            marginTop: 12, background: 'var(--bg3)', border: '1px solid var(--l)',
            borderRadius: 12, padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--d2)', fontSize: 13, fontFamily: 'Inter', cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          {isUploading ? 'Загружаю...' : mediaKey ? 'Заменить фото' : 'Добавить фото'}
        </button>
      </div>
    </div>
  )
}

// ─── Comments Sheet ───────────────────────────────────────────────────────────

interface CommentsSheetProps {
  postId: number
  onClose: () => void
  onCountUpdate: (postId: number, delta: number) => void
}

function CommentsSheet({ postId, onClose, onCountUpdate }: CommentsSheetProps) {
  const [comments, setComments] = useState<FeedComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    getComments(postId).then(c => { setComments(c); setIsLoading(false) }).catch(() => setIsLoading(false))
  }, [postId])

  const handleSend = async () => {
    if (!text.trim() || isSending) return
    setIsSending(true)
    try {
      const c = await addComment(postId, text.trim())
      setComments(prev => [...prev, c])
      setText('')
      onCountUpdate(postId, 1)
    } catch {
      alert('Не удалось отправить')
    } finally {
      setIsSending(false)
    }
  }

  const handleDelete = async (commentId: number) => {
    try {
      await deleteComment(postId, commentId)
      setComments(prev => prev.filter(c => c.id !== commentId))
      onCountUpdate(postId, -1)
    } catch {
      alert('Не удалось удалить')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', background: 'var(--bg2)',
        borderRadius: '20px 20px 0 0',
        border: '1px solid var(--l)', borderBottom: 'none',
        animation: 'slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        maxHeight: '75dvh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--d4)', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter', marginBottom: 14 }}>
            Комментарии
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {isLoading ? (
            <div style={{ color: 'var(--d3)', fontFamily: 'Inter', fontSize: 13, textAlign: 'center', padding: 24 }}>Загружаю...</div>
          ) : comments.length === 0 ? (
            <div style={{ color: 'var(--d3)', fontFamily: 'Inter', fontSize: 13, textAlign: 'center', padding: 24 }}>
              Будь первым — оставь комментарий
            </div>
          ) : (
            comments.map(c => (
              <div key={c.id} style={{
                display: 'flex', gap: 10, marginBottom: 14,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg4)', overflow: 'hidden', border: '1px solid var(--l)',
                }}>
                  {c.author.avatar_url ? (
                    <img src={c.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--d3)' }}>
                      {c.author.name?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter' }}>{c.author.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--d3)', fontFamily: 'Inter' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--d2)', fontFamily: 'Inter', marginTop: 2, lineHeight: 1.5 }}>{c.text}</div>
                </div>
                {c.is_mine && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--d4)', fontSize: 18, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px 24px', borderTop: '1px solid var(--l)',
          display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0,
        }}>
          <textarea
            placeholder="Написать комментарий..."
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={300}
            rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            style={{
              flex: 1, background: 'var(--bg3)', border: '1px solid var(--l)',
              borderRadius: 12, padding: '10px 12px', color: 'var(--d1)',
              fontSize: 14, fontFamily: 'Inter', resize: 'none', outline: 'none', lineHeight: 1.4,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: text.trim() ? 'var(--w)' : 'var(--bg4)',
              border: 'none', cursor: text.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={text.trim() ? 'var(--bg)' : 'var(--d4)'} strokeWidth="2">
              <path d="M22 2L11 13" strokeLinecap="round" />
              <path d="M22 2L15 22 11 13 2 9l20-7z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Feed screen ─────────────────────────────────────────────────────────

interface FeedProps {
  onBack: () => void
}

export default function Feed({ onBack }: FeedProps) {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [commentPostId, setCommentPostId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const PAGE = 20

  const loadFeed = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset
    if (!reset && isLoadingMore) return

    if (reset) {
      setIsLoading(true)
      setOffset(0)
      setHasMore(true)
    } else {
      setIsLoadingMore(true)
    }

    try {
      const newPosts = await getFeed(PAGE, currentOffset)
      if (reset) {
        setPosts(newPosts)
      } else {
        setPosts(prev => [...prev, ...newPosts])
      }
      if (newPosts.length < PAGE) setHasMore(false)
      setOffset(currentOffset + newPosts.length)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [offset, isLoadingMore])

  useEffect(() => { loadFeed(true) }, [])

  // Infinite scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMore || isLoadingMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      loadFeed(false)
    }
  }, [hasMore, isLoadingMore, loadFeed])

  const handleLike = async (id: number) => {
    try {
      const res = await toggleLike(id)
      setPosts(prev => prev.map(p =>
        p.id === id ? { ...p, is_liked: res.liked, likes_count: res.likes_count } : p
      ))
    } catch { /* ignore */ }
  }

  const handleRepost = async (id: number) => {
    try {
      const res = await toggleRepost(id)
      setPosts(prev => prev.map(p =>
        p.id === id ? { ...p, is_reposted: res.reposted, reposts_count: res.reposts_count } : p
      ))
    } catch { /* ignore */ }
  }

  const handleSave = async (id: number) => {
    try {
      const res = await toggleSave(id)
      setPosts(prev => prev.map(p =>
        p.id === id ? { ...p, is_saved: res.saved } : p
      ))
    } catch { /* ignore */ }
  }

  const handleDelete = async (id: number) => {
    try {
      await deletePost(id)
      setPosts(prev => prev.filter(p => p.id !== id))
    } catch { /* ignore */ }
  }

  const handleCommentCountUpdate = (postId: number, delta: number) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count + delta) } : p
    ))
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', background: 'var(--bg)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px 12px', flexShrink: 0,
        borderBottom: '1px solid var(--l)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--d2)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5m7-7-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span style={{
          fontSize: 15, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter',
          letterSpacing: '-0.01em',
        }}>
          Лента
        </span>

        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: 'var(--bg3)', border: '1px solid var(--l)',
            borderRadius: 10, width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--d2)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Feed list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}
      >
        {isLoading ? (
          <>
            <PostSkeleton /><PostSkeleton /><PostSkeleton />
          </>
        ) : posts.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '60dvh', gap: 12,
          }}>
            <div style={{ fontSize: 40 }}>✦</div>
            <div style={{ fontSize: 15, color: 'var(--d2)', fontFamily: 'Inter', fontWeight: 500, textAlign: 'center' }}>
              Лента пока пуста
            </div>
            <div style={{ fontSize: 13, color: 'var(--d3)', fontFamily: 'Inter', textAlign: 'center' }}>
              Будь первым — напиши что-нибудь
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                marginTop: 8, background: 'var(--w)', border: 'none', borderRadius: 12,
                padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'Inter',
                color: 'var(--bg)', cursor: 'pointer',
              }}
            >
              Написать пост
            </button>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onRepost={handleRepost}
                onSave={handleSave}
                onComment={id => setCommentPostId(id)}
                onDelete={handleDelete}
              />
            ))}
            {isLoadingMore && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--d3)', fontFamily: 'Inter', fontSize: 13 }}>
                Загружаю...
              </div>
            )}
            {!hasMore && posts.length > 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--d4)', fontFamily: 'Inter', fontSize: 12 }}>
                — — —
              </div>
            )}
          </>
        )}
      </div>

      {/* Sheets */}
      {showCreate && (
        <CreateSheet
          onClose={() => setShowCreate(false)}
          onCreated={post => {
            setPosts(prev => [post, ...prev])
            setShowCreate(false)
          }}
        />
      )}
      {commentPostId !== null && (
        <CommentsSheet
          postId={commentPostId}
          onClose={() => setCommentPostId(null)}
          onCountUpdate={handleCommentCountUpdate}
        />
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: none } }
        @keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.8 } }
      `}</style>
    </div>
  )
}
