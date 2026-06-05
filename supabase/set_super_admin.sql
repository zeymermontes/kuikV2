-- Promote yourself to super_admin after signing up once through the app.
-- Run in the Supabase SQL editor. Replace the email with your account email.
update public.profiles
set role = 'super_admin'
where id = (select id from auth.users where email = 'zeymer@moca.app');
