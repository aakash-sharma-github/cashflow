// src/types/index.ts

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  push_token: string | null
  created_at: string
  updated_at: string
}

export interface Book {
  id: string
  name: string
  description: string | null
  color: string
  currency: string
  owner_id: string
  created_at: string
  updated_at: string
  // Computed fields (joined)
  member_count?: number
  balance?: number
  cash_in?: number
  cash_out?: number
  role?: MemberRole
}

export type MemberRole = 'owner' | 'member'

export interface BookMember {
  id: string
  book_id: string
  user_id: string
  role: MemberRole
  joined_at: string
  // Joined
  profile?: Profile
}

export type EntryType = 'cash_in' | 'cash_out'

export interface Entry {
  id: string
  book_id: string
  user_id: string
  amount: number
  type: EntryType
  note: string | null
  entry_date: string
  created_at: string
  updated_at: string
  // Joined
  profile?: Pick<Profile, 'id' | 'email' | 'full_name'>
}

export type InvitationStatus = 'pending' | 'accepted' | 'rejected'

export interface Invitation {
  id: string
  book_id: string
  inviter_id: string
  invitee_email: string
  invitee_id: string | null
  status: InvitationStatus
  created_at: string
  updated_at: string
  // Joined
  book?: Pick<Book, 'id' | 'name' | 'color'>
  inviter?: Pick<Profile, 'id' | 'email' | 'full_name'>
}

// Form types
export interface EntryFormData {
  amount: string
  type: EntryType
  note: string
  entry_date: Date
}

export interface BookFormData {
  name: string
  description: string
  color: string
  currency: string
}

// Filter types
export type EntryFilter = 'all' | 'cash_in' | 'cash_out'

// API response types
export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
