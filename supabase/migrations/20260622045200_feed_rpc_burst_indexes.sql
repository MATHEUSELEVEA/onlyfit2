-- Support feed_home_posts_page under burst load.
-- These indexes match the function's follower/status lookups and recommendation joins.

begin;

create index if not exists idx_creator_follows_follower_status_creator
  on public.creator_follows (follower_id, status, creator_id);

create index if not exists idx_creator_profiles_category
  on public.creator_profiles (category)
  where category is not null and category <> '';

create index if not exists idx_posts_public_creator_published
  on public.posts (creator_id, published_at desc, id desc)
  where coalesce(visibility, 'public') = 'public';

commit;
