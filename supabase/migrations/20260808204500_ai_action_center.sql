-- PengePilot AI action center: debts and debt payments.

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_name text not null check (char_length(trim(person_name)) between 1 and 120),
  original_amount numeric(14,2) not null check (original_amount > 0),
  match_text text not null check (char_length(trim(match_text)) >= 3),
  note text,
  status text not null default 'active' check (status in ('active','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debts_user_status_idx on public.debts(user_id, status);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  source text not null default 'manual' check (source in ('manual','transaction')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists debt_payments_debt_date_idx on public.debt_payments(debt_id, payment_date desc);
create unique index if not exists debt_payments_transaction_unique on public.debt_payments(user_id, transaction_id) where transaction_id is not null;

alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

revoke all on table public.debts from anon;
revoke all on table public.debt_payments from anon;
grant select, insert, update, delete on table public.debts to authenticated;
grant select, insert, update, delete on table public.debt_payments to authenticated;

drop policy if exists "debts own rows" on public.debts;
create policy "debts own rows" on public.debts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "debt payments own rows" on public.debt_payments;
create policy "debt payments own rows" on public.debt_payments
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.debts d where d.id = debt_id and d.user_id = auth.uid())
    and (
      transaction_id is null
      or exists (select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())
    )
  );

create or replace function public.pp_touch_debt_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists debts_touch_updated_at on public.debts;
create trigger debts_touch_updated_at
before update on public.debts
for each row execute function public.pp_touch_debt_updated_at();

create or replace function public.pp_refresh_debt_status(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original numeric;
  v_status text;
  v_paid numeric;
begin
  select original_amount, status into v_original, v_status
  from public.debts where id = p_debt_id;
  if not found or v_status = 'cancelled' then return; end if;
  select coalesce(sum(amount),0) into v_paid from public.debt_payments where debt_id = p_debt_id;
  update public.debts set status = case when v_paid >= v_original then 'paid' else 'active' end where id = p_debt_id;
end;
$$;
revoke all on function public.pp_refresh_debt_status(uuid) from public;

create or replace function public.pp_debt_payment_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.pp_refresh_debt_status(old.debt_id);
    return old;
  end if;
  perform public.pp_refresh_debt_status(new.debt_id);
  if tg_op = 'UPDATE' and old.debt_id is distinct from new.debt_id then
    perform public.pp_refresh_debt_status(old.debt_id);
  end if;
  return new;
end;
$$;

drop trigger if exists debt_payments_refresh_status on public.debt_payments;
create trigger debt_payments_refresh_status
after insert or update or delete on public.debt_payments
for each row execute function public.pp_debt_payment_status_trigger();

create or replace function public.sync_debt_payments(p_debt_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt public.debts%rowtype;
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'Ikke logget ind'; end if;
  select * into v_debt from public.debts where id = p_debt_id and user_id = auth.uid();
  if not found then raise exception 'Gæld findes ikke eller tilhører ikke brugeren'; end if;
  if v_debt.status = 'cancelled' then return 0; end if;

  insert into public.debt_payments (debt_id, user_id, transaction_id, amount, payment_date, source, note)
  select v_debt.id, auth.uid(), t.id, abs(t.amount), t.transaction_date, 'transaction', 'Automatisk matchet via ' || v_debt.match_text
  from public.transactions t
  where t.user_id = auth.uid()
    and t.amount < 0
    and (
      position(lower(v_debt.match_text) in lower(coalesce(t.merchant,''))) > 0
      or position(lower(v_debt.match_text) in lower(coalesce(t.description,''))) > 0
    )
  on conflict (user_id, transaction_id) where transaction_id is not null do nothing;

  get diagnostics v_inserted = row_count;
  perform public.pp_refresh_debt_status(v_debt.id);
  return v_inserted;
end;
$$;
revoke all on function public.sync_debt_payments(uuid) from public;
grant execute on function public.sync_debt_payments(uuid) to authenticated;

create or replace function public.pp_match_transaction_to_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt_id uuid;
  v_matches integer;
begin
  if tg_op = 'UPDATE' then
    delete from public.debt_payments where transaction_id = new.id and source = 'transaction';
  end if;
  if new.amount >= 0 then return new; end if;

  select count(*), min(d.id::text)::uuid into v_matches, v_debt_id
  from public.debts d
  where d.user_id = new.user_id
    and d.status = 'active'
    and char_length(trim(d.match_text)) >= 3
    and (
      position(lower(d.match_text) in lower(coalesce(new.merchant,''))) > 0
      or position(lower(d.match_text) in lower(coalesce(new.description,''))) > 0
    );

  if v_matches = 1 and v_debt_id is not null then
    insert into public.debt_payments (debt_id, user_id, transaction_id, amount, payment_date, source, note)
    values (v_debt_id, new.user_id, new.id, abs(new.amount), new.transaction_date, 'transaction', 'Automatisk matchet bankoverførsel')
    on conflict (user_id, transaction_id) where transaction_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_match_debt_payment on public.transactions;
create trigger transactions_match_debt_payment
after insert or update of description, merchant, amount, transaction_date on public.transactions
for each row execute function public.pp_match_transaction_to_debt();
