-- Optional PostgreSQL/Supabase deployment of the existing CIVIS emergency data.
-- The local credential-free app continues using SQLite until a deployment adapter is configured.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.official_data_sources (
  id text PRIMARY KEY, name text NOT NULL, url text NOT NULL CHECK(url LIKE 'https://%'),
  kind text NOT NULL, checked_at date NOT NULL
);
CREATE TABLE IF NOT EXISTS public.emergency_countries (
  code text PRIMARY KEY CHECK(length(code)=2), name text NOT NULL, flag text NOT NULL,
  dial_code text NOT NULL, regions_json jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS public.emergency_services (
  id text PRIMARY KEY, name text NOT NULL, description text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id text PRIMARY KEY,
  country_code text NOT NULL REFERENCES public.emergency_countries(code), region_code text,
  service_id text NOT NULL REFERENCES public.emergency_services(id),
  phone_number text NOT NULL CHECK(phone_number ~ '^\+?[0-9]{2,15}$'),
  voice_supported integer NOT NULL CHECK(voice_supported IN(0,1)), coverage text NOT NULL,
  verification_status text NOT NULL CHECK(verification_status IN('verified','unverified')),
  source_id text NOT NULL REFERENCES public.official_data_sources(id), last_verified_at date NOT NULL
);
CREATE INDEX IF NOT EXISTS emergency_contacts_country_region_idx ON public.emergency_contacts(country_code,region_code,service_id);
CREATE TABLE IF NOT EXISTS public.emergency_sms_contacts (
  contact_id text PRIMARY KEY REFERENCES public.emergency_contacts(id) ON DELETE CASCADE,
  supported integer NOT NULL DEFAULT 0 CHECK(supported IN(0,1)), sms_number text,
  eligibility_requirements text NOT NULL, regional_restrictions text NOT NULL,
  verification_status text NOT NULL CHECK(verification_status IN('verified','unverified')),
  source_id text REFERENCES public.official_data_sources(id), verified_at date,
  CHECK(supported=0 OR (sms_number IS NOT NULL AND sms_number ~ '^\+?[0-9]{2,15}$' AND source_id IS NOT NULL AND verified_at IS NOT NULL AND verification_status='verified'))
);
CREATE TABLE IF NOT EXISTS public.emergency_contact_verifications (
  id text PRIMARY KEY, contact_id text NOT NULL REFERENCES public.emergency_contacts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK(channel IN('voice','sms')), status text NOT NULL CHECK(status IN('verified','unverified')),
  source_id text NOT NULL REFERENCES public.official_data_sources(id), reviewed_at date NOT NULL, note text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.emergency_incident_categories (
  id text PRIMARY KEY, label text NOT NULL, category_group text NOT NULL,
  service_ids_json jsonb NOT NULL, guidance_json jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.emergency_facilities (
  id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL, source_url text NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.facility_locations (
  facility_id text PRIMARY KEY REFERENCES public.emergency_facilities(id) ON DELETE CASCADE,
  lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK(lng BETWEEN -180 AND 180), address text,
  location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography) STORED
);
CREATE INDEX IF NOT EXISTS facility_locations_geo_idx ON public.facility_locations USING gist(location);
CREATE TABLE IF NOT EXISTS public.hospital_details (
  facility_id text PRIMARY KEY REFERENCES public.emergency_facilities(id) ON DELETE CASCADE, payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.facility_contacts (
  facility_id text PRIMARY KEY REFERENCES public.emergency_facilities(id) ON DELETE CASCADE,
  phone text, verified integer NOT NULL DEFAULT 0 CHECK(verified IN(0,1)), source_url text, checked_at date,
  CHECK(verified=0 OR(phone IS NOT NULL AND source_url IS NOT NULL AND source_url LIKE 'https://%' AND checked_at IS NOT NULL))
);

-- Public discovery is read-only. Only trusted server operators with the service
-- role can import/review numbers and facility contact provenance.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['official_data_sources','emergency_countries','emergency_services','emergency_contacts',
    'emergency_sms_contacts','emergency_contact_verifications','emergency_incident_categories','emergency_facilities',
    'facility_locations','hospital_details','facility_contacts']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS emergency_public_read ON public.%I', table_name);
    EXECUTE format('CREATE POLICY emergency_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', table_name);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.nearby_emergency_facilities(
  p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 5000, p_kinds text[] DEFAULT NULL
) RETURNS TABLE(id text,name text,kind text,lat double precision,lng double precision,address text,
  distance_m double precision,details jsonb,phone text,phone_verified boolean,source_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public
AS $$
  SELECT f.id,f.name,f.kind,l.lat,l.lng,l.address,
    ST_Distance(l.location,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography),
    h.payload,c.phone,c.verified=1,f.source_url
  FROM public.emergency_facilities f JOIN public.facility_locations l ON l.facility_id=f.id
  LEFT JOIN public.hospital_details h ON h.facility_id=f.id
  LEFT JOIN public.facility_contacts c ON c.facility_id=f.id
  WHERE p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180
    AND p_radius_m BETWEEN 1 AND 50000 AND (p_kinds IS NULL OR f.kind=ANY(p_kinds))
    AND ST_DWithin(l.location,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography,p_radius_m)
  ORDER BY 7 LIMIT 250;
$$;
GRANT EXECUTE ON FUNCTION public.nearby_emergency_facilities(double precision,double precision,integer,text[]) TO anon,authenticated;
