# People pipeline: design

The build spec for the invitation pipeline that replaces the **Invitations** and **Planning**
tabs' guest handling. It implements the 25 decisions agreed with the organizer on 2026-10-02
(listed at the end as D1–D25). Statements about today's code were checked against `main` at
`0dba76a`. Where the decisions left something undefined, the choice is marked **(builder)**.

## 1. Purpose and vocabulary

An event's **People** list tracks everyone from first sighting to the door.

- **Stages** (stored): `found` → `shortlisted` → `invited` → `replied` (yes / maybe / no) →
  `confirmed` → `checked_in`. **No-show** is derived after the event ends.
- **Markers** on a row: _needs details_ (no email and no mobile), _chased ×N, last 2 Oct_ (from
  the touch log), _locked_ (do-not-contact), _blocked company_, _suppressed_ (D365), _no consent
  recorded_, _via LinkedIn_.
- **Verbs**: **Add** (found → shortlisted), **Skip** (reversible; hides a Found row), **Remove**
  (deletes the event row), **Don't contact again** (locks the person everywhere, with a reason).
- A **person** is one record in the cross-event pool. An **event row** is that person on one
  event. Found rows are not yet people: they hold a snapshot until someone presses Add (D6).
- **Me** is a team name picked once per browser; it stamps everything a human does (D1).
- **Target** is the event's one goal number, measured as Yes replies; Confirmed is shown beside it
  (D8). The app records invitations and never sends anything (D7).
- Tabs: **Check-ins · People · Planning**. Chips: To review · Shortlisted · Invited · Attending ·
  Tentative · Declined · Confirmed · Checked in · No-show (· Skipped behind a toggle).

The old name survives only as the `hdr_` token prefix, which `verifyBearer` keeps accepting
beside the new `ep_` prefix, and as the Coolify app name. The shell variable becomes
`EVENT_PLANNER_TOKEN` (planning page, README, `planning.spec.ts`).

## 2. Data model

Conventions from `src/lib/server/database.ts` stay: raw SQL, `CHECK` constraints for enums,
integer millisecond timestamps, `PRAGMA foreign_keys = ON`, `ON DELETE CASCADE`. New: a
`schema_version` key in `settings` and an ordered list of versioned steps (§2.4). `SCHEMA` creates
only the target tables; on a fresh database it writes `schema_version = 2` directly.

### 2.1 Today's tables and their fate

| Table              | Fate                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `events`           | kept, columns added                                                     |
| `contacts`         | rebuilt as `people` (same uuid ids, so `ea_me` cookies keep working)    |
| `checkins`         | rebuilt with `person_id` (its FK must point at `people`; see §2.4)      |
| `invitations`      | copied into `event_people`, dropped                                     |
| `suggestions`      | copied into `event_people` at `found`, dropped (no production rows yet) |
| `target_companies` | copied into `event_companies`, dropped                                  |
| `invite_briefs`    | kept                                                                    |
| `api_tokens`       | kept                                                                    |
| `settings`         | kept; new keys                                                          |

### 2.2 Target schema

**events** (added columns)

| Column                                                            | Serves                                           |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `ends_at INTEGER` (null → `starts_at + 6h`)                       | link expiry, No-show, D17                        |
| `target_count INTEGER`                                            | D8                                               |
| `phone_country TEXT NOT NULL DEFAULT 'ID' CHECK (IN ('ID','MY'))` | D14; migration default = `DEFAULT_PHONE_COUNTRY` |
| `language TEXT CHECK (IN ('id','en','ms'))` (null → from country) | D14, D21 explicit override                       |
| `co_hosts TEXT NOT NULL DEFAULT ''`                               | D15 third box                                    |
| `invitation_text TEXT`                                            | D21 per-event override                           |
| `chase_rules TEXT` (JSON, null → settings default)                | D20                                              |
| `started_job_at INTEGER`, `planning_purged_at INTEGER`            | D17, D10                                         |

**people** (the pool: attendees and prospects)

| Column                                                                                                                              | Serves                             |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `id TEXT PRIMARY KEY` (uuid)                                                                                                        |                                    |
| `name TEXT NOT NULL`, `job_title TEXT NOT NULL DEFAULT ''`                                                                          |                                    |
| `email TEXT` (nullable, **not unique**: shared `info@` addresses exist)                                                             | D6                                 |
| `phone TEXT` (E.164 when it parses)                                                                                                 | D14                                |
| `linkedin TEXT` (canonical `https://www.linkedin.com/in/…`)                                                                         | D12                                |
| `company_id TEXT REFERENCES companies(id) ON DELETE SET NULL`                                                                       | D1, D13                            |
| `origin TEXT NOT NULL CHECK (IN ('self_registered','checkin','d365','typed','research'))`                                           | D16; first value, never downgraded |
| `origin_detail TEXT NOT NULL DEFAULT ''` (the one-time "where did you get their details" answer, or the D365 owner note)            | D16, D11                           |
| `source_url TEXT`, `research_reason TEXT` (research origin only; kept for the person's life so the D10 source line can be rendered) | D10                                |
| `is_customer INTEGER NOT NULL DEFAULT 0` (from a D365 import; sticky)                                                               | D15, D18, D20                      |
| `country TEXT CHECK (IN ('ID','MY'))` (null = unknown, treated as MY, the stricter case)                                            | D15                                |
| `consent_future_at INTEGER`                                                                                                         | D15 box 2                          |
| `legacy_notice_at INTEGER`, `legacy_kept_at INTEGER`                                                                                | D15 legacy                         |
| `d365_no_email`, `d365_no_phone`, `d365_suppressed INTEGER NOT NULL DEFAULT 0`                                                      | D11                                |
| `locked_at INTEGER`, `lock_reason TEXT` (mirror of the do-not-contact hit)                                                          | D13                                |
| `last_event_at INTEGER` (max of event `starts_at` over its rows and `checked_in_at`; null → use `created_at`)                       | D18                                |
| `created_by TEXT NOT NULL DEFAULT ''`, `created_at`, `updated_at`                                                                   | D1                                 |

Indexes on `email`, `phone`, `linkedin`, `company_id`.

**companies** (global, one row per `companyKey()`)

| Column                                                                            | Serves |
| --------------------------------------------------------------------------------- | ------ |
| `id TEXT PRIMARY KEY` (shortId), `name TEXT NOT NULL`, `key TEXT NOT NULL UNIQUE` |        |
| `website TEXT NOT NULL DEFAULT ''`                                                | D11    |
| `owner TEXT` (team name)                                                          | D1     |
| `phone_country TEXT CHECK (IN ('ID','MY'))` (overrides the event)                 | D14    |
| `never_invite_at INTEGER`, `never_invite_reason TEXT`, `never_invite_by TEXT`     | D13    |
| `is_customer INTEGER NOT NULL DEFAULT 0`, `d365_note TEXT NOT NULL DEFAULT ''`    | D11    |
| `created_at`, `updated_at`                                                        |        |

**event_people** (replaces `invitations` and `suggestions`)

| Column                                                                                                                                                                              | Serves           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `id INTEGER PRIMARY KEY AUTOINCREMENT`, `event_id` FK CASCADE                                                                                                                       |                  |
| `person_id TEXT REFERENCES people(id) ON DELETE CASCADE` (NULL while `found`)                                                                                                       | D6               |
| `company_id TEXT REFERENCES companies(id)`                                                                                                                                          | D4               |
| snapshot (used only while `person_id IS NULL`): `name`, `job_title`, `email`, `phone`, `linkedin`, `source_url`, `reason`, `extra TEXT` (JSON: D365 flags, owner note, is_customer) | D4, D5, D11, D25 |
| `stage TEXT NOT NULL CHECK (IN ('found','shortlisted','invited','replied','confirmed','checked_in'))`                                                                               | D3               |
| `skipped_at INTEGER`, `skipped_by TEXT`                                                                                                                                             | D4               |
| `source TEXT NOT NULL CHECK (IN ('typed','paste','d365','pool','research','self_registered','walk_in','copied'))`                                                                   | D2, D16          |
| `reply TEXT NOT NULL DEFAULT 'pending' CHECK (IN ('pending','yes','maybe','no'))`, `replied_at`                                                                                     | D3               |
| `invited_at INTEGER`, `invited_via TEXT CHECK (IN ('whatsapp','email','linkedin','other'))`                                                                                         | D9               |
| `last_contacted_at INTEGER` (max of live touches)                                                                                                                                   | D3, D20          |
| `confirmed_at INTEGER`, `confirmed_via TEXT CHECK (IN ('registration','reconfirm'))`                                                                                                | D3               |
| `checkin_id INTEGER REFERENCES checkins(id) ON DELETE SET NULL`                                                                                                                     | D12              |
| `consent_event_at INTEGER` (= `checkins.consent_at` or the registration tick; NULL for staff adds), `consent_share_at INTEGER`                                                      | D15              |
| `owner TEXT` (per-person override; NULL = company owner)                                                                                                                            | D1               |
| `next_action_at INTEGER`, `next_action_kind TEXT CHECK (IN ('chase','reminder'))`, `next_action_overridden INTEGER NOT NULL DEFAULT 0`                                              | D20              |
| `needs_review INTEGER NOT NULL DEFAULT 0` (generic link)                                                                                                                            | D7               |
| `note TEXT NOT NULL DEFAULT ''`, `added_by TEXT NOT NULL DEFAULT ''`, `created_at`, `updated_at`                                                                                    | D1               |

Indexes: `(event_id, stage)`, `(person_id)`, `(event_id, next_action_at)`, unique partial
`(event_id, person_id) WHERE person_id IS NOT NULL`.

**event_companies** (replaces `target_companies`)

| Column                                                                                                                          | Serves         |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `id`, `event_id` FK CASCADE, `company_id` FK, UNIQUE(event_id, company_id)                                                      | D11            |
| `focus TEXT NOT NULL DEFAULT ''`                                                                                                | brief override |
| `research INTEGER` (NULL = computed default, 0/1 = explicit tick)                                                               | D25            |
| `research_requested_at INTEGER` (set when the prompt is served), `researched_at INTEGER` (set when the matching answer arrives) | D25            |
| `source TEXT CHECK (IN ('typed','copied','d365'))`, `created_at`                                                                | D11            |

**touches**: `id`, `event_person_id` FK CASCADE, `kind CHECK (IN ('invitation','chase','reminder','thanks_yes','followup_maybe','thanks_no','legacy_notice','manual'))`, `via CHECK (IN ('whatsapp','email','linkedin','other'))`, `at`, `by`. Clearing a pill deletes the latest touch; `invited_at` / `last_contacted_at` are recomputed from what remains.

**do_not_contact** (never expires by time; a staff member may remove an erroneous entry with a reason, logged): `id`, `kind CHECK (IN ('email','phone','name_company'))`, `hash` (sha256 of the normalised value; `name_company` hashes `nameKey@companyKey`), `company_key` (for `name_company` rows, so a company rename can re-hash), `label` (masked: `r***@batavia.co.id`, `H*** G*** @ Batavia Foods`), `reason`, `source CHECK (IN ('staff','stop_reply','not_me','remove_me'))`, `by`, `created_at`, `removed_at`, `removed_by`, `removed_reason`. UNIQUE(kind, hash). Plain SHA-256 so the list survives a `SESSION_SECRET` change.

**message_templates**: `kind` (touch kinds minus `manual`), `language CHECK (IN ('id','en','ms'))`, `body`, `updated_at`, `updated_by`; UNIQUE(kind, language). Seeded on first migration.

**activity_log**: `id`, `event_id` (nullable), `kind CHECK (IN ('export','delete','purge','import','merge','bulk','lock','unlock'))`, `who`, `at`, `what` (ids and counts only, never names), `row_count`.

**settings** keys: `secret`, `schema_version`, `team_names` (JSON array), `phone_country_default`, `chase_defaults` (JSON, §5.1).

### 2.3 Derived definitions used everywhere

- **attendee** = `EXISTS (checkins WHERE person_id = ?)`, regardless of origin.
- **default Contacts list / pool picker / default export** = attendee OR any event row with
  `reply <> 'pending'` OR `origin = 'self_registered'`. Everyone else is a **prospect**.
- **relationship** (chase caps) = `is_customer` OR attendee OR `consent_future_at`.
- **legacy** = `origin = 'checkin'` AND `consent_future_at IS NULL` AND created before the
  consent-box migration (§2.4 step 9).
- **country(person)** = `people.country`, else from the phone's calling code, else the timezone
  of their last check-in's event (`Asia/Kuala_Lumpur` → MY), else null = treat as MY.
- **language(row)** = `events.language` if set, else `companies.phone_country ?? events.phone_country`
  mapped ID → `id`, MY → `ms`. Used by messages, the opt-out line and the registration page.
- **contactable(person, channel)** = not locked, not `d365_suppressed`, channel not forbidden by a
  D365 flag, and not (legacy AND country MY AND not customer) (D15).
- **keptUntil(person / row)**: pure function, the single source for the UI and the jobs (§5.4).

### 2.4 Migration to schema version 2

Runs once, in `migrate()`, only when table `contacts` exists. Because `checkins.contact_id`
references `contacts(id) ON DELETE CASCADE` and `PRAGMA foreign_keys` cannot change inside a
transaction, the step follows SQLite's documented table-rebuild procedure:

0. `VACUUM INTO '<DB_PATH>.pre-v2'` (a file copy beside the database; restoring it is the
   rollback). `PRAGMA foreign_keys = OFF` (outside any transaction).
1. `BEGIN`. Create `companies`: one row per distinct `companyKey()` over `contacts.company`,
   `invitations.company`, `suggestions.company`, `target_companies.name`; `name` = most common
   spelling (`mostCommon` from `invitations.ts`, exported).
2. Create `people`; `INSERT … SELECT` from `contacts` with `company_id` by key, `origin` =
   `'typed'` when the person has no check-ins or only `method = 'staff'` ones, else `'checkin'`;
   `country` per §2.3; `last_event_at` = max `checked_in_at`.
3. Create `checkins_new` with `person_id REFERENCES people(id) ON DELETE CASCADE`,
   `UNIQUE (event_id, person_id)`; copy; drop old; rename; recreate indexes.
4. `invitations` → `event_people`: resolve a person with `findPerson` (§3) against the pool;
   none → create (`origin = 'typed'`, `origin_detail = 'migrated from guest list'`). Stage:
   `reply <> 'pending'` → `replied` with `invited_at = replied_at`, `invited_via = 'other'`;
   else `shortlisted`. Pair with check-ins using `matchArrivals`; a pair sets `checkin_id`,
   `stage = 'checked_in'`, `consent_event_at = checkins.consent_at`, and the check-in's person
   wins over the `findPerson` hit. Two invitations resolving to one person on one event are
   merged by §3 precedence (the one with a reply survives; notes concatenated). `source =
'typed'`.
5. `suggestions` → `event_people` at `found` with the snapshot, `source = 'research'`;
   `dismissed` → `skipped_at = decided_at`; `added` → not copied, but the matching step-4 row
   (same `nameKey@companyKey`) gets `source = 'research'`, and its person gets
   `origin = 'research'` **only if step 4 created that person** (never downgrade an attendee).
6. `target_companies` → `event_companies` (`source = 'typed'`).
7. Drop `invitations`, `suggestions`, `target_companies`. Seed `message_templates`,
   `chase_defaults`, `phone_country_default`. Set `schema_version = 2`. `PRAGMA
foreign_key_check` must return nothing, else `ROLLBACK`. `COMMIT`. `PRAGMA foreign_keys = ON`.
8. Also in the same deploy: `rememberedContact()` and the pass code in `c/[id]/+page.server.ts`,
   `checkins.ts` (`findContact` → `findPerson`, `AttendeeRow.contact_id` → `person_id`),
   `contacts.ts`, `scripts/seed-demo.ts` and every spec that inserts into the old tables.
9. The consent boxes (§4.7) record `consent_boxes_since` in `settings` so "legacy" has a date.

A failed step leaves `schema_version` and the old tables untouched, so the previous image still
runs. `docs/DEPLOY.md` must say: rolling back past this version means restoring the `.pre-v2`
copy, because an older image would recreate empty `contacts`/`invitations` tables.

## 3. Identity and merge (D12)

`findPerson(input, eventId?)`:

1. If an event is given, try this event's live rows first in `matchArrivals` order: email,
   phone, LinkedIn, name at a non-contradicting company.
2. Then the pool: email (lower-cased); several people may share an address, so apply the
   remaining rules within that subset; **phone** only when the two records' emails don't
   contradict (today's `findContact` guard, kept); **LinkedIn**; **name** (`nameKey`) when
   companies don't contradict (`companyKey` equal or one side empty) **and** emails and phones
   don't contradict.

Field precedence on merge, per field: `self_registered` / `checkin` values (the person typed
them) > `typed` / `d365` > `research`. Research fills blanks only. Equal rank: newer wins
(today's "latest non-empty wins"; today the name is always replaced by the submitted name, which
becomes the same rule). `origin` keeps its first value; `is_customer` is sticky.

Auto-merge triggers: a check-in or registration whose hit has a row on this event sets
`checkin_id` / `confirmed_at`, advances the stage, copies consents. No hit → new person
(`origin = checkin` or `self_registered`); the generic link also creates a row with
`needs_review = 1`.

Manual **Merge into** (Contacts page and row menu): choose the survivor; event rows, check-ins
and consents move by precedence (on a `(event_id, person_id)` collision the loser's row is
dropped and its touches re-parented); the loser is deleted; `activity_log` kind `merge`.

## 4. Pages

### 4.1 Tabs and routes

`EventTabs.svelte`: Check-ins · People · Planning. People's badge = live rows that are not
`found` and not skipped; a dot when Found rows wait. `/admin/events/[id]/invitations` redirects
to `/admin/events/[id]/people`. When `starts_at IS NULL`, People and Planning both show one card,
"Set the event date first" (D17); the event settings form is linked from it.

### 4.2 People (`/admin/events/[id]/people`)

Header: _Yes n / target_ progress with _Confirmed m_ beside it (D8), stage chips with counts,
**Mine**, search.

| Chip                             | Rows                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| To review                        | `stage = found AND skipped_at IS NULL`                                           |
| Shortlisted / Invited            | that stage                                                                       |
| Attending / Tentative / Declined | `reply` yes / maybe / no with `stage IN ('replied','confirmed')`                 |
| Confirmed                        | `stage = confirmed`                                                              |
| Checked in                       | `stage = checked_in`                                                             |
| No-show                          | event ended, `reply IN ('yes','maybe') OR confirmed_at IS NOT NULL`, no check-in |
| Skipped                          | `skipped_at IS NOT NULL` (behind "show skipped")                                 |

Default chips: none before the event; Checked in + No-show once the event has **ended**.

Row (`GuestRow.svelte` evolved): name, title, company, stage pill, reply buttons (tap again to
clear, as today), markers, owner avatar, next-action date (editable = override), note,
WhatsApp / email buttons (hidden when `contactable()` says no, or no usable value), **Invited via
LinkedIn** toggle, copy-registration-link button, overflow: Edit, Remove, Don't contact again…,
Merge into…. "Park as Found" exists only on the add/review card, before a person exists.

Laptop: grouped by company (`groupByCompany`); per group the owner (inherited; set here), _Add
all / Skip all_ for Found rows, rename company (updates `companies.name`, re-hashes
`name_company` entries for that key), company flags. Multi-select → bulk bar: Shortlist, Skip,
Mark invited (asks via), Set owner, Set stage, Copy to another event (D22).

Phone (D19): with a name picked, default = **Mine, due today** (`effective owner = me AND
next_action_at <= end of today` in the event timezone, sorted by `next_action_at`); one tap to
company groups. Swipe right = Shortlist, left = Skip (Found rows); long-press a company header =
shortlist all there. Stage chips on both layouts.

Add people (`AddGuests.svelte` evolved): type or paste (D365 headers, §6.1), CSV file picker
(same parser), pool picker (default list per §2.3, _Prospects_ chip for the rest). The review
card ("Check each field") always shows the detected column mapping with a "change columns"
control (auto-opened when fewer than two columns match), the normalised +62/+60 number from the
company's or event's phone country, "Park as Found" for ≤10 typed rows, and one "Where did you get
their details?" prompt per session for typed rows (`origin_detail`). Pastes above 10 rows land at
Found with the full snapshot (D5). Blocked companies and locked people are flagged and cannot
become live rows (D13).

### 4.3 Planning (`/admin/events/[id]/planning`)

Keeps the brief, target companies and the research command. Adds: _Copy brief + targets from…_
(previous event), paste from a D365 accounts export, a research tick per company (default per
§6.2) with _researched 2 Oct_, what the next run takes on (in batches of 15), a banner after
`starts_at` ("research still runs, but the list has gone live"), the _kept until_ date and
**Delete planning data** button (D10), the per-event chase-rule override form (D20) and the
per-event invitation text (D21). The sentence about the Claude account says: runs with the
organizer's own Claude Code sign-in. Suggestions no longer appear here; a counter links to
People › To review. API tokens move to Settings.

### 4.4 Settings (`/admin/settings`, D23)

Team names; Message defaults (kind × language, placeholders listed); Do-not-contact list (masked
label, reason, source, who, when; add by hand; remove with a reason, logged); Retention table
(§5.4) with counts of what the next purge removes; API tokens; Phone-country default; Chase
defaults. The "me" picker on every admin page reads the team list and sets a plain `ea_who`
cookie, validated against the list on each request.

### 4.5 Contacts (`/admin/contacts`)

Default list per §2.3; _Prospects_ chip. Per person: origin, _kept until_, lock state, events,
country (editable), **Delete** (erasure, logged), **Merge into…**. Exports: the default export
gains `Origin` and `Kept until`; a separate Prospects export. Every export route goes through one
`exportRow(person)` that blanks email, mobile and LinkedIn for locked people (D13), including the
per-event People export and the attendee export.

### 4.6 Registration page (`/r/[token]`, public)

Prefilled name and company only. Fields: RSVP (yes / maybe / no), email, mobile (normalised with
the row's country), optional note, the privacy notice, consent boxes (this-event required; future
events; share with co-hosts, shown only when `co_hosts` is set), **Not me / Remove me** links.
Submit → §3 auto-merge, `reply`, `replied_at`; **yes** also sets `stage = confirmed`,
`confirmed_at`, `confirmed_via = 'registration'`; **no** clears `confirmed_at`. Language per
§2.3. The token is checked against the event's _current_ end at request time (a date change
re-validates every link). After the end: "This link has expired".

Generic link `/r/e/[eventId]`: same form without prefill and **without the RSVP field**:
registering is the yes. Creates a row at `confirmed` (`source = 'self_registered'`,
`needs_review = 1`), flagged to the company owner. Reconfirm: `/r/[token]/ok`, one tap →
`confirmed`, `confirmed_via = 'reconfirm'`.

**Not me** hashes only the channel the link was sent on (the row's phone or email, per the last
touch's `via`), clears that value from the person, and skips the row. **Remove me** hashes
email, phone and name+company and locks the person. Both log `lock`.

### 4.7 Check-in page (`/c/[id]`)

Keeps the pass, cookie and form. The consent block becomes the three boxes (§8). `checkIn()`
uses `findPerson` (§3), links or creates the event row (`source = 'walk_in'` when none existed;
walk-ins are rows, not a separate list), sets `stage = checked_in`, `checkin_id`,
`consent_event_at = consent_at`, `consent_share_at`, and `people.consent_future_at` when ticked.
Staff adds on the Check-ins tab record no consent (`consent_at` NULL today) and show _no consent
recorded_. Phones are normalised with the event's country.

### 4.8 Event card and event page

Card: _Yes n / target_, _Confirmed m_, _Due today k_ (D20, in-app only). Event page: an
**Activity** panel (export, delete, purge, import, merge, bulk, lock entries) and the _kept
until_ line. Event settings form (`EventFields.svelte`, `event-form.ts`, `updateEvent`) gains
`target_count`, `ends_at`, `phone_country`, `language`, `co_hosts`.

## 5. Rules

### 5.1 Chase defaults (`settings.chase_defaults`, per-event override in `events.chase_rules`)

```json
{
	"chaseAfterWorkingDays": 3,
	"stopDaysBeforeEvent": 1,
	"reminderDaysBefore": 2,
	"maxTouches": { "relationship": 3, "none": 2 }
}
```

Working days = Mon–Fri in the event timezone (public holidays not modelled).

### 5.2 `computeNextAction(row, person, event, rules, now)`

Recomputed on every write to the row, its touches or the event, and by the daily job.

```
if locked, blocked company, suppressed, not contactable, stage in (found, checked_in),
   reply = no, or now >= starts_at                                   → none
if next_action_overridden                                            → keep as set
if stage = shortlisted                                               → none ("needs details" marker if no email/phone)
if stage = invited:
    touches = count(kind in (invitation, chase))
    if touches >= maxTouches[relationship ? 'relationship' : 'none']  → none
    due = addWorkingDays(last_contacted_at, chaseAfterWorkingDays)
    if due >= starts_at - stopDaysBeforeEvent days                   → none
    → (chase, due)
if reply = maybe and not confirmed: as invited, counting (invitation, chase, followup_maybe), from replied_at
if reply = yes or stage = confirmed, and no reminder touch           → (reminder, max(now, starts_at - reminderDaysBefore days))
else                                                                 → none
```

_Due today_ = rows with `next_action_at <= end of today`.

### 5.3 Stage transitions

| From → To                | Trigger                                                                            | Sets                                                                    | Clears                                     |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| (new) → found            | research POST, paste > 10 rows, "Park as Found"                                    | snapshot, source, added_by                                              |                                            |
| found → shortlisted      | Add / Add all / swipe                                                              | `person_id` (find or create; origin per source), stage                  | snapshot copied to the person, then nulled |
| found → skipped          | Skip                                                                               | `skipped_at`, `skipped_by`                                              |                                            |
| skipped → found          | Unskip                                                                             |                                                                         | `skipped_at`                               |
| (new) → shortlisted      | typed ≤10, pool picker, CSV/D365 ≤10, copy to event                                | as above                                                                |                                            |
| shortlisted → invited    | WhatsApp/email tap (touch `invitation`), "Invited via LinkedIn", bulk Mark invited | `invited_at`, `invited_via`, `last_contacted_at`, touch                 |                                            |
| invited → replied        | reply button; registration; staff "stop" reply (→ lock)                            | `reply`, `replied_at` (kept when unchanged, as today)                   |                                            |
| replied → replied        | reply changed                                                                      | `reply`, `replied_at`                                                   | `confirmed_at` if now no                   |
| replied → invited        | reply cleared                                                                      | `reply = pending`                                                       | `replied_at`                               |
| shortlisted → replied    | reply recorded before any touch (phone call)                                       | `reply`, `replied_at`, `invited_at = replied_at`, `invited_via = other` |                                            |
| replied(yes) → confirmed | registration yes, reconfirm tap                                                    | `stage`, `confirmed_at`, `confirmed_via`                                |                                            |
| any → checked_in         | check-in auto-merge, staff add                                                     | `checkin_id`, `consent_event_at` (may be NULL)                          | `next_action_at`                           |
| checked_in → previous    | check-in removed                                                                   | stage from reply / confirmed                                            | `checkin_id`                               |
| any → (deleted)          | Remove, person deletion, event-start purge of Found                                | `activity_log`                                                          |                                            |
| any → locked             | Don't contact again, stop reply, Remove me                                         | `do_not_contact`, `people.locked_at`                                    | `next_action_at` everywhere                |

### 5.4 Jobs and retention (D10, D17, D18)

`runHousekeeping(db, now)` runs at startup and daily from a `setInterval` that is `unref()`'d,
guarded on `globalThis` like the db handle, and skipped when `building` (`$app/environment`), so
neither the build nor Vite HMR runs it twice. The event-start job is also checked lazily when an
event's pages load.

| Job                 | When                                                  | Does                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event start         | first run after `starts_at`, `started_job_at IS NULL` | delete unskipped Found rows; set `started_job_at`; log `purge`. Research after start creates no Found rows: the POST answers "event has started, N names not kept"                                                                                                         |
| Planning purge      | `starts_at + 90 d`, or the per-event button           | delete every remaining Found row (skipped included), `researched_at` / `research_requested_at`; set `planning_purged_at`; log. Brief and target companies stay: they are event configuration, not personal data, and "copy from a previous event" needs them **(builder)** |
| Prospect expiry     | daily                                                 | delete people (cascading) with `origin IN ('research','typed')`, no reply ≠ pending on any event, no check-in, no `consent_future_at`, not a customer, `last_event_at + 12 months < now`; log **(builder: typed prospects follow the research clock)**                     |
| Legacy notices      | daily                                                 | legacy Indonesian people with `legacy_notice_at` set, no `legacy_kept_at`, no reply, check-in or registration for 30 days → deleted, logged **(builder: 30 days)**                                                                                                         |
| Registration tokens | per request                                           | checked against the event's current end                                                                                                                                                                                                                                    |
| Do-not-contact      | never                                                 |                                                                                                                                                                                                                                                                            |

Retention table (Settings and README): unapproved Found rows → event start; skipped Found rows →
+90 days; research/typed prospects who never replied → last event + 12 months; legacy Indonesian
attendees → notice + 30 days unless they reply; attendees, customers, anyone who replied → until
deleted; touch and activity logs → with the row/event; do-not-contact → forever.

## 6. Import and research

### 6.1 D365 paste and CSV (D11, `guest-list.ts` extended)

- `HEADERS` already matches `fullname`, `companyname`, `accountname`, `jobtitle`, `email`,
  `emailaddress`, `mobilephone`, `businessphone`, `namalengkap`, `namaperusahaan`, `jabatan`.
  **New** aliases: company ← `parentcustomer`; email ← `emailaddress1`; phone ←
  `mobilephone1`, `telephone1`, `telefonbimbit`; new columns `owner` ← `owner`, `ownerid`;
  `doNotEmail` ← `donotallowemails`, `donotemail`; `doNotPhone` ← `donotallowphonecalls`,
  `donotphone`; `marketing` ← `sendmarketingmaterials`, `donotsendmm`; `d365Status` ←
  `statecode`, `statusreason`. A plain `Status` column maps to `reply` only when its values parse
  as replies; otherwise (Active / Inactive) it is the D365 status. Tests cover the collision.
- Static worksheet exports carry three hidden leading columns whose headers start with
  `(Do Not Modify)`: drop leading columns with that header or a GUID-like first cell.
- Flags: `doNotEmail` → `d365_no_email` (email button hidden); `doNotPhone` → `d365_no_phone`
  (WhatsApp hidden); marketing = No or status Inactive → `d365_suppressed`: the row lands at
  Found with a _suppressed_ marker, Add is refused with the reason, and messaging / chase treat
  it as a lock. Clearing the flag on the person is explicit and logged.
- Owner: fills `companies.owner` only when empty and the value matches a team name
  (case-insensitive, first-name match allowed); otherwise appended to `companies.d365_note`.
- Accounts export (Planning): `accountname`, `website`, `primarycontact`, `owner`, `industry`,
  `mainphone` → `event_companies` (`source = d365`), `companies.is_customer = 1`.
- Every D365 person sets `origin = d365`, `is_customer = 1`; D365 values beat research.
- Blocked companies and do-not-contact hashes are checked per row before insert.

### 6.2 Research (D10, D24, D25)

- Prompt: the known-people list becomes one line per company, _"n people at this company are
  already known; suggest others"_: no names, no URLs. `brief.avoid` and `focus` are passed, but
  any line containing an existing person's `nameKey` is dropped first, and the fields' help text
  says "roles and companies, not names".
- Companies in a run = ticked `event_companies` that are not blocked, taken in batches of 15:
  `GET …/prompt?batch=<n>` serves the first 15 of those whose `researched_at` is NULL or older
  than 24 h, in list order. Default tick =
  `COUNT(people WHERE company_id = X AND locked_at IS NULL) < per_company`; Found rows are not
  people, so a default tick holds while a run is under way. Serving a batch sets
  `research_requested_at` on its companies; the matching POST stamps
  `researched_at` on the companies requested in the last 24 h and not answered since, whether
  or not they returned anyone, so an answer stamps its own batch and never an earlier one again.
- `GET …/prompt` returns 409 when `starts_at IS NULL`, the brief isn't ready or no company is
  ticked; with `batch=0` also when every ticked company was researched in the last 24 h ("All N
  ticked companies were researched in the last 24 hours…", or "The only ticked company was…"
  for one). The refusal is plain text, not kit's JSON envelope, since the command echoes it as
  it arrives. With `batch` ≥ 1 and nothing left it returns 204 with no body. Without `batch`
  (the command from before batches) it serves every ticked company in one prompt and returns
  409 above 15. After `starts_at` the prompt carries a warning line and the POST keeps nothing
  (§5.4), but still stamps `researched_at` first, or the loop would never move on.
- `POST …/suggestions` inserts Found rows (`source = research`), skipping names already live or
  skipped on the event, locked people, blocked companies.
- The command loops over `?batch=0, 1, …` until a 204 or a failure, piping each brief through
  `claude -p` and posting the answer back before asking for the next batch, with
  `EVENT_PLANNER_TOKEN`; new tokens are `ep_…`, `verifyBearer` accepts `^(ep|hdr)_`. It ends
  with "Finished: n batch(es)." and status 0 only after a 204; a failed `claude -p` or POST
  prints "Batch n failed after n−1 posted; run the command again to resume." and a refusal its
  sentence, both with status 1. The page states the run uses the organizer's own Claude Code
  sign-in, and says how many ticked companies sit out the next run as researched today.
- `PRIVACY_URL` is required for messaging research-origin people: without it their message
  buttons are hidden with a hint, and `docs/DEPLOY.md` lists it.

## 7. Messaging (D21, D7, D9)

Kinds: `invitation`, `chase`, `reminder` (with reconfirm link), `thanks_yes`, `followup_maybe`,
`thanks_no`, `legacy_notice`. Languages `id`, `en`, `ms`. Placeholders `{name}` (`greetingName`),
`{event}`, `{date}`, `{venue}`, `{link}`, `{org}`. Resolution: `events.invitation_text`
(invitation only) → `message_templates(kind, language(row))` → built-in default. At render time
the app appends, in this order and in the row's language: the research source line for
research-origin people (_"We found your work details on public pages: {source_url}. How we
handle data: {privacy_url}"_), then **last** the opt-out line. Stored bodies never contain
either, so nothing can drop them. `followUpMessage` becomes `renderMessage(kind, row, person,
event)`; `followUpLink` keeps WhatsApp-when-international / else email and returns null when
`contactable()` says no.

Tapping a message button opens the link and records the touch (kind = invitation when stage ≤
shortlisted, else the kind the rules suggest or the one chosen in the row's message menu), then
`invited_at` / `last_contacted_at`; the _chased ×N_ pill deletes the latest touch (D9). The tap
is recorded with `navigator.sendBeacon` to a `?/touch` action so the link still opens normally.

Registration token: `r.<eventPersonId>.<hmac12>`, `hmac = hmac(secret, 'reg:' + eventId + ':' +
id)` (helpers from `qr-token.ts`); expiry is the event's current end, checked per request. The
token carries only the row id; prefill reads name and company at request time, so no personal
data sits in a URL.

## 8. Privacy and consent (D10, D13, D15, D16)

| Concern           | Stored                                                                                                | Shown                                          | Exported                                                                                                                                | Deleted                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Research findings | Found snapshot; after Add, `people.source_url` + `research_reason`                                    | People › To review; row sheet                  | never                                                                                                                                   | event start (unapproved), +90 d (skipped) |
| Consent           | `consent_event_at`, `consent_share_at` per row; `consent_future_at` per person; `checkins.consent_at` | row and person                                 | consent columns in the People export                                                                                                    | with the row / person                     |
| Partner export    |                                                                                                       |                                                | only `consent_share_at` rows (name, company, title); others as per-company counts; _before_ (yes or confirmed) and _after_ (checked in) |                                           |
| Locked people     | hashes + masked label + reason; `people.locked_at`                                                    | marker; no buttons                             | email, mobile and LinkedIn blanked in every export (§4.5); never named in the partner export, counted instead                           | list: staff removal with reason only      |
| Blocked companies | flag + reason                                                                                         | warning chip; refused on paste/import/research |                                                                                                                                         | unflag                                    |
| Origin            | `people.origin`, `origin_detail`, `event_people.source`                                               | row sheet                                      | Origin column                                                                                                                           | with the person                           |
| Logs              | `activity_log` with ids and counts only                                                               | Activity panel                                 | never                                                                                                                                   | with the event                            |

Origin → behaviour: `research` → source line, 12-month clock, max 2 touches; `typed` → asked
once where the details came from, 12-month clock unless a relationship forms; `d365` → customer,
3 touches, D365 flags honoured; `checkin` → attendee, legacy rules if no future-events box;
`self_registered` → their own consents.

Wording (English; `id` and `ms` seeded with the templates):

- Box 1 (required, unchanged): _"I agree that {org} may keep these details to record my
  attendance and follow up about this event."_
- Box 2: _"{org} may invite me to future events."_
- Box 3 (co-hosts set): _"Share my name, company and title with {co_hosts}."_
- Opt-out, every message: _"Reply STOP if you'd rather not hear from us about events."_ /
  _"Balas STOP jika Anda tidak ingin dihubungi lagi tentang acara."_ / _"Balas STOP jika anda
  tidak mahu dihubungi lagi tentang acara."_
- Registration notice: _"We have your name and company from {org}'s invitation list. Not you?
  [Not me] · [Remove me]."_
- Legacy notice (Indonesian past attendees): one message saying the details come from a past
  event, with the opt-out line; kept only if they reply (§5.4). Malaysian past attendees without
  a ticked box or customer relationship show _not contactable_ until they register.

Deletion is a hard delete with an `activity_log` row (who, when, ids, count); exports log the same.

## 9. Build order

Each phase is one deploy, independently usable; tests are Vitest on `:memory:` databases as today.

| Phase                       | After it the organizer can…                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Schema                                                                                                                                                                     | Tests                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Foundation**          | use the People tab with stages, chips, markers, "me" and owners (Mine chip); Add/Skip/Remove Found rows from research; type names (Shortlisted), paste big lists (Found); D365 paste/CSV with flags and column mapping; pool picker with Prospects; Don't contact again, blocked companies; Settings (team, tokens, phone default, do-not-contact); stripped exports; count-only research prompt; `EVENT_PLANNER_TOKEN`; Found rows deleted at event start (lazy check); target progress | §2.4 whole migration; `events.target_count`, `phone_country`; `companies`, `event_people`, `event_companies`, `touches`, `do_not_contact`, `activity_log`, `settings` keys | migration on a fixture DB (counts, cascade safety via `foreign_key_check`, invited_at backfill, suggestion mapping, origin rules); `findPerson` order, guards, precedence; D365 headers, hidden columns, Status collision, flags; lock hashing and company-rename re-hash; blocked company refusal; chip counts; touch add/clear; prompt has counts and no names; token prefixes |
| **B — Replies in**          | copy a personal registration link; guests RSVP with their own email/mobile and consents; Confirmed count; generic link rows flagged; three consent boxes at check-in; templates per language with opt-out appended; per-event invitation text; phone country and language per company; event settings fields                                                                                                                                                                             | `message_templates`; events: `ends_at`, `language`, `co_hosts`, `invitation_text`; `consent_boxes_since`                                                                   | token sign/verify/expiry/date-change; registration merge paths (match, new person, not-me, remove-me, generic); render order of source/opt-out lines; language resolution                                                                                                                                                                                                        |
| **C — Rules and retention** | see next actions, Due today, Mine-due-today on the phone; reminders with reconfirm; housekeeping (event-start, 90-day, 12-month, legacy); kept-until dates; Delete planning data; Activity panel; per-event chase override; legacy notices                                                                                                                                                                                                                                               | `next_action_*`, `chase_rules`, `started_job_at`, `planning_purged_at`, `chase_defaults`, `legacy_*`                                                                       | `computeNextAction` table cases (working days, caps, stop-before, reminder, contactable); jobs on fixtures; `keptUntil`; scheduler guard                                                                                                                                                                                                                                         |
| **D — Scale-up**            | research ticks with defaults and `researched_at`, research in batches of 15; bulk actions (laptop multi-select, phone swipes, per-company all); copy to another event; copy brief + targets; partner export (before/after); prospects export; D365 accounts paste                                                                                                                                                                                                                        | `event_companies.research*`                                                                                                                                                | batches of 15 and the 24 h rule; requested/researched stamping; bulk transactions; partner export consent filter; copy semantics                                                                                                                                                                                                                                                 |

Phase A is the largest because the data migration must happen once, with the production backup
copy, and everything that stores personal data must retain and strip correctly from the first
deploy. `scripts/seed-demo.ts`, the specs and `docs/DEPLOY.md` change in the same phase.

**Status** (branch `people-pipeline`):

- **A — Foundation**: built. The migration, People tab, add form with the D365 people paste,
  do-not-contact list, Settings, stripped exports (`exportRow`), the Prospects export, the
  count-only prompt, and the research ticks with the computed default and the
  `research_requested_at` / `researched_at` stamping (`planning.ts`, `planning.spec.ts`).
- **B — Replies in**: built. Registration links and page, consent boxes, templates, per-event
  invitation text, event settings fields.
- **C — Rules and retention**: built. Next actions, Due today, housekeeping, kept-until dates,
  Delete planning data, the Activity panel, chase overrides, legacy notices.
- **D — Scale-up**: built. Bulk actions and phone gestures, copy to another event (`bulk.ts`);
  copy brief + targets, the D365 accounts paste (`accounts-list.ts`, `planning.ts`); the partner
  export before / after (`exports.ts`, `partners.csv`); research in batches of 15 (`?batch=<n>`,
  the 24 h rule, 204 when nothing is left) instead of a 409 above 15 — one `claude -p` session
  over dozens of companies ran for hours and lost everything when its last step failed
  **(builder)**. The industry from an accounts export is
  kept as a company note; the primary contact and main phone are read for the mapping but not
  stored **(builder)**. A locked person who ticked the share box is counted, never named, in
  the partner export: stricter than the stripped exports, since the file leaves the
  organization **(builder)**. The _before_ list keeps a yes-sayer who has since checked in.

## 10. Out of scope / later

Sending messages from the app (WhatsApp Business API, email); digests or push for due items;
live Dynamics 365 integration; LinkedIn scraping or fetching; per-user accounts; public-holiday
calendars; multi-instance deployment; a stored no-show state (it stays derived).

## Appendix: the decisions

D1 shared login, owner per company inherited with per-person override, Mine filter, "me" per
browser, no accounts · D2 four sources (typed, D365 export, pool, research) · D3 the six stages
with markers; Confirmed = registration yes or reconfirm · D4 one People list with chips;
Planning = brief, companies, command · D5 typed → Shortlisted, big pastes → Found · D6 cross-event
pool; Found rows never enter it; prospects behind a chip · D7 record, never send; personal
registration links · D8 one target number · D9 sends one by one, stamped on tap · D10 count-only
prompt, opt-out on every message, source line, 90-day planning retention, SRKK account · D11
companies typed / copied / D365 paste; header mapping; D365 flags honoured · D12 auto-merge order
and precedence · D13 do-not-contact list and company blocks · D14 phone country per event and
company drives language · D15 three consent boxes, partner export, legacy reuse by country · D16
origin on every person · D17 events need a date; purge at start · D18 retention · D19 phone view
Mine-due-today · D20 chase rules and in-app due counts · D21 message kinds, languages, templates ·
D22 bulk actions · D23 settings page and activity log · D24 earlier bindings (no scraping, human
approval, token API, on-demand research, guided brief) · D25 research ticks, batches of 15,
researched_at.
