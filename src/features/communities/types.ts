export interface Community {
  id: string;
  creator_id: string | null;
  name: string | null;
  slug: string | null;
  description: string | null;
  rules_text: string | null;
  image_url: string | null;
  visibility: 'public' | 'private';
  member_count: number | null;
  sports: string[];
  created_at: string | null;
}

/** Relação do usuário logado com uma comunidade. */
export type MembershipStatus = 'owner' | 'member' | 'pending' | 'banned' | 'none';

export interface CommunityMember {
  user_id: string;
  profile: MemberProfile | null;
}

export interface MemberProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface JoinRequest {
  id: string;
  requester_id: string;
  created_at: string;
  requester: MemberProfile | null;
}

export interface Topic {
  id: string;
  community_id: string;
  author_id: string | null;
  title: string | null;
  body: string | null;
  post_kind: string;
  is_pinned: boolean;
  is_closed: boolean;
  created_at: string | null;
  author: MemberProfile | null;
  reply_count: number;
}

export interface Reply {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: MemberProfile | null;
}

export interface PollOption {
  id: string;
  label: string;
  position: number;
  vote_count: number;
}
