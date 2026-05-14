-- Migration: add message_style preference to profiles
-- Controls the default tone for AI-drafted WhatsApp messages

alter table profiles
  add column if not exists message_style text
    not null default 'locker'
    check (message_style in ('locker', 'professionell'));
