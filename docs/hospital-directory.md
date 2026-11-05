# Sylhet Division hospital directory

CIVIS now carries a real directory of the facilities in Bangladesh's official
DGHS Health Facility Registry for Sylhet Division, with nearby search,
district/upazila/type filters, department contacts and direct calling.

This document records exactly what is real, what is not, and why.

---

## 1. Where the data comes from

**Source:** DGHS Health Facility Registry —
<https://hris.mohfw.gov.bd/public/facility-registry/>

The public page renders its table from a server-side DataTables endpoint. The
importer calls the same endpoint the page does, with the same parameters, and
writes the result into CIVIS's own SQLite database.

```
recordsTotal (national)   39,447
Sylhet Division matched    2,228
Written                    2,227   (1 row had no usable identifier)
Contacts written           1,554
```

Imported by district:

| District | Facilities |
| --- | --- |
| Sylhet | 745 |
| Sunamganj | 508 |
| Habiganj | 487 |
| Moulvibazar | 485 |
| *(district not recorded by the source)* | 2 |

Fields retained per facility: official facility id, English name, Bangla name,
facility code, agency, facility type (source wording **and** a normalised
category), ownership, division, district, city corporation, upazila, published
email, published mobile number, active flag, source URL, import timestamp.

Run it again at any time:

```bash
npm run hospitals:import
```

The importer is idempotent: it upserts on `(source, source_id)`, so a re-run
refreshes names and numbers instead of duplicating rows. A dry run writes
nothing:

```bash
node scripts/import-hospital-registry.mjs --dry --pages 1
```

### Why `division_id` is not used

The endpoint accepts a `division_id` parameter, but it is not applied as a
filter — passing it returns the whole country. The importer therefore scopes
with the search term the page itself uses (`Sylhet`), then re-checks
`division_name === 'Sylhet'` on every row before writing. That second check is
why the 33,500 national rows from an early attempt were pruned rather than
kept.

---

## 2. Coordinates: deliberately absent

The registry publishes no latitude or longitude, and the facility profile pages
do not contain any either. So:

- `lat` / `lng` are **NULL** for all 2,227 records.
- `location_status` is `unavailable`.
- Nothing is placed at an invented or interpolated coordinate.

This is the behaviour the brief asks for: *"For facilities without precise
coordinates, retain their official directory listing and mark their map
coordinates as unavailable until verified. Never place hospitals at invented
coordinates."*

Two consequences, stated plainly:

1. **The regional map initially has no pins.** Facilities appear in list view;
   `withCoordinates` is 0. Map view says so instead of showing an empty canvas
   with no explanation.
2. **Nearby mode returns nothing** until coordinates exist, because a distance
   search without a coordinate is not a distance search. The existing
   OpenStreetMap/Photon facility finder in the Emergency Center is untouched and
   still provides real nearby results, because those records *do* have
   coordinates.

### Adding coordinates

Two supported paths, both deliberate:

```bash
# Opt-in: approximate from OpenStreetMap via Nominatim, marked 'approximate'
node scripts/import-hospital-registry.mjs --geocode
```

That path is off by default, rate-limited to one request per second, and sets
`location_status = 'approximate'` so the UI never presents an approximation as
verified. Roughly 2,200 lookups at 1.1 s each is ~40 minutes, and every result
should be reviewed.

The other path is manual: import a CSV/GeoJSON keyed by facility id and set
`lat`, `lng`, `location_status = 'verified'`.

---

## 3. Two search modes

### Nearby hospitals

- Requires an actual device fix; the mode requests one and says plainly when it
  cannot get it.
- Radii: 2, 5, 10, 25, 50 km.
- Distance-sorted using haversine over a bounding-box pre-filter, so the index
  on `(lat, lng)` does the narrowing.
- Only facilities with a real coordinate can appear.

### All Sylhet Division

- Every imported record, whether or not it has a coordinate.
- Filters: district, upazila (dependent on district), facility type, ownership,
  free-text search across name, Bangla name, upazila, district and type.
- Paginated at 24 per page, with the true matching total and the dataset's
  import date always visible.
- Administrative offices are excluded by default so "hospitals" does not
  silently include civil surgeon offices. `includeOffices` is available in the
  query layer.

### Facility categories

The source's own wording is preserved in `facility_type`; a normalised
`facility_category` drives filtering:

medical college · district/general hospital · upazila health complex · union
health centre · community clinic · hospital · specialised · clinic · diagnostic
centre · dental · administrative office · ambulance service · other.

A clinic or diagnostic centre is never presented as a full-service hospital.

---

## 4. Contacts and calling

### What authorises a Call button

Only a row in `registry_contacts` produces a call action. No number is derived,
formatted from the facility name, or reused from reception for every department.

Each contact stores: department code and name, group, phone, E.164 form,
operating hours, contact type, source, verification status, last verified date
and the user who last updated it.

`verification_status` has three values, and the UI distinguishes all three:

| Value | Shown as |
| --- | --- |
| `registry` | "Official registry number — not independently verified by CIVIS" |
| `verified` | "Verified" + date |
| `unverified` | "Reported — not verified" |

The 1,554 imported numbers are `registry` contacts on the **general** line. No
department-specific numbers were imported, because the registry publishes none.
The profile therefore shows "No published contact number is available" or a
single general contact — never a fabricated ICU desk number.

`telHref()` only returns a `tel:` target when the number resolves to a valid
Bangladesh pattern; otherwise the button is replaced with "No dialable number".
Copy-to-clipboard is available for every number.

### Publishing a contact

`POST /api/hospitals/registry/[id]/contacts` — administrators and *approved*
authority accounts only. An unapproved authority organisation is rejected on the
server by the existing `authorize()` guard, whatever the client renders.

`DELETE /api/hospitals/registry/[id]/contacts?department=<code>` removes one.

The directory UI shows the form only when the signed-in user is allowed to use it.

---

## 5. Availability is separate, and stays honest

The registry says nothing about beds or services. Those remain in the existing,
unchanged tables:

- `hospital_wards` — beds, admission status
- `hospital_services` — emergency department, ambulance, blood bank, imaging, etc.
- Both only ever hold rows from a verified organisation, attributed to a named
  user.

Registry listing ≠ operating ≠ verified contact ≠ confirmed bed ≠ confirmed
service. These are five separate states and the UI never merges them.

Every facility panel also carries:

> Current bed availability has not been confirmed through CIVIS. Please contact
> the hospital directly to confirm availability before travelling.

---

## 6. Files

```
lib/hospitals/registry.sql                  registry schema (3 tables)
lib/hospitals/registry.ts                   search, profile, contacts, phone rules
scripts/import-hospital-registry.mjs        DGHS importer
app/hospitals/page.tsx                      directory route
components/hospitals/hospital-directory.tsx list, filters, profile, admin form
components/hospitals/hospital-map.tsx       regional map (coordinate-only pins)
app/api/hospitals/registry/route.ts         search
app/api/hospitals/registry/[id]/route.ts    profile + contacts
app/api/hospitals/registry/[id]/contacts    publish / remove a contact
```

`lib/db.ts` now applies `registry.sql` alongside the other schemas. No existing
table was altered.

Navigation gains **Hospitals**; the Emergency Center header links to the
directory.

---

## 7. Verification performed

- `npx tsc --noEmit` — clean
- `next build` (isolated `.build-check`) — clean
- `GET /hospitals` — HTTP 200
- `GET /api/hospitals/registry?mode=region` — real records, correct shape
- `?district=Sylhet&category=medical_college` — returns Parkview Medical College
- `?mode=nearby` with no coordinates — empty set plus an explanatory message
- `GET /api/hospitals/registry/<id>` — facility + contacts
- `POST .../contacts` while signed out — 401
- Import: 2,227 facilities, 1,554 contacts, 4 districts populated

Not verified: the rendered directory was not viewed in a browser, and no
signed-in test of the administrator contact form was run (it requires a session
and an approved organisation).

---

## 8. Limitations

1. **No coordinates.** The source has none. Until an operator imports or
   reviews coordinates, the regional map is empty and nearby mode returns
   nothing. This is a data gap, not a bug.
2. **No department numbers.** Only 1,554 general lines exist. ICU, blood bank
   and other department contacts must be published through the admin form.
3. **No point-in-polygon administrative lookup.** Identifying
   division/district/upazila from a GPS fix needs boundary polygons, which this
   repository does not ship. Nearest-known-place matching would misidentify
   users near district borders, so it is not presented as authoritative.
4. **SQLite, not PostgreSQL/PostGIS.** CIVIS keeps its existing single-file SQLite
   layer. `bbox` + index + haversine is the equivalent of `ST_DWithin`; switching
   the datastore would rewrite the whole application.
5. **Sylhet Division only.** The importer scopes to one division by design.
   Additional divisions need their own scoped run; the query layer already
   filters on `division`.
6. **Registry numbers are not call-tested.** They are labelled as registry
   numbers. CIVIS does not claim a call succeeded because a dialer opened.
