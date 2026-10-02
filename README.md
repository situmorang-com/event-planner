# Event Planner

Event check-in that takes seconds. Attendees scan a QR code at the door, fill in their details
from their own phone's contact card, and land in one de-duplicated contact database. Organizers
get a live entrance screen and a dashboard.

Formerly called _Hadir_, the word you answer at roll call in Indonesian and Malay.

## How the phone's contact card gets into the form

No website can read a phone's contacts or its owner card silently. iOS and Android both block
that, and even native apps must ask first. The app uses the standard, consented routes instead,
which are just as fast for the attendee:

| Phone                | What happens                                                                                                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **iPhone (Safari)**  | Every field carries the right `autocomplete` hint, so tapping _Full name_ shows the attendee's own contact card above the keyboard. One tap fills name, email, mobile and company. This needs AutoFill contact info turned on (Settings → Apps → Safari → AutoFill). |
| **Android (Chrome)** | A **Use my contact card** button opens the Contact Picker. The attendee picks their own card and name, email and mobile fill in. Chrome's autofill works as well.                                                                                                    |
| **Coming back**      | After the first check-in the phone remembers them (a signed cookie, opt-out checkbox). At the next event it's one button: **Check in as Rina**.                                                                                                                      |

The Contact Picker is enabled by default only in Chrome on Android. Safari on iOS still keeps it
behind a feature flag, which is why iPhones use AutoFill. It also needs HTTPS, so on a plain-http
dev server it stays hidden and the autofill path is used instead.

## Features

- **Live entrance screen.** A full-screen QR code that changes every 20 seconds, so a forwarded
  photo stops working, plus a running count, the latest arrivals and a welcome banner with
  confetti. It shows first name and last initial only.
- **Printable QR mode** for posters, badges and table cards, with an A4 poster page.
- **Dashboard.** Check-ins, new versus returning contacts, the busiest window, an arrivals chart,
  a device split and a searchable attendee list, all updating live.
- **Finding people to invite.** Describe who an event is for, list target companies, and let
  `claude -p` suggest matching people from public sources for you to approve. See
  [Planning](#planning-finding-people-to-invite).
- **People.** Every event has one list, grouped by company, that follows each person from a
  research find to the door: found, shortlisted, invited, replied, confirmed, checked in. Add
  people from the pool, type names, or paste rows from a spreadsheet; record each reply with one
  tap plus a note; open a WhatsApp or email message that fits the reply, which stamps the
  invitation. On the day, rows are ticked off live as people check in. See [People](#people).
- **Contact database.** People are matched by email across every event, their details improve
  with each visit, and everything exports to CSV (Excel-safe, UTF-8).
- **Staff tools.** Add someone by hand, remove a check-in, open or close the doors, and delete a
  contact on request.
- **Consent.** Explicit consent is recorded with a timestamp on every self check-in.

## Quick start

```bash
npm install
npm run dev
```

1. Open <http://localhost:5173/admin>. In development the password is `admin`.
2. Create an event, then click **Entrance screen**.
3. Scan the code with a phone on the **same Wi-Fi**. The dev server listens on your network and
   the QR code uses this computer's Wi-Fi address automatically, because phones can't open
   `localhost`.

To see the dashboard with realistic data, run `npm run demo:seed`. It adds three demo events,
about 60 check-ins with `@example.com` addresses, and two guest lists: one for the event under
way, one for an upcoming dinner. Delete the `data/` folder to start fresh.

## People

Open an event and switch to its **People** tab. The header shows Yes replies against the
event's target (set it in the event settings) with the confirmed count beside it, then chips
for each stage: To review · Shortlisted · Invited · Attending · Tentative · Declined · Confirmed
· Checked in · No-show, plus **Mine** for the rows you own and a toggle for skipped rows. Before
the event no chip is on; once it has ended, Checked in and No-show are.

- **Adding people.** Type a company to see who from that company is already in the pool (people
  who attended, replied or registered; a **Prospects** chip shows the rest), and tick the ones
  to invite. Or type one person per line, with an optional job title, email or mobile after the
  name (`Andi Pratama, IT Manager, andi@batavia.co.id`). Numbered lists pasted from WhatsApp or
  Word work too. Up to ten typed rows go straight to **Shortlisted**; longer pastes, and anything
  you **Park as Found**, wait under **To review** first. Adding someone already on the list is
  skipped and reported; locked people and blocked companies are refused.
- **Checking each field.** Press **Check each field** to see what you typed or pasted split into
  one card per person (name, company, job title, email, mobile, LinkedIn, reply, note). Fix
  anything, add or remove rows, then add them. Nothing is saved before that.
- **LinkedIn links.** A profile link works on its own, one per line: the app reads the name from
  the link (`linkedin.com/in/rina-wijaya-4a1b2c` is "Rina Wijaya") and keeps the link on the
  row so you can open the profile and fill in the rest. It doesn't fetch the profile itself:
  LinkedIn's terms forbid scraping and profiles sit behind a sign-in. When a link doesn't spell
  out a name ("rinaw88"), the review asks you to type it.
- **Pasting a spreadsheet.** Include the header row and each column lands in the right place.
  Headers can be English or Indonesian (_Nama_, _Perusahaan_, _Jabatan_, _No. HP_), and Outlook's
  separate first-name and last-name columns work. A reply column (_Yes_, _Hadir_, _Tentative_,
  _Tidak hadir_…) sets each reply. Anything it can't read, such as "Yes, with a colleague", is
  kept word for word as a note.
- **To review.** What the research run found (see [Planning](#planning-finding-people-to-invite))
  waits here with its source link and reason. **Add** makes the person real and shortlists them;
  **Skip** hides the row (reversibly). A company header offers **Add all** and **Skip all**.
  Found rows are deleted when the event starts, skipped ones 90 days later.
- **Replies and messages.** Tap _Attending_, _Tentative_ or _Declined_; tap it again to clear
  it. Notes save when you leave the field. The WhatsApp button (for numbers in international
  format) and the email button open a message that fits the reply: an invitation, a
  confirmation, a follow-up or a thank-you. Nothing is sent until you press send, but the tap is
  recorded: the row moves to **Invited** and later taps show as _chased ×N_. **Invited via
  LinkedIn** records an invitation sent elsewhere. Buttons stay hidden for people who may not be
  contacted (locked, suppressed by a D365 flag, or past Malaysian attendees who never agreed to
  hear about future events).
- **Markers.** _Needs details_ (no email and no mobile), _chased ×N_, _locked_, _blocked
  company_, _suppressed_, _no consent recorded_ (a staff add), _via LinkedIn_.
- **Owners.** Each company has an owner, picked from the team names in settings, and a row can
  override it; **Mine** shows the rows that are yours.
- **Row menu.** Edit details, Remove from the event, **Don't contact again…** (locks the person
  everywhere, with a reason, as hashed entries on the do-not-contact list), and **Merge into…**
  when two records turn out to be one person.
- **Companies.** "PT Batavia Foods Tbk" and "Batavia Foods" are one company. Rename a company to
  merge spellings or fix a typo across every event.
- **On the day.** A check-in lands on the person's row by email, then mobile, then LinkedIn,
  then name. A name counts when the companies don't contradict it, and titles and degrees are
  ignored, so "Bapak Hendra Gunawan, S.E." on the list is the "Hendra Gunawan" who scans in.
  Someone who checks in without being on the list gets a row too. _No-show_ lists who said yes
  or maybe but never came, once the event has ended.
- **CSV.** The list exports from the People tab (locked people's channels are blanked).

## Planning: finding people to invite

The **Planning** tab helps you decide who to invite before the guest list exists.

1. **Who should come?** Answer a few questions for the event: what it's for, which roles,
   how senior, which departments, how many per company, and who to leave out.
2. **Target companies.** One per line, with a website if you know it. Give a company its own
   focus ("only their finance team") when it differs from the brief.
3. **Find people with Claude.** Create a token (shown once), `export EVENT_PLANNER_TOKEN=…` in your
   terminal, and run the command the page shows. Your terminal fetches the event's research
   brief, `claude -p` researches it with web search and fetch only, and the answer is posted
   back. Claude never sees the token and has no shell, so a web page that tries to hijack it has
   nothing to send. It sticks to public sources (company sites, news, search results) and work
   details only: no LinkedIn sign-in, no emails or phone numbers.
4. **Review what it found.** Each find waits under **To review** on the People tab with its
   title, why it fits, and its source. **Add** puts the person on the list; **Skip** hides them.
   Neither is suggested again, and neither is anyone already on the list, so re-running only
   brings new people. An event needs a date before research runs: finds are deleted when it
   starts.

The API behind step 3 is `GET /api/research/events/<id>/prompt` and
`POST /api/research/events/<id>/suggestions`, both with `Authorization: Bearer <token>`.
Tokens are stored hashed and can be revoked on the same page.

## Configuration

Copy `.env.example` to `.env`. Everything is optional in development.

| Variable                | Purpose                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`        | Organizer password. **Required in production**: without it, sign-in is disabled.                                                               |
| `ORIGIN`                | Public URL, e.g. `https://checkin.example.com`. **Required in production** by SvelteKit's Node adapter, otherwise every form post is rejected. |
| `PUBLIC_BASE_URL`       | URL printed into QR codes, if it differs from `ORIGIN`.                                                                                        |
| `ORG_NAME`              | Shown in the consent line: "I agree that _SRKK_ may keep these details…"                                                                       |
| `PRIVACY_URL`           | Adds a privacy policy link next to the consent box.                                                                                            |
| `DEFAULT_PHONE_COUNTRY` | Reads local numbers such as `0812-3456-7890` as `+62…`. Default `ID`; use `MY` for Malaysia.                                                   |
| `DEFAULT_TIMEZONE`      | Fallback event time zone. Default `Asia/Jakarta`; new events take the organizer's browser zone.                                                |
| `DB_PATH`               | SQLite file. Default `data/attendance.db`. Put it on a persistent volume.                                                                      |
| `SESSION_SECRET`        | Optional. By default a secret is generated once and stored in the database.                                                                    |
| `ADDRESS_HEADER`        | Behind a reverse proxy, `X-Forwarded-For`, so rate limits see each attendee's IP instead of the proxy's (adapter-node setting).                |
| `XFF_DEPTH`             | Number of proxies in front: `1` for Traefik alone, `2` with Cloudflare proxying on top.                                                        |

## Deploying

This is a standard SvelteKit + `adapter-node` app with SQLite (`npm run build`, then
`node build`), with a `Dockerfile` for container hosts. The Coolify setup for
checkin.situmorang.com, and what was verified, is in [docs/DEPLOY.md](docs/DEPLOY.md).
Things to get right anywhere:

- Serve it over **HTTPS**. The Contact Picker needs HTTPS, and so do secure cookies.
- Set `ADMIN_PASSWORD` and `ORIGIN`, plus `ADDRESS_HEADER` behind a proxy.
- Mount a persistent volume for `DB_PATH`.
- Run a **single instance**. Live updates and rate limits live in memory, and SQLite takes one
  writer.
- `GET /healthz` returns `ok` for health checks.

To run it on a venue laptop with no internet, build it, then start it with
`ORIGIN=http://<laptop-ip>:3000 ADMIN_PASSWORD=… node build` and put the phones on the same
network.

## Data and privacy

- **Contacts:** name, email, mobile (E.164 when it parses), company and job title.
- **Check-ins:** time, device type (iPhone, Android or other), method (form, contact card,
  one-tap or staff) and when consent was given.
- **Entrance screen:** shows first name and last initial, nothing else.
- **People on an event:** what the organizer enters or research finds: name, company, job
  title, email, mobile, LinkedIn profile link, stage, reply, note, owner and the messages
  recorded. Deleting an event deletes its rows; a person stays in the pool.
- **Deleting a contact** on the Contacts page removes that person, their whole check-in history
  and any invitation under their email.
- **Timestamps** in CSV exports are ISO 8601, in UTC.

## Project layout

```
src/
  lib/
    qr.ts                     soft-cornered QR renderer (SVG, browser and server)
    time.ts, names.ts         event time zones, "Rina W."-style public names
    invitations.ts            replies, name and company matching keys, follow-up messages
    people.ts                 stages, chips and row markers shared by the People page
    components/               QR code, charts, event form, People rows and add forms
    server/
      schema.ts, database.ts  schema (SQLite), versioned migrations run on start
      migrate-v2.ts           contacts/guest lists → people and event rows (with a .pre-v2 copy)
      people.ts, companies.ts the cross-event pool: identity matching, field precedence, merge
      event-people.ts         one person on one event: found/shortlisted/invited… rows, touches
      stages.ts               the stage transition table, the only place a stage changes
      do-not-contact.ts       hashed do-not-contact list and person locks
      checkins.ts             check-ins, linked to people and their event rows
      people-page.ts          the People tab's view of an event and its add form
      match-arrivals.ts       pairing a v1 guest list with check-ins (used by the migration)
      guest-list.ts           reading typed and pasted guest lists
      qr-token.ts             rotating QR tokens and the 30-minute scan pass
      auth.ts                 signed organizer session
      bus.ts                  in-process pub/sub behind the live stream
  routes/
    c/[id]/                   attendee check-in page (the QR target)
    admin/(app)/              events, event dashboard, people, planning, contacts
    admin/events/[id]/        display (entrance screen), stream (SSE), exports, poster
scripts/seed-demo.ts          demo data (npm run demo:seed)
```

## Scripts

```bash
npm run dev         # dev server on your network (port 5173)
npm test            # unit tests: matching, tokens, phone numbers, time zones, CSV, guest lists
npm run check       # svelte-check / TypeScript
npm run build       # production build in build/
npm run demo:seed   # demo events, check-ins and guest lists
```
