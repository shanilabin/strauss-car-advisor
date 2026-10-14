-- Give the demo rep user the 'rep' role (app_metadata is server-side; users cannot edit it).
-- Run once in the Supabase SQL editor. The rep must sign out and in again to get a new token.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "rep"}'::jsonb
where email = 'rep@demo.local';

select email, raw_app_meta_data ->> 'role' as role
from auth.users
where email = 'rep@demo.local';
