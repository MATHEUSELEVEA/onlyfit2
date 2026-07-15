export type ChallengeFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'full';

export type ChallengeRunStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface ChallengeRun {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  category: string | null;
  start_at: string;
  end_at: string;
  status: ChallengeRunStatus;
  access_audience: 'public' | 'invite_only';
  requires_creator_approval: boolean;
  enrollment_closed: boolean;
  participant_limit: number | null;
  participant_count: number;
  completion_threshold: number;
  rules_json: { text?: string } | null;
  created_at: string;
}

export interface ChallengeTask {
  id: string;
  challenge_run_id: string;
  name: string;
  frequency: ChallengeFrequency;
  target_count: number;
  is_required: boolean;
  requires_proof: boolean;
  position: number;
}

/** Rascunho de tarefa no formulário (sem id enquanto não persistida). */
export interface ChallengeTaskDraft {
  id?: string;
  name: string;
  frequency: ChallengeFrequency;
  target_count: number;
  is_required: boolean;
  requires_proof: boolean;
}

export type ChallengeMembership = 'owner' | 'member' | 'pending' | 'none';

export interface ProgressTask {
  id: string;
  name: string;
  frequency: ChallengeFrequency;
  target_count: number;
  is_required: boolean;
  requires_proof: boolean;
  position: number;
  total_periods: number;
  current_period_index: number;
  current_period_start: string;
  current_period_end: string;
  done_in_period: number;
  done_today: number;
  done_total: number;
  last_completion_id: string | null;
}

export interface ProgressParticipant {
  status: string;
  progress_percent: number;
  streak_count: number;
  completion_count: number;
  joined_at: string;
  completed_at: string | null;
  metadata: {
    best_streak?: number;
    adherence?: number;
    on_track?: boolean;
    due_units?: number;
    done_units?: number;
    total_units?: number;
  } | null;
}

export interface MyChallengeProgress {
  run_id: string;
  start_date: string;
  end_date: string;
  today: string;
  days_total: number;
  days_remaining: number;
  completion_threshold: number;
  is_participant: boolean;
  participant: ProgressParticipant | null;
  tasks: ProgressTask[];
}

export interface RankingRow {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  progress_percent: number;
  adherence: number;
  streak_count: number;
  completion_count: number;
  status: string;
  joined_at: string;
}

export interface CollectiveProgress {
  participant_count: number;
  on_track_count: number;
  completed_count: number;
  total_completions: number;
  avg_progress: number;
}

export interface ChallengeProfile {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ChallengeFeedPost {
  id: string;
  user_id: string;
  log_type: string;
  title: string | null;
  text_content: string | null;
  evidence_url: string | null;
  logged_at: string;
  payload_json: { source?: string } | null;
  profile: ChallengeProfile | null;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
}

export interface ChallengeComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: ChallengeProfile | null;
}

export interface ChallengeJoinRequest {
  id: string;
  requester_id: string;
  request_message: string | null;
  created_at: string;
  requester: ChallengeProfile | null;
}

export interface ChallengeParticipantRow {
  user_id: string;
  status: string;
  progress_percent: number;
  joined_at: string;
  profile: ChallengeProfile | null;
}
