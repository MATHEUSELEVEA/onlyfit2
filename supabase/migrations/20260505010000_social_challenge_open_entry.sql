set check_function_bodies = off;

create or replace function public.user_matches_challenge_audience(run_id UUID, actor_id UUID)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.challenge_runs cr
    where cr.id = run_id
      and (
        cr.creator_id = actor_id
        or (
          cr.access_audience = 'public'::public.challenge_access_audience
        )
        or (
          cr.access_audience = 'students'::public.challenge_access_audience
          and exists (
            select 1
            from public.coach_relationships rel
            where rel.coach_id = cr.creator_id
              and rel.student_id = actor_id
              and rel.status = 'active'
          )
        )
        or (
          cr.access_audience = 'subscribers'::public.challenge_access_audience
          and public.user_is_challenge_subscriber(cr.id, actor_id)
        )
        or (
          cr.access_audience = 'buyers'::public.challenge_access_audience
          and public.user_has_challenge_payment_access(cr.id, actor_id)
        )
        or (
          cr.access_audience = 'invite_only'::public.challenge_access_audience
          and exists (
            select 1
            from public.challenge_join_requests cjr
            where cjr.challenge_run_id = cr.id
              and cjr.requester_id = actor_id
              and cjr.status = 'approved'
          )
        )
      )
  );
$$;
