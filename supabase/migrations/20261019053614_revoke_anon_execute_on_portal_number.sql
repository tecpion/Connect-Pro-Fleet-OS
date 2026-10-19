-- Harden next_portal_request_number: it is only meant to be called by
-- authenticated staff/portal code. Revoke the default PUBLIC/anon EXECUTE
-- grant so anonymous callers cannot invoke it.
revoke execute on function public.next_portal_request_number(uuid) from public, anon;