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
- **Invitation planner.** Every event has a guest list, grouped by company. Add people from your
  contacts, type names, or paste rows from a spreadsheet. Record each reply with one tap
  (attending, tentative, declined) plus a note, and send a WhatsApp or email follow-up that fits
  the reply. On the day, invitees are ticked off live as they check in, and walk-ins are listed
  separately. See [Invitations](#invitations).
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

## Invitations

Open an event and switch to its **Invitations** tab.

- **Adding people.** Type a company to see who from that company is already in your contacts,
  and tick the ones to invite. Or type one person per line, with an optional job title, email or
  mobile after the name (`Andi Pratama, IT Manager, andi@batavia.co.id`). Numbered lists pasted
  from WhatsApp or Word work too. Adding someone who is already on the list is skipped and
  reported.
- **Checking each field.** Press **Check each field** to see what you typed or pasted split into
  one card per person (name, company, job title, email, mobile, LinkedIn, reply, note). Fix
  anything, add or remove rows, then add them. Nothing is saved before that.
- **LinkedIn links.** A profile link works on its own, one per line: the app reads the name from
  the link (`linkedin.com/in/rina-wijaya-4a1b2c` is "Rina Wijaya") and keeps the link on the
  guest so you can open the profile and fill in the rest. It doesn't fetch the profile itself:
  LinkedIn's terms forbid scraping and profiles sit behind a sign-in. When a link doesn't spell
  out a name ("rinaw88"), the review asks you to type it.
- **Pasting a spreadsheet.** Include the header row and each column lands in the right place.
  Headers can be English or Indonesian (_Nama_, _Perusahaan_, _Jabatan_, _No. HP_), and Outlook's
  separate first-name and last-name columns work. A reply column (_Yes_, _Hadir_, _Tentative_,
  _Tidak hadir_…) sets each reply. Anything it can't read, such as "Yes, with a colleague", is
  kept word for word as a note.
- **Replies.** Tap _Attending_, _Tentative_ or _Declined_; tap it again to clear it. Notes save
  when you leave the field. The message button opens WhatsApp (for numbers in international
  format) or email, with a text that fits the reply: an invitation, a confirmation, a follow-up
  or a thank-you. Nothing is sent until you press send.
- **Companies.** "PT Batavia Foods Tbk" and "Batavia Foods" are one company. Rename a company to
  merge spellings or fix a typo across the whole group.
- **On the day.** A check-in ticks off its invitee by email, then mobile, then name. A name
  counts when the companies don't contradict it, and titles and degrees are ignored, so
  "Bapak Hendra Gunawan, S.E." on the list is the "Hendra Gunawan" who scans in. _Not arrived_
  lists who said yes but hasn't come. _Walk-ins_ lists who came without an invitation, and one
  tap adds them to the list.

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
4. **Suggested people.** Each suggestion shows the title, why it fits, and its source. **Add**
   puts the person on the guest list; dismissing hides them. Neither is suggested again, and
   neither is anyone already invited, so re-running only brings new people.

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
- **Invitations:** what the organizer enters on a guest list: name, company, job title, email,
  mobile, LinkedIn profile link, reply and note. Deleting an event deletes its guest list.
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
    components/               QR code, charts, event form, guest-list rows and forms
    server/
      schema.ts, database.ts  schema (SQLite), versioned migrations run on start
      migrate-v2.ts           contacts/guest lists → people and event rows (with a .pre-v2 copy)
      people.ts, companies.ts the cross-event pool: identity matching, field precedence, merge
      event-people.ts         one person on one event: found/shortlisted/invited… rows, touches
      stages.ts               the stage transition table, the only place a stage changes
      do-not-contact.ts       hashed do-not-contact list and person locks
      checkins.ts             check-ins, linked to people and their event rows
      invitations.ts          the guest-list view of event rows, company groups
      guest-list.ts           reading typed and pasted guest lists
      qr-token.ts             rotating QR tokens and the 30-minute scan pass
      auth.ts                 signed organizer session
      bus.ts                  in-process pub/sub behind the live stream
  routes/
    c/[id]/                   attendee check-in page (the QR target)
    admin/(app)/              events, event dashboard, invitations, contacts
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
