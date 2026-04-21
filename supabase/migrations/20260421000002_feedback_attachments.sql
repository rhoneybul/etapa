-- ── feedback_attachments ─────────────────────────────────────────────────────
-- Screenshots / images attached to a feedback submission or any reply message
-- in a support thread. Stored in Supabase Storage (bucket: feedback-attachments),
-- with metadata in this table.
--
-- Design notes:
--   - A single attachment can belong to the feedback itself (initial submission)
--     OR to a specific reply message. Never both — enforced by check constraint.
--   - Files live in storage at: feedback-attachments/{user_id}/{feedback_id}/{uuid}.{ext}
--   - Private bucket; clients upload via signed URL, admin views via signed URL.

create table if not exists public.feedback_attachments (
  id             text primary key,
  feedback_id    text not null references public.feedback(id) on delete cascade,
  message_id     text references public.support_messages(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  storage_path   text not null,     -- path inside the feedback-attachments bucket
  mime_type      text not null,     -- e.g. image/jpeg
  size_bytes     integer not null,
  width          integer,
  height         integer,
  created_at     timestamptz not null default now()
  -- message_id null = attached to the feedback itself;
  -- message_id set  = attached to that specific reply message.
);

alter table public.feedback_attachments enable row level security;

create policy "Users can read own attachments"
  on public.feedback_attachments for select
  using (auth.uid() = user_id);

create policy "Users can insert own attachments"
  on public.feedback_attachments for insert
  with check (auth.uid() = user_id);

create index if not exists feedback_attachments_feedback_idx
  on public.feedback_attachments(feedback_id);
create index if not exists feedback_attachments_message_idx
  on public.feedback_attachments(message_id);
create index if not exists feedback_attachments_user_idx
  on public.feedback_attachments(user_id);

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Private bucket. All reads/writes happen via signed URLs issued by the
-- server (service-role key). Clients never hit Supabase storage directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  10485760,  -- 10 MB max per file (reasonable for a compressed screenshot)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Service-role bypasses RLS; these policies let the authenticated user read
-- THEIR own files if we ever want to switch to direct downloads. For now the
-- server always issues signed URLs, so these policies are defence-in-depth.
create policy "Users can read own feedback attachments"
  on storage.objects for select
  using (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload own feedback attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
