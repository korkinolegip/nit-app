import { apiRequest } from './client'

export interface PostAuthor {
  id: number | null
  name: string
  age: number | null
  avatar_url: string
}

export interface FeedPost {
  id: number
  text: string | null
  media_url: string
  media_type: 'image' | 'gif' | null
  hashtags: string[]
  created_at: string
  likes_count: number
  comments_count: number
  reposts_count: number
  views_count: number
  is_liked: boolean
  is_saved: boolean
  is_reposted: boolean
  is_bot_post: boolean
  has_test: boolean
  is_mine: boolean
  author: PostAuthor
}

export interface FeedComment {
  id: number
  text: string
  created_at: string
  is_mine: boolean
  author: { id: number; name: string; avatar_url: string }
}

export async function getFeed(limit = 20, offset = 0): Promise<FeedPost[]> {
  const res = await apiRequest(`/api/feed?limit=${limit}&offset=${offset}`)
  return (res as { posts: FeedPost[] }).posts
}

export async function getUserFeed(userId: number, limit = 20, offset = 0): Promise<FeedPost[]> {
  const res = await apiRequest(`/api/feed/user/${userId}?limit=${limit}&offset=${offset}`)
  return (res as { posts: FeedPost[] }).posts
}

export async function createPost(data: {
  text?: string
  media_key?: string
  media_type?: string
}): Promise<FeedPost> {
  return apiRequest('/api/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<FeedPost>
}

export async function deletePost(postId: number): Promise<void> {
  await apiRequest(`/api/posts/${postId}`, { method: 'DELETE' })
}

export async function uploadPostMedia(file: File): Promise<{ media_key: string; media_type: string }> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest('/api/posts/upload', { method: 'POST', body: form }) as Promise<{ media_key: string; media_type: string }>
}

export async function toggleLike(postId: number): Promise<{ liked: boolean; likes_count: number }> {
  return apiRequest(`/api/posts/${postId}/like`, { method: 'POST' }) as Promise<{ liked: boolean; likes_count: number }>
}

export async function getComments(postId: number, limit = 50, offset = 0): Promise<FeedComment[]> {
  const res = await apiRequest(`/api/posts/${postId}/comments?limit=${limit}&offset=${offset}`)
  return (res as { comments: FeedComment[] }).comments
}

export async function addComment(postId: number, text: string): Promise<FeedComment> {
  return apiRequest(`/api/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }) as Promise<FeedComment>
}

export async function deleteComment(postId: number, commentId: number): Promise<void> {
  await apiRequest(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' })
}

export async function toggleRepost(postId: number): Promise<{ reposted: boolean; reposts_count: number }> {
  return apiRequest(`/api/posts/${postId}/repost`, { method: 'POST' }) as Promise<{ reposted: boolean; reposts_count: number }>
}

export async function toggleSave(postId: number): Promise<{ saved: boolean }> {
  return apiRequest(`/api/posts/${postId}/save`, { method: 'POST' }) as Promise<{ saved: boolean }>
}

export async function getSavedPosts(): Promise<FeedPost[]> {
  const res = await apiRequest('/api/posts/saved')
  return (res as { posts: FeedPost[] }).posts
}

export async function getUserFeedStats(userId: number): Promise<{ posts_count: number; total_likes: number }> {
  return apiRequest(`/api/feed/user/${userId}/stats`) as Promise<{ posts_count: number; total_likes: number }>
}
