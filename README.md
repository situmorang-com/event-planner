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
- **Pasting a spreadsheet, or opening a CSV.** Include the header row and each column lands in
  the right place; **Open a CSV file** reads a saved export the same way. Headers can be English
  or Indonesian (_Nama_, _Perusahaan_, _Jabatan_, _No. HP_), and Outlook's separate first-name
  and last-name columns work. A reply column (_Yes_, _Hadir_, _Tentative_, _Tidak hadir_…) sets
  each reply. Anything it can't read, such as "Yes, with a colleague", is kept word for word as
  a note. The review card always shows which column it took for what; **Change columns** lets
  you correct it, and opens by itself when fewer than two columns were recognised.
- **Dynamics 365 exports.** Paste or open a contacts view (_Full Name_, _Parent Customer_,
  _Email Address 1_, _Mobile Phone 1_, _Owner_, _Do not allow Emails_, _Do not allow Phone
  Calls_, _Send Marketing Materials_, _Status_…). The hidden _(Do Not Modify)_ columns of a
  static worksheet are dropped. Everyone imported is recorded as a customer (origin _Dynamics
  365_), and the flags are honoured: _do not email_ hides the email button, _do not phone_ hides
  WhatsApp, and _Do Not Send_ marketing or an _Inactive_ status marks the row **Suppressed**: it
  waits under To review and cannot be added. A _Status_ column counts as replies only when its
  values read as replies. The _Owner_ column becomes the company's owner when it names a team
  member and the company has none; otherwise it is kept as a note on the company.
- **To review.** What the research run found (see [Planning](#planning-finding-people-to-invite))
  waits here with its source link and reason. **Add** makes the person real and shortlists them;
  **Skip** hides the row (reversibly). A company header offers **Add all** and **Skip all**.
  Found rows are deleted when the event starts; skipped ones go 90 days later once the
  retention phase lands.
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

The **Planning** tab holds the brief, the target companies and the research command. An event
needs a date first: what research finds is kept only until the event starts.

1. **Who should come?** Answer a few questions for the event: what it's for, which roles,
   how senior, which departments, how many per company, and who to leave out. Describe roles
   and companies, not names: the brief Claude receives says only how many people are already
   known at each company, never who, and a line that names someone is dropped from it.
2. **Target companies.** One per line, with a website if you know it. Give a company its own
   focus ("only their finance team") when it differs from the brief. Each company has a
   **research tick**: by default a company is researched until enough contactable people are
   known there (the "how many per company" number); tick or untick to decide yourself, and
   _default_ puts it back. A run takes at most **15** ticked companies. After a run the company
   shows _researched 2 Oct_. Blocked companies are never researched.
3. **Find people with Claude.** Create a token under Settings › API tokens (shown once),
   `export EVENT_PLANNER_TOKEN=…` in your terminal, and run the command the page shows. It runs
   under the SRKK Team/API account. Your terminal fetches the event's research brief, `claude
-p` researches it with web search and fetch only, and the answer is posted back. Claude never
   sees the token and has no shell, so a web page that tries to hijack it has nothing to send.
   It sticks to public sources (company sites, news, search results) and work details only: no
   LinkedIn sign-in, no emails or phone numbers. The brief is refused (and the reason printed)
   while the event has no date, the brief is empty, no company is ticked, or more than 15 are.
4. **Review what it found.** Each find waits under **To review** on the People tab with its
   title, why it fits, and its source. **Add** puts the person on the list; **Skip** hides them.
   Neither is suggested again, and neither is anyone already on the list, so re-running only
   brings new people. Once the event has started, research still runs but nothing it returns
   is kept, and the Found rows nobody approved are deleted.

The API behind step 3 is `GET /api/research/events/<id>/prompt` and
`POST /api/research/events/<id>/suggestions`, both with `Authorization: Bearer <token>`.
Tokens are stored hashed and can be revoked in Settings.

## Contacts

**Contacts** lists the pool: everyone who attended, replied or registered, matched by email,
mobile, LinkedIn and name across every event. The **Prospects** chip shows the rest: people
found by research or typed in who never replied or came. Each person shows their origin
(checked in, registered, typed, Dynamics 365, research), how long they are kept, and whether
they are locked. **Merge into…** folds two records that turned out to be one person into the
one you keep; **Delete** is the right-to-erasure button: the person, their check-ins and every
event row go, and the deletion is logged. **Export CSV** carries _Origin_ and _Kept until_
columns; **Prospects CSV** exports the rest. In every export, a locked person's email, mobile
and LinkedIn are blank.

## Settings

**Settings** in the header holds what the whole team shares:

- **Team names.** The names that can be picked as "me" in the header. Everyone signs in with the
  same password, so this is how the app knows who added a row, sent an invitation, locked someone
  or exported a list. Pick your name once per browser (it is a plain cookie, trusted only while
  the name is still on the list); until you do, stamps are blank and **Mine** stays off.
- **API tokens.** Create, copy once, revoke. Used by the research command on the Planning tab.
- **Phone country.** How local numbers are read when nothing says otherwise; new events start
  with it, and an event can pick its own (a per-company override comes with messaging).
- **Do-not-contact list.** Everyone who asked not to hear from us, as hashed entries with masked
  labels (`r***@batavia.co.id`, `H*** G*** @ Batavia Foods`), the reason, where the request came
  from, who recorded it and when. Add an entry by hand (email, mobile, or name and company) to
  lock whoever it matches now and refuse them on every list later. Entries never expire; one
  comes off only by hand, with a reason, and that is logged.

Every export, deletion, lock, unlock and merge is written to an activity log with ids and counts
only, never names. An event's page shows its entries under **Activity**.

## Configuration

Copy `.env.example` to `.env`. Everything is optional in development.

| Variable                | Purpose                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`        | Organizer password. **Required in production**: without it, sign-in is disabled.                                                                   |
| `ORIGIN`                | Public URL, e.g. `https://checkin.example.com`. **Required in production** by SvelteKit's Node adapter, otherwise every form post is rejected.     |
| `PUBLIC_BASE_URL`       | URL printed into QR codes, if it differs from `ORIGIN`.                                                                                            |
| `ORG_NAME`              | Shown in the consent line: "I agree that _SRKK_ may keep these details…"                                                                           |
| `PRIVACY_URL`           | Privacy policy link next to the consent box. Becomes **required** when messaging lands: the source line sent to people found by research links it. |
| `DEFAULT_PHONE_COUNTRY` | Reads local numbers such as `0812-3456-7890` as `+62…`. Default `ID`; use `MY` for Malaysia.                                                       |
| `DEFAULT_TIMEZONE`      | Fallback event time zone. Default `Asia/Jakarta`; new events take the organizer's browser zone.                                                    |
| `DB_PATH`               | SQLite file. Default `data/attendance.db`. Put it on a persistent volume.                                                                          |
| `SESSION_SECRET`        | Optional. By default a secret is generated once and stored in the database.                                                                        |
| `ADDRESS_HEADER`        | Behind a reverse proxy, `X-Forwarded-For`, so rate limits see each attendee's IP instead of the proxy's (adapter-node setting).                    |
| `XFF_DEPTH`             | Number of proxies in front: `1` for Traefik alone, `2` with Cloudflare proxying on top.                                                            |

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
  and every event row they were on, and writes an entry to the activity log.
- **Locked people** (do-not-contact) are exported as name and company only, everywhere.
- **Research findings** are never exported.
- **Timestamps** in CSV exports are ISO 8601, in UTC.

### Retention

What the app deletes by itself, and when. The event-start step runs as soon as an event page
is opened after the start; the rest is scheduled housekeeping that arrives with the retention
phase, so for now only the first row below runs.

| What                                                 | Kept until                                    |
| ---------------------------------------------------- | --------------------------------------------- |
| Found rows nobody approved                           | the event starts                              |
| Found rows that were skipped                         | 90 days after the event starts                |
| Research and typed prospects who never replied       | 12 months after their last event              |
| Past Indonesian attendees who never ticked a consent | 30 days after the notice, unless they reply   |
| Attendees, customers, anyone who replied             | deleted by hand                               |
| Touch and activity logs                              | with the row or the event                     |
| Do-not-contact entries                               | forever (removed by hand only, with a reason) |

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
      settings.ts, who.ts     team names, phone-country default; the "me" cookie
      activity-log.ts         exports, deletions, locks and merges, as ids and counts
      migrate-v2.ts           contacts/guest lists → people and event rows (with a .pre-v2 copy)
      people.ts, companies.ts the cross-event pool: identity matching, field precedence, merge
      event-people.ts         one person on one event: found/shortlisted/invited… rows, touches
      stages.ts               the stage transition table, the only place a stage changes
      do-not-contact.ts       hashed do-not-contact list and person locks
      checkins.ts             check-ins, linked to people and their event rows
      people-page.ts          the People tab's view of an event and its add form
      match-arrivals.ts       pairing a v1 guest list with check-ins (used by the migration)
      guest-list.ts           reading typed, pasted and D365 guest lists; column mapping
      exports.ts              the one export row every CSV goes through (locked people stripped)
      jobs.ts                 the event-start purge, run lazily from the event pages
      planning.ts             the brief, target companies, research ticks and the count-only prompt
      qr-token.ts             rotating QR tokens and the 30-minute scan pass
      auth.ts                 signed organizer session
      bus.ts                  in-process pub/sub behind the live stream
  routes/
    c/[id]/                   attendee check-in page (the QR target)
    admin/(app)/              events, event dashboard, people, planning, contacts, settings
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
