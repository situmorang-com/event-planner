# Deploying Event Planner to Coolify

Target: **https://checkin.situmorang.com** on the Coolify at https://coolify.situmorang.com
(server `72.60.233.198`), built from `situmorang-com/event-planner` (public), branch `main`.

Each step is marked **verified** (run and checked) or **configured** (set up, not exercised).

## 1. DNS

An A record for `checkin.situmorang.com` pointing to `72.60.233.198`, at Niagahoster (the
situmorang.com DNS host). No Cloudflare proxy is involved, so Coolify's Traefik issues the Let's
Encrypt certificate itself on the first request after the record resolves.

## 2. Create the application

Dockerfile build pack, port 3000, health check `GET /healthz` expecting 200, memory limit
512m, and **single writer**:

```sh
coolify.sh app create --name hadir --repo situmorang-com/event-planner --branch main \
  --project 2qoq4g12mrjxcdkwousez2dx --server p40c04owo8wckgcg8woo8888 \
  --domain https://checkin.situmorang.com --port 3000 --health-path /healthz \
  --memory 512m --single-writer
```

Created as app `slbb0tvqksf2siuow2vkwcet` in project `event-attendance`.

### The image must contain curl

Coolify's health check runs `curl … || wget …` **inside the container**, and on Coolify 4.3.23
it replaces the Dockerfile's own `HEALTHCHECK`. `node:*-slim` ships neither tool.

- **What went wrong on the first deploy:** Docker marked the container unhealthy even though
  the app was serving. Traefik won't route to an unhealthy container, so the domain answered 404
  on HTTP and served Traefik's default certificate on HTTPS.
- **The fix:** the Dockerfile installs `curl`.
- **Verified locally:** Coolify's exact health command exits 1 in the old image and 0 in the
  new one.

### Single writer, not rolling updates

Coolify's default deploy runs the new container beside the old one, then switches traffic.
The app can't do that safely:

- SQLite gets exactly one writer.
- The live entrance-screen feed and the rate limits live in the process's memory, so a second
  container would split them.

`--single-writer` pins the container name, which is Coolify's way to turn rolling updates off.
The cost is **a few seconds of downtime per deploy**:

- **Don't deploy during an event.**
- Entrance screens and dashboards reconnect by themselves.
- An attendee mid-form keeps their 30-minute pass and can submit once the app is back.

## 3. Storage, before the first deploy

A named volume mounted at `/data`. The database is `DB_PATH=/data/attendance.db`, and its
`-wal` file sits in the same volume.

```sh
coolify.sh storage add <APP_UUID> --name data --mount /data
```

The image creates `/data` owned by `node` (uid 1000), so an empty named volume is writable
with no host step (**verified** locally: fresh volume, write, restart, data still there).

## 4. Backups

Coolify's volume backup runs nightly at 02:00 server time and keeps 7:

```sh
coolify.sh storage backup <APP_UUID> <STORAGE_UUID> --cron "0 2 * * *" --keep 7
```

The database runs in WAL mode with the `-wal` inside the volume, so the archive is consistent
without stopping the app. **configured**; restore not yet exercised.

## 5. Environment variables

Pushed with `coolify.sh env push <APP_UUID> .env.production`. The file is gitignored and never
committed.

| Variable                | Value                            | Why                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                | `https://checkin.situmorang.com` | Otherwise every form POST is 403 behind Traefik. Also the base URL printed into QR codes.                                                                                                                                                                                                                                                                                       |
| `ADMIN_PASSWORD`        | random, 24 characters            | Organizer sign-in. Without it, sign-in is disabled in production.                                                                                                                                                                                                                                                                                                               |
| `ORG_NAME`              | `SRKK`                           | The consent line attendees agree to.                                                                                                                                                                                                                                                                                                                                            |
| `ADDRESS_HEADER`        | `X-Forwarded-For`                | Real client IPs for the rate limits. Without it, every attendee looks like Traefik and shares one limit.                                                                                                                                                                                                                                                                        |
| `XFF_DEPTH`             | `1`                              | Traefik is the only proxy in front. Set to `2` if Cloudflare proxying is ever turned on.                                                                                                                                                                                                                                                                                        |
| `DB_PATH`               | `/data/attendance.db`            | Inside the mount.                                                                                                                                                                                                                                                                                                                                                               |
| `DEFAULT_PHONE_COUNTRY` | `ID`                             | Reads `0812…` as `+62812…`.                                                                                                                                                                                                                                                                                                                                                     |
| `DEFAULT_TIMEZONE`      | `Asia/Jakarta`                   | Fallback only; events store their own zone.                                                                                                                                                                                                                                                                                                                                     |
| `PRIVACY_URL`           | the SRKK privacy policy URL      | Linked beside the consent boxes on the check-in and registration pages, and in the source line every message to a person found by research carries. **Required**: guests who register through a link must be able to read how their data is handled, and without it research finds can't be messaged at all (their rows show a hint instead of the WhatsApp and email buttons). |

These are baked into the image instead:

- `NODE_ENV=production`, `PORT=3000`
- `SHUTDOWN_TIMEOUT=3`: an open entrance-screen stream would otherwise hold shutdown for
  30s, past Docker's 10s stop grace, and SQLite would be killed instead of closed. **Verified**
  locally: `docker stop` with a stream open took 3.2s and left no `-wal` file.

Signing keys need no variable. A secret is generated on first start and stored in the
database, so sessions survive redeploys (**verified** across a container restart).

## 6. First sign-in

Open https://checkin.situmorang.com/admin and sign in with `ADMIN_PASSWORD`. It is in
`.env.production` on the machine that deployed, and in Coolify under the app's Environment
Variables.

## 7. Rolling back

```sh
coolify.sh rollback-images <APP_UUID>   # list previous images
coolify.sh rollback <APP_UUID> <TAG>    # redeploy one without rebuilding
```

Within one schema version the schema only grows (`CREATE TABLE IF NOT EXISTS`), so an older
image runs fine on a newer database. **Schema version 2** (the people pipeline) is the
exception: on its first start it rebuilds `contacts`, `invitations`, `suggestions` and
`target_companies` into `people`, `event_people` and `event_companies`, and drops the old
tables. Before touching anything it writes a copy of the file beside the database,
`<DB_PATH>.pre-v2` (so `/data/attendance.db.pre-v2` in the volume). Rolling back to an image
from before version 2 therefore means restoring that copy over `DB_PATH` first; an older image
started on the new file would recreate empty `contacts` and `invitations` tables. If the
migration fails it rolls back and the app refuses to start, leaving the version-1 file intact
for the previous image. A version-1 file from before the planning tables existed migrates too.
**Schema version 3** seeds `message_templates` with the built-in wording for every message
kind and language (Indonesian, English, Malay) on fresh and migrated databases alike; a body
someone has already edited under Settings › Message defaults is left as it is. **Schema
version 4** stamps `consent_boxes_since` in `settings` the moment the three consent boxes ship
(§4.7 of the design): a past attendee created before that stamp who never ticked "future
events" is treated as legacy. Rolling back past version 4 is safe; rolling forward again does
not move the stamp. **Schema version 5** fills `people.country` for past attendees who checked
in between the version-2 migration and this deploy without a phone that says where they are,
from the time zone of the event they walked into (§2.3), so the legacy rules know who is
Indonesian; from this version a check-in stores it as it creates the person. Rolling back
past version 5 is safe. Guest-list rows whose email was shared with a clearly different name in
the pool become their own person, marked for review on the People tab, so nothing is folded
together silently.

Housekeeping (the retention jobs: Found rows at the event start, planning data 90 days on,
prospects after 12 months, legacy attendees 30 days after their notice) runs inside the app
process, once at startup and then every 24 hours, so nothing is scheduled in Coolify. It is
one more reason for the single-writer setting: two containers would each run it. The timer is
skipped during `npm run build`, which imports the server modules.

The registration links (`/r/<token>`, `/r/<token>/ok`, `/r/e/<event>`) are public and signed
with the same app secret as the QR passes, so the links already sent survive a redeploy; they
expire with the event's end as set in its settings.

## 8. Restoring from a backup

1. Stop the app in Coolify.
2. Restore the chosen archive into the `data` volume from the Coolify storage/backup screen.
3. Start the app. There is no migration step; the app opens whatever `attendance.db` it finds.

## 9. Updating

The repo is public and connected without the Coolify GitHub App, so a push does not redeploy
by itself. Either:

- run `coolify.sh deploy <APP_UUID> --wait --health-url https://checkin.situmorang.com/healthz`, or
- use the GitHub Actions workflow (`.github/workflows/deploy.yml`), which runs check, tests and
  build on every push to `main` and then calls Coolify's deploy webhook. It needs two repository
  secrets: `COOLIFY_WEBHOOK` and `COOLIFY_TOKEN`, a token with **only** the deploy permission.

Afterwards, check `/healthz`, then open an entrance screen to confirm the live stream
reconnects.

## What was verified locally (Docker, Colima)

- `docker build` succeeds, then again for `--platform linux/amd64` (the VPS architecture).
  The prebuilt SQLite binding loads in the build stage, so a bad binding fails the build,
  not the deploy.
- Fresh named volume: health 200, sign-in, create event, attendee check-in, CSV export.
- A cross-site POST (`Origin: http://evil.example`) gets 403.
- `docker stop` with a live stream open takes about 3s and leaves no `-wal` or `-shm` file.
- After a restart, data and organizer sessions survive, and Docker reports the container
  healthy.

Not verifiable locally: the certificate, Traefik routing, real client IPs through
`X-Forwarded-For`, and the Coolify backup restore.
