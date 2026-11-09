-- create_organization calls gen_random_bytes(), which lives in the extensions
-- schema; with search_path = public it failed with 42883 (function not found),
-- so nobody could create an organization.
alter function public.create_organization(text) set search_path = public, extensions;
