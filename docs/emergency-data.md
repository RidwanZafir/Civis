# Emergency data and review

The emergency feature extends the project's existing file-backed SQLite database. Open `/emergency` to initialize the country catalog, incident categories, service definitions, and reviewed contacts. The schema is `lib/emergency/schema.sql`; facility discovery creates its related SQL tables in `lib/emergency/facilities.ts`.

The catalog contains all 249 ISO 3166-1 countries and territories. This release contains reviewed voice contacts for 36 countries, including the 27 EU member states. The remaining countries show a clear data gap and expose no unverified calling or texting shortcut. A verified number means the linked official publication was reviewed on 4 November 2026; no emergency service was contacted during validation. The interface does not claim that every specialty service has a direct emergency number.

The [ITU-T E.129 database](https://www.itu.int/net/itu-t/inrdb/e129_important_numbers.aspx) is an additional official member-state reporting source for operators expanding the directory. Its 1,160 entries include old allocations (some last updated in 2012), so a bulk import must be cross-checked against current national authority publications rather than automatically marked verified. Historical telephone entries provide no evidence of current SMS support.

Voice and SMS have separate fields, source records, eligibility, regional restrictions, and verification history. The United States national 911 entry does not enable SMS. A separately verified New York City entry enables 911 SMS only when that region is selected. UK emergencySMS and New Zealand 111 TXT require prior registration and eligible hearing/speech needs. France uses 114 for eligible SMS, independently of its voice numbers. Singapore's police SMS is **70999**, following the official 2024 change; SCDF fire/ambulance SMS is **70995**. Australia 000 has no direct SMS. Canadian Text-with-911 starts with a registered user's voice call, so the directory does not open an SMS composer for it. India ERSS 112 voice is verified; this release does not certify state-specific direct SMS coverage.

Short codes are local. The selected country's international dialing code is informational and must never be prefixed to an emergency short code. Manually selecting a country does not make a local emergency short code reach that country from abroad.

## Adding reviewed contacts

Use `node scripts/import-emergency-directory.mjs reviewed-contacts.json` from the project root after the catalog is initialized. The JSON must contain `reviewedBy`, a substantive `reviewNote`, and `contacts` using the `EmergencyContact` shape in `lib/emergency/types.ts`. Each voice contact requires an official HTTPS source and review date. Every SMS-enabled entry separately requires a number, eligibility, restrictions, official source, and review date. Unsupported SMS entries must have `number: null`.

The importer validates all records before opening a transaction, rejects unknown country/region IDs, duplicates, and incomplete SMS verification, then stores an attributed verification trail. Add a new reviewed region to the country's `regions_json` before importing regional contacts. Only trusted server operators should run this script. Do not bulk-import unreviewed web lists as verified contacts.

## Optional Supabase / PostgreSQL / PostGIS deployment

Apply `supabase/migrations/202611040001_emergency_directory.sql` to the Supabase project. It creates the normalized directory and facility tables, PostGIS geography/indexes, a distance-sorted `nearby_emergency_facilities` RPC, and public read-only row-level policies. Public clients cannot import or mark contacts verified.

Export local records with `node scripts/export-emergency-data.mjs export.json`. To upsert them into the migrated Supabase database, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the trusted server environment and run `node scripts/export-emergency-data.mjs --supabase`. Source tables are imported before their dependents. Never use a browser-exposed service-role key.

The local application's data access still uses SQLite. The migration and exporter provide the deployment data path; they do not silently switch the application backend, create a Supabase project, or claim a live PostgreSQL deployment. Deployments must wire their repository adapter to the migrated tables/RPC before enabling that backend. No Supabase credentials or running PostgreSQL database were available during this implementation, so the migration was not executed against a live server.

Nearby facilities come from actual OpenStreetMap data, cached in SQL with attribution. Missing photographs, addresses, opening hours, phone verification, and specialty classifications stay missing. A source listing is not a claim of available beds, ambulance capacity, or immediate treatment. Officially reviewed facility contact records can enrich map data without promoting an OSM phone tag to a verified telephone contact.

Run `node scripts/emergency-data-smoke.mjs` after initializing `/emergency` to check the country catalog, import validation, separate SMS provenance constraints, invalid-import atomicity, region validation, and PostgreSQL-compatible JSON export. The test uses an isolated temporary database and does not create a new operational verification in the application database.
