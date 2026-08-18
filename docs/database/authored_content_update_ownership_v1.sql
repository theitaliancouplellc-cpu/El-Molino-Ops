-- El Molino Ops: preserve authored-content ownership across UPDATE operations.
--
-- The existing policies correctly constrained the row being edited in USING, but
-- their WITH CHECK clauses validated only location/room scope. A non-manager who
-- owned a row could therefore attempt to rewrite its author/uploader identity while
-- keeping the row in the same location. Enforce the same ownership invariant on the
-- post-update row while preserving manager/admin authority.

drop policy if exists comments_author_manager_update on public.comments;
create policy comments_author_manager_update
on public.comments
for update
to authenticated
using (
  location_id = public.current_location_id()
  and (
    author_user_id = auth.uid()
    or public.current_app_role() in ('admin','manager')
  )
)
with check (
  location_id = public.current_location_id()
  and (
    author_user_id = auth.uid()
    or public.current_app_role() in ('admin','manager')
  )
);

drop policy if exists discussion_messages_author_update on public.discussion_messages;
create policy discussion_messages_author_update
on public.discussion_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.discussion_rooms r
    where r.id = discussion_messages.room_id
      and r.location_id = public.current_location_id()
  )
  and (
    author_user_id = auth.uid()
    or public.current_app_role() in ('admin','manager')
  )
)
with check (
  exists (
    select 1
    from public.discussion_rooms r
    where r.id = discussion_messages.room_id
      and r.location_id = public.current_location_id()
  )
  and (
    author_user_id = auth.uid()
    or public.current_app_role() in ('admin','manager')
  )
);

drop policy if exists files_manager_update on public.files;
create policy files_manager_update
on public.files
for update
to authenticated
using (
  location_id = public.current_location_id()
  and (
    uploaded_by = auth.uid()
    or public.current_app_role() in ('admin','manager')
  )
)
with check (
  location_id = public.current_location_id()
  and (
    uploaded_by = auth.uid()
    or public.current_app_role() in ('admin','manager')
  )
);
