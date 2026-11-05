# CIVIS

**See what's broken. Make it better.**

A community-powered platform for reporting, verifying and tracking public infrastructure problems:
broken streetlights, dangerous potholes, faded pedestrian crossings, blocked drains, exposed wiring
and unsafe public facilities.

---

## Running it

```bash
npm install
npm run dev
```

Open the URL printed by Next.js (usually http://localhost:3000). The database and demonstration
dataset are created automatically on the first request — there is no migration step and no external
service to configure.

### Emergency Center upgrade

Open `/emergency` from the navigation. CIVIS now offers incident quick actions, independently
verified voice/SMS contacts, editable native emergency texts, permission-based GPS and country
lookup, location sharing, and nearby hospital discovery with list, MapLibre 2D, and React Three
Fiber 3D views. Calls use `tel:` and eligible SMS uses `sms:`; users complete the call or send in
their own device apps. Map failures leave contacts and the facility list available.

The country catalog covers 249 countries and territories. Reviewed voice contacts currently cover
36 countries; countries without reviewed contacts clearly show the gap. SMS is enabled only for
reviewed contacts and eligible regions, including registration restrictions. See
[emergency data and operator imports](docs/emergency-data.md) for sources, review procedures,
and the optional Supabase/PostGIS migration and export path. This local app continues using SQLite.

Nearby facilities use Photon as the fast OpenStreetMap search index, with Nominatim as a
hospital/clinic fallback, while optional 3D outlines still use Overpass and road route previews
use OSRM. These require outbound network access. Set `CIVIS_PHOTON_URL`, `CIVIS_NOMINATIM_URL`,
`CIVIS_OVERPASS_URL`, or `CIVIS_ROUTING_URL` to use your own providers. Every live result is
persisted in SQLite; if a provider is unavailable, the finder shows previously stored facilities
with an explicit stale warning instead of an empty screen. Location search accepts city/address
queries or manual `latitude, longitude` when GPS is denied. Only independently reviewed hospital
numbers get a Call button. Missing source details and specialist capabilities are labeled rather
than inferred.

The reporting wizard now validates completed steps, waits for confirmed server upload responses,
supports image and video previews, retry/removal, preserves attachments across navigation, and
prevents concurrent submission. Server validation keeps MIME/signature, size/count, and ownership
checks. Images are limited to 8 MB and videos to 25 MB, up to six attachments total.

Run `npm test` for isolated real-handler upload/SQL integration, navigation readiness, native URI
and rendered markup checks, directory import constraints, source integrity, cache, and routing
checks. Browser/device acceptance and live provider responses need separate verification.

Inter is bundled locally under its SIL Open Font License, preserving the existing typeface and
subsets without a Google Fonts build request. For an isolated Windows production check:

```powershell
$env:CIVIS_BUILD_DIR = '.build-check'
npx next build --webpack
npx next start
```

Keep the same output-directory environment variable when starting that build. Default development
and builds still use `.next` when `CIVIS_BUILD_DIR` is unset. See
[validation evidence and remaining device checks](docs/emergency-validation.md).

```bash
npm run build && npm start   # production build
```

### Demonstration accounts

All accounts share the password `CivisDemo!23`. They exist so the role-based workspaces can be
explored; the sign-in screen lists them behind one click.

| Role | Email | Can do |
| --- | --- | --- |
| Citizen | `citizen@civis.demo` | Report, support, follow, comment, track own reports |
| Moderator | `moderator@civis.demo` | Review evidence, verify/reject, inspect duplicate signals and flags |
| Authority | `authority@civis.demo` | Accept and respond to incidents assigned to Roads & Traffic Engineering |
| Administrator | `admin@civis.demo` | Manage users, roles, departments, suspensions; read the audit log |

Every row created by the seeder carries `is_demo = 1` and is labelled **Demo** or
**Demonstration record** in the interface. No seeded record describes a real incident, and no seeded
authority response is attributed to a real department account.

---

## Stack and the one deliberate deviation

| Layer | Used |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 with a token layer in `app/globals.css` |
| 3D city | three.js, `@react-three/fiber` v9, `@react-three/drei` |
| Maps | MapLibre GL JS with a keyless OpenFreeMap dark vector basemap (OpenStreetMap data; Esri dark raster fallback) |
| Charts | Recharts |
| Motion | Framer Motion, CSS transitions |
| Data | **SQLite** via `node-sqlite3-wasm` (file-backed, no native build) |

The brief specified Supabase/PostGIS; this deployment intentionally runs **without any external
backend**, so it starts with zero credentials. The data layer is real SQL with real constraints,
indexes, a `verified_reports` view and server-side role checks — not a mock. Geographic filtering uses
a bounding-box index plus exact haversine distance in `lib/repo.ts`, which is the one piece that would
become `ST_DWithin` on PostGIS.

Why the WASM driver: `better-sqlite3` has no prebuilt binary for Node 20.20 on win32 and its
`node-gyp` build fails on this machine. `node-sqlite3-wasm` needs no toolchain, keeps a real `.db`
file on disk, and exposes a synchronous API.

### Where things live

```
app/                     routes and API handlers
  api/reports/           list/create, detail, support, follow, comments, flag, staff actions
  api/auth/              sign-up, sign-in, sign-out, verify, forgot, reset, profile
  api/stats/             statistics + CSV export
  api/admin/users        role, department and suspension management
components/
  city/                  the interactive 3D city
  map/                   MapLibre exploration workspace + location picker
  staff/                 authority, moderation and admin interfaces
  report/, incident/     reporting wizard, incident page interactions
lib/
  schema.sql             full relational schema, indexes, verified_reports view
  seed.ts                demonstration dataset
  auth.ts                session cookies, RBAC guards, audit + notification helpers
  repo.ts                read layer: filters, search, statistics
```

---

## How the trust model is enforced

- **Verification is not status.** `reports.verification` (`unverified → pending_review →
  community_verified → officially_confirmed`, or `rejected`) is separate from `reports.status`
  (`submitted → under_review → community_verified → authority_notified → in_progress → resolved`).
- **Public statistics use the `verified_reports` view.** Every headline number is computed from it, so
  an unverified submission cannot enter a safety statistic even by mistake.
- **Official responses are constrained, not promised.** `POST /api/reports/[id]/manage` with
  `action: "respond"` requires the caller to be an `authority` account **assigned to that incident**.
  The department is taken from the assignment, and the response row stores the acting user.
- **Everything is attributed.** Status history entries and audit-log rows record the actor id, role and
  display label plus a timestamp.
- **Duplicate detection is real.** Creating a report checks verified reports in the same category
  within 120 m over 30 days and returns a 409 with the existing report, unless the reporter explicitly
  confirms it is a different problem.
- **Role checks run on the server.** Pages also hide what a role cannot use, but the API is the
  boundary: citizen endpoints require a session, moderation requires moderator/admin, and authority
  actions require a matching assignment.
- **Sessions** are random 32-byte tokens in an httpOnly, SameSite=Lax cookie; the database stores only
  the SHA-256 hash. Passwords use scrypt with a per-user salt.

## Privacy

- Anonymous reports hide the reporter's name publicly; the reporter link is retained server-side in the
  restricted trail for abuse investigation.
- Uploads are validated by MIME type **and** magic bytes, capped at 8 MB for images / 25 MB for videos
  and 6 files, with images compressed in the browser before upload, and served from `data/uploads`
  through `/api/media/[file]` — never from a
  public directory.
- Exports contain aggregate counts only.
- Account deletion removes the profile, email and sessions; reports remain in the public record without
  identity attached.

## Notifications and email

In-app notifications are fully implemented: a notification centre with categories, search, unread counts,
mark-one/mark-all, deep links and a server-sent event stream that updates the badge without a page
refresh. Alerts are targeted by role and organisation — moderators never inherit an authority's incident
feed, and officers only see reports assigned to them. Every alert is a database row, so it survives a
sign-out and a missed toast loses nothing. `dedupe_key` makes repeated realtime deliveries and retried
requests idempotent.

Browser notifications are opt-in from **Settings → Browser notifications**; permission is requested
there, never at sign-in, and a missed system notification never removes the stored alert.

Email delivery is **not configured**, and the app says so instead of pretending: verification and reset
links are returned in-app with a "Demo mode — no email provider connected" notice. To enable real
email, add a provider (for example Knock orchestration in front of Postmark/SendGrid) and change
`DEMO_MODE.emailDelivery` in `lib/constants.ts`, then send from the route handlers under
`app/api/auth/` instead of returning the URL.

## Things deliberately left out

- AI classification. The brief allows it as assistance only; nothing here claims to classify images,
  and no AI output can set a verification state.
- Native PostGIS. See the data-layer note above.
- Supabase Realtime / websockets. This deployment has no Supabase project; live delivery uses a
  same-origin server-sent event stream over the local SQLite database instead.
- Email delivery. No email provider is configured, so email notifications stay off and the UI says so.

## Verification performed

- `npx tsc --noEmit` clean.
- Routes exercised over HTTP against the dev server: landing, explore, community, incident detail,
  report wizard, insights, printable report, auth screens, all four role workspaces, and the JSON APIs.
- The 3D scene and map are WebGL/MapLibre client surfaces; they require a browser to render.

## Dual-portal upgrade (organisations, routing, verification)

`departments` is the organisation table. Verification lives in
`departments.verification_status` and every application is recorded in
`department_applications`; staff belong to an organisation through
`department_members` with one of `org_admin`, `officer`, `reviewer`.

**Access control.** `authorize()` denies every authority action with HTTP 403
while the account's organisation is not `approved`, so an unverified
registration cannot reach the authority portal or API even if the UI is bypassed.

**Routing.** On creation a report is matched to an approved organisation by
category (`CATEGORY_ORG_TYPES`) and geography — the organisation's jurisdiction
radius from its office coordinates, or an explicit district match. A match writes
`authority_assignments`, sets `routing_state = 'delivered'` and notifies the
organisation's members. No match leaves the report in the central queue as
`awaiting_assignment`, notifies platform administrators, and tells the reporter
plainly that no authority has received it.

**Verification workflow.** `POST /api/authorities/register` creates a `pending`
organisation, an `org_admin` account and an application. Super administrators
review it at `/admin/authorities` (`GET`/`PATCH /api/admin/applications`) and can
approve, reject, request information or suspend. Decisions are audited and the
applicant is notified.

**Notifications.** The global navigation includes a persistent notification bell for signed-in
users. It polls `GET /api/notifications` every 30 seconds while the tab is visible, refreshes on
focus, shows the unread count, supports mark-one/mark-all through `POST /api/notifications`, and
links report notifications to `/incidents/[id]` and authority applications to
`/admin/authorities`. Submitting an authority registration now creates a persistent notification
for every active administrator; the API reports the actual number written.

## Map: local search, labels and facilities

- Basemap: OpenFreeMap dark vector style — no API key, no watermark, labels from
  the vector tiles at every zoom level. Esri dark raster is the fallback.
- Language: the `EN` / `বাংলা` control rewrites the `text-field` of every symbol
  layer to `name:bn` with a `name` fallback. Layers are not rebuilt.
- Search: `/api/places` queries the local `places` table (Bangladesh divisions and
  district headquarters, plus the demonstration city's neighbourhoods). No
  external geocoder is called; a miss is reported as a miss.
- Facilities: `/api/map/facilities?bbox=…&types=…` returns only the facilities in
  the current viewport for the enabled types. All seeded facilities are marked
  `is_demo`.

## Notification centre (staff and citizens)

Schema: `notifications` gained `category`, `priority`, `action_url`, `blood_request_id`,
`organisation_id`, `recipient_role` and `dedupe_key` (unique index, partial). Older rows are
categorised on read from their `type`, so history is preserved rather than backfilled by hand.

- `lib/notifications.ts` owns targeting (`adminIds`, `moderatorIds`, `organisationUserIds`,
  `organisationAdmins`), dedupe-aware inserts, filtered listing and unread counts by category.
- `GET /api/notifications?filter=&q=` returns the filtered feed plus unread counts;
  `POST` marks one or all as read. `GET /api/notifications/stream` is the SSE change feed
  (4 s signature check, 15 s heartbeat, closed on abort).
- `/dashboard/notifications` is the full centre with tabs (All, Unread, Reports, Emergencies,
  Blood requests, Authority updates, Moderation, System) and search.
- Producers: report routing (`report_assigned`, `routing_failed`), officer assignment
  (`report_assigned_to_you`, `officer_assigned`), authority applications, hospital link reviews,
  blood requests and their moderation, and existing report/comment/status events.

## Nearby hospitals

The finder (`/emergency#nearby-hospitals`) previously depended on GPS alone and had no way to
distinguish a hospital with no report from one that was full. Now:

- a district/city picker backed by the local `places` table works with location permission denied,
  and GPS remains optional;
- results are grouped by **reported availability** vs **availability unknown** with an explicit
  filter, so a hospital without a recent report is shown rather than hidden;
- stale reports are labelled, bed counts are withheld when a report is older than an hour, and a
  failed availability request offers a retry instead of a silent blank panel;
- the availability endpoint (`/api/hospitals/availability`) still returns only reports published by
  verified health organisations; nothing is invented when no organisation has reported.

## Blood Connect

`/blood` is the public feed and map, `/blood/new` publishes a request, `/blood/donor` manages a
donor profile, `/blood/[code]` is the request and `/moderation/blood` is the review queue.

- Tables: `blood_requests`, `blood_donors`, `blood_interests`, `blood_request_history`,
  `blood_request_verification`, `blood_request_notifications`, `blood_abuse_reports`.
- A new request starts as `pending_verification`; donors are alerted only after a moderator
  verifies it. Matching uses ABO/RhD compatibility per component (`lib/blood/compat.ts`; plasma is
  the reverse of red cells), the donor's own availability, consent and radius, and one alert per
  donor per request.
- Contact details are not public. A donor offer shows initials only; the chosen contact method is
  shared after the requester accepts. Public request cards mask the patient name and never expose a
  phone number.
- Closing or fulfilling a request stops matching alerts; requests expire automatically.
- Compatibility is reference data only. The UI states that eligibility, screening and compatibility
  must be confirmed by the hospital or licensed blood bank.

## Verification performed for this upgrade

- `npx tsc --noEmit` clean; `npm run build` clean.
- `node scripts/blood-smoke.mjs` — 37/37 checks against the running server on a real database:
  donor registration, request creation and duplicate rejection, public redaction, role gates,
  moderator verification and donor matching, donor interest, contact release only after acceptance,
  fulfilment removing the request from the open feed, notification filters/mark-read and the SSE
  stream.
#   C i v i s  
 #   C i v i s  
 