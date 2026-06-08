-- 0045 — Passion-Limit aufheben.
--
-- Das 5-Passion-Limit pro Person (eingeführt in 0026 als Trigger) wird
-- entfernt. Passions sollen fokussiert bleiben (nur echte Leidenschaften),
-- aber ohne harte Obergrenze — wenn es mehr sind, dürfen es mehr sein.
-- Idempotent: drop trigger/function if exists.

drop trigger if exists trg_person_passion_limit on public.passions;
drop function if exists public.enforce_person_passion_limit();
