# Emergency upgrade validation

Run `npm test` and `npx tsc --noEmit` from the workspace. The tests use temporary databases,
real local upload/report handlers, source fixtures and rendered React markup. They do not call
emergency services, send messages, transmit user GPS, or assert live hospital capacity.

| Requested scenario | Verified evidence | Remaining browser/device check |
| --- | --- | --- |
| Three photographs, Continue, Back | Completed-step validation; server uploads and SQL persistence of all three files | Click navigation and inspect all three previews on desktop and mobile |
| Change countries | Actual SQL directory and rendered links change between BD, US, GB, JP, FR, SG and other reviewed countries | Use country/region controls in a browser |
| Road Accident contacts | Incident maps to general, ambulance, police and fire contacts | Click the interactive incident card |
| CALL NOW | Valid local `tel:` links; no country prefix added to emergency short codes | Confirm phone app handoff on supported devices without placing a test emergency call |
| Verified SEND TEXT | Independent SMS provenance, registration/region gating, Android/Apple encoded editable body | Confirm composer content on iOS and Android; do not send a test emergency message |
| Unsupported SMS | BD/AU/CA/national-US voice-only; rendered unsupported SMS notice | Browser country selection |
| GPS and nearby hospitals | Photon-first facility search with Nominatim hospital/clinic fallback; parser, deduplication, persistence and stored-data outage tests; live Dhaka/Sylhet/Kolkata requests returned sourced facilities | Grant permission and confirm live provider results in the target browser/network |
| GPS denied and manual search | Manual city/address endpoint and coordinate entry; global query/country result and provider errors | Deny permission, search and choose a place |
| Hospital details/call/directions | Only reviewed hospital contacts are callable; source-only capabilities; route provider geometry and coordinate order | Select list/2D/3D markers and confirm directions handoff |
| 3D failure | Dynamic map boundaries/context-loss handling; contacts outside maps; list/2D controls and data error handling | Disable WebGL and interact with calls, text preparation and hospital list |
| Notification bell | Signed-in nav polls `/api/notifications`, shows unread count, mark-one/mark-all updates SQL, report/workspace links, authority-registration notifications for admins | Sign in as each role and confirm the count and links during live report/application activity |

Automated checks passed: 10 evidence/readiness checks, 13 actual upload/report/auth/storage
integration checks, 8 communication/rendered-interface/location checks, 11 facility/source/cache/SQL
checks, 5 directory/region/SMS/SQL checks, and isolated attributed import/export validation.
TypeScript and emergency UI design scans also pass. An isolated production webpack build with
`CIVIS_BUILD_DIR=.build-check` compiled successfully, generated all 28 static pages, and included
the emergency page and API routes. Subsequent build attempts after the final consent-copy and
coordinate-cache refinements hit Windows sandbox `EPERM` errors, including a fresh output
directory. Current source passes TypeScript and its regression checks. Failed incremental
attempts may have partially overwritten build output; run a new build before starting production.

The existing Inter fonts are now bundled locally with their
original Unicode subsets, identical font bytes and fallback metrics, under SIL OFL 1.1. This
removes the failed Google Fonts network request without changing the typeface.

A motion scanner's center-origin note is
intentional for incident cards rotating around their bottom center; these are not popovers.

The attempted native browser opening and local HTTP validation were blocked by automatic approval
review returning a `content-blocked` infrastructure error. The tool explicitly said this was a review
failure, not a determination that the actions were unsafe. GSAP installation was likewise blocked;
the implemented UI uses the installed Framer Motion library. Live hospital provider responses were
exercised through the dev server; device call/message handoffs remain unverified. The default Turbopack check encountered sandbox worker connection
errors; an initial webpack check against the existing `.next` directory encountered filesystem
permissions. The successful build used the isolated workspace directory described above.

Verified contact coverage is currently 36 of 249 countries/territories. The remaining entries expose
an explicit data gap. The Supabase/PostGIS migration and exporter exist; this local application
uses its existing SQLite backend and has not been connected to a live Supabase deployment.
