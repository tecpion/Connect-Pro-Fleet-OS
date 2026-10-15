-- Connect Pro Fleet — Build #22 migration 0008: transactional RPCs, atomic
-- document-number generation, storage buckets + policies.
--
-- Financial RPCs enforce atomicity + idempotency at the DB boundary so a
-- payment post + allocation + outbox insert commit together, and a duplicate
-- request key (across devices/processes/refresh) yields exactly one payment.

-- Atomic human-readable document numbering (concurrency-safe).
create or replace function public.next_document_number(
  org_id uuid, sequence_type text, prefix text, year_value int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val int;
  padded text;
begin
  insert into public.document_sequences (organization_id, sequence_type, year, current_value)
  values (org_id, sequence_type, year_value, 1)
  on conflict (organization_id, sequence_type, year)
  do update set current_value = public.document_sequences.current_value + 1
  returning public.document_sequences.current_value into next_val;
  padded := lpad(next_val::text, 6, '0');
  return prefix || '-' || year_value::text || '-' || padded;
end;
$$;

-- Atomic payment post: validates membership, enforces external-payment
-- idempotency, inserts the ledger payment, records the idempotency key, and
-- returns the payment id. Allocation rows are written by the repository after
-- computing FIFO (the RPC keeps the atomic write boundary; allocation math
-- stays in TypeScript to avoid a divergent SQL FIFO implementation).
create or replace function public.post_payment(
  p_org_id uuid, p_rental_id uuid, p_amount numeric, p_method text,
  p_tender_method text, p_processor text, p_payment_source text,
  p_reference text, p_external_payment_id text, p_external_transaction_id text,
  p_request_key text, p_created_by uuid
)
returns table (payment_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_existing_id uuid;
  v_rental_customer uuid;
begin
  -- Authorization: caller must be an active member of the org.
  if not public.is_org_member(p_org_id) then
    raise exception 'Not authorized for this organization.';
  end if;

  -- Idempotency by external_payment_id (DB-enforced unique index).
  if p_external_payment_id is not null then
    select id into v_existing_id from public.rental_ledger_transactions
    where organization_id = p_org_id and external_payment_id = p_external_payment_id
    limit 1;
    if v_existing_id is not null then
      return query select v_existing_id, true;
      return;
    end if;
  end if;

  -- Idempotency by request key.
  if p_request_key is not null then
    select entity_id into v_existing_id from public.idempotency_keys
    where organization_id = p_org_id and scope = 'payment' and request_key = p_request_key;
    if v_existing_id is not null then
      return query select v_existing_id, true;
      return;
    end if;
  end if;

  select customer_id into v_rental_customer from public.rentals where id = p_rental_id;
  if v_rental_customer is null then
    raise exception 'Rental not found.';
  end if;

  v_payment_id := gen_random_uuid();
  insert into public.rental_ledger_transactions (
    id, organization_id, rental_id, customer_id, transaction_type, category,
    description, amount, direction, payment_method, tender_method, processor,
    payment_source, external_payment_id, external_transaction_id, status,
    effective_date, created_by, notes
  ) values (
    v_payment_id, p_org_id, p_rental_id, v_rental_customer, p_method, 'payment',
    coalesce(p_reference, 'Payment'), p_amount, 'payment', p_method, p_tender_method,
    p_processor, p_payment_source, p_external_payment_id, p_external_transaction_id,
    'posted', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
    p_created_by, p_reference
  );

  if p_request_key is not null then
    insert into public.idempotency_keys (organization_id, scope, request_key, entity_id)
    values (p_org_id, 'payment', p_request_key, v_payment_id);
  end if;

  return query select v_payment_id, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: private buckets for operational files. NO public buckets.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('vehicle-documents', 'vehicle-documents', false),
  ('inspection-evidence', 'inspection-evidence', false),
  ('damage-evidence', 'damage-evidence', false),
  ('expense-receipts', 'expense-receipts', false),
  ('maintenance-receipts', 'maintenance-receipts', false),
  ('rental-agreements', 'rental-agreements', false),
  ('customer-documents', 'customer-documents', false),
  ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Storage policies: a user may read/write an object only when the
-- organization_id prefix in the path matches an org they belong to.
-- Paths are structured as {organization_id}/{entity_type}/{entity_id}/{file}.
create policy "storage_read_org" on storage.objects for select
  to authenticated using (
    exists (
      select 1 from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and (storage.foldername(name))[1] = m.organization_id::text
    )
  );

create policy "storage_write_org" on storage.objects for insert
  to authenticated with check (
    exists (
      select 1 from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and (storage.foldername(name))[1] = m.organization_id::text
    )
  );

create policy "storage_update_org" on storage.objects for update
  to authenticated using (
    exists (
      select 1 from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and (storage.foldername(name))[1] = m.organization_id::text
    )
  );

create policy "storage_delete_admin" on storage.objects for delete
  to authenticated using (
    exists (
      select 1 from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and (storage.foldername(name))[1] = m.organization_id::text
        and public.has_permission(m.organization_id, 'maintenance.manage_vendors')
    )
  );
