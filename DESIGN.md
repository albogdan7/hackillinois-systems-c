# Recurring Shifts — Design

How recurring shifts should work, and why. The goal is Google Calendar semantics:
**editing the series changes every occurrence, editing one occurrence changes only
that one**, without storing thousands of rows up front.

## The core problem

The naive approach (what the first version did) eagerly expands a recurrence rule
into one `Shift` row per occurrence at creation time. That conflates two different
things:

- the **definition** of a recurrence (the rule), and
- the **instances** of it (each dated occurrence).

Once they're conflated, every edit path creates drift: changing the rule doesn't
update the already-generated rows, per-occurrence edits and series edits fight each
other, and there's no stable way to say "this specific occurrence." Google Calendar
(and the iCalendar / CalDAV standard it implements) avoids this by keeping definition
and instances separate.

## The model

| Concept | What it is | Stored? |
|---|---|---|
| **Series** | The rule: RRULE + base start + duration + default fields | Yes — one row |
| **Occurrence** | A single computed slot | No — expanded from the rule on read |
| **Override** | An occurrence that was signed-up-for, edited, or cancelled | Yes — a `Shift` row |

The key idea: **occurrences don't exist as rows until they need an identity.** They
are computed from the rule on demand (*virtual*). A row is created only when a
specific occurrence must diverge — someone signs up, or someone edits/cancels that
one. This is **lazy materialization**.

### The stable key: `recurrenceId`

An override has to say *which* occurrence it replaces. The naive choice — an index
("the 3rd shift") — breaks the moment the rule's interval or start changes. The
correct key is the occurrence's **original start datetime**, which CalDAV calls
`RECURRENCE-ID` and the Google Calendar API calls `originalStartTime`. It's
immutable and survives series edits.

So a concrete `Shift` carries `(seriesId, recurrenceId)`, where `recurrenceId` is the
original start of the slot it stands in for. That pair is the natural key of an
override.

### Why `recurrenceId` is collision-free

A fair objection: can't two occurrences share the same original start? No — for three
reasons, and one caveat:

- **The key is the pair `(seriesId, recurrenceId)`, not the datetime alone.** Two
  different series can each have a Monday-9am slot; `seriesId` keeps them distinct. The
  datetime only has to be unique *within* a series.
- **An RRULE can't emit the same instant twice.** A recurrence rule's occurrences are,
  by definition, a *set* of distinct start instants (RFC 5545 dedupes them). "Every
  Monday" yields Oct 6, 13, 20, 27 — there is no way for one series to produce the same
  slot twice. So original-start is naturally unique within a series.
- **Key on the *original* start, never the current one.** If you edit Oct 20 and drag
  it to start at Oct 27's time, its `startTime` changes but its `recurrenceId` stays
  `Oct-20-9am` — the slot it will forever represent. Keying on the immutable original
  start is what prevents an edited occurrence from colliding with another.

**Caveat — store `recurrenceId` as an absolute instant (UTC), not wall-clock.** On a
DST fall-back night, the wall-clock time 1:30am happens twice; stored as local text
(`"2026-11-01T01:30"`) two real occurrences would collide. Stored as a UTC instant the
two 1:30am's are different instants and stay distinct. (Same reason the current
hand-rolled `setHours` date math is fragile, and part of why the plan swaps to a real
`rrule` library.)

## Schema

```
ShiftSeries  (replaces ShiftTemplate)
  rrule            // frequency, interval, byDay, until/count — use a real RRULE lib
  dtStart          // first occurrence start
  duration         // ms; per-occurrence endTime is derived, not stored
  defaults: { title, description, locationId, eventId,
              maxVolunteers, minAge, requiredSkills }
  exceptions[]     // recurrenceIds to skip (EXDATE — cancelled single occurrences)

Shift  (gains three fields)
  seriesId?        // which series this materialized from (null = standalone shift)
  recurrenceId?    // original start of the slot it occupies — the pin
  detached: bool   // true = "edit all" must NOT overwrite this one
  ...existing fields
  UNIQUE INDEX (seriesId, recurrenceId)   // one override per slot; makes signup races safe
```

## Reading a schedule (expand-on-read)

Volunteers must see occurrences that have no row yet. "No row" means **computed, not
invisible** — the list endpoint expands the rule at query time:

```
GET /shifts?from&to
  1. concrete = Shift.find({ startTime within [from, to] })
  2. series   = ShiftSeries.find({ rule overlaps [from, to] })
  3. for each series: expand rrule over [from, to] → slots
  4. for each slot (skip if in exceptions):
        if a concrete row exists for (seriesId, recurrenceId) → use it
        else → synthesize a shift object in memory from series defaults
  5. return concrete + synthesized, sorted by startTime
```

A synthesized shift looks almost like a real one; it just has **no `_id`** (there's no
row), so it's identified by `seriesId` + `recurrenceId`, and `spotsAvailable` equals
`maxVolunteers` (a non-existent shift can't have signups).

```jsonc
// concrete — has a signup
{ "_id": "shift_A", "seriesId": "series_1",
  "start": "2026-10-13T09:00", "maxVolunteers": 3, "spotsAvailable": 2 }

// virtual — nobody signed up yet, no _id
{ "seriesId": "series_1", "recurrenceId": "2026-10-20T09:00",
  "start": "2026-10-20T09:00", "maxVolunteers": 3, "spotsAvailable": 3 }
```

Only the *visible date window* is ever expanded, so recomputing on each read is
cheap — the same reason a calendar only renders the month you're looking at.

## Signup forces materialization

A `Signup` must reference a stable `shiftId`. So a signup is the second trigger (after
an edit) that turns a virtual slot into a real row:

```
POST /signups  { seriesId, recurrenceId, volunteerId }
  1. no shiftId → upsert a Shift for (seriesId, recurrenceId)  // idempotent
  2. attach the signup to that shift
```

The `UNIQUE (seriesId, recurrenceId)` index makes two simultaneous signups converge on
one shift instead of racing to create duplicates. From then on, that occurrence is
concrete and every future read returns the stored row.

A signed-up shift is one you must never silently delete on a series edit — which is
exactly what the model guarantees, since materialized shifts are skipped by "edit all"
(see below).

## The three edits (Google Calendar semantics)

- **Edit all** → patch `ShiftSeries` defaults/rrule. Virtual occurrences recompute for
  free. Concrete shifts with `detached: false` are updated too; `detached: true` ones
  are left alone. (Google's "keep your changes to some events?" prompt = whether to
  also reset detached ones.)

- **Edit this one** → materialize the `Shift` for that `recurrenceId` if needed, set
  `detached: true`, apply the change. Future "edit all" skips it. Cancel-this-one = add
  the `recurrenceId` to `exceptions` (or keep the row with `status: cancelled`).

- **This and following** → **split the series**: set the old series' `until` to the day
  before, then create a new `ShiftSeries` from that date with the new values. This is
  literally how Google implements it.

The `detached` flag is the whole mechanism: it's the line between "follows the series"
and "has a life of its own."

## Worked example

Create: *"Front desk — every Monday, 9am–12pm, starting Oct 6 2026."*

Right after creation, **one** row exists (the series); no shift rows. Then:

- Alice signs up for **Oct 13** → materializes `shift_A` (`detached: false`).
- Someone moves **Oct 20** to 10am → materializes a row (`detached: true`,
  `recurrenceId` still `2026-10-20T09:00`, `startTime` `2026-10-20T10:00`).

October now resolves to:

```
Oct 6   → virtual   (computed from series, no row)
Oct 13  → shift_A   (concrete: has a signup, follows series edits)
Oct 20  → concrete  (concrete: edited, detached from series edits)
Oct 27  → virtual   (computed from series, no row)
```

Rename the series to "Reception" → Oct 6/27 reflect it instantly (virtual), Oct 13
updates (not detached), Oct 20 keeps its manual edit (detached).

## Standard vs. adaptation (worth volunteering in an interview)

**Genuinely the industry standard (iCalendar / RFC 5545, as exposed by Google's API):**

| This design | iCalendar / Google Calendar API |
|---|---|
| `ShiftSeries` with an RRULE | Master event with a `recurrence` field |
| `recurrenceId` = original slot start | `RECURRENCE-ID` / `originalStartTime` |
| Override `Shift` → `seriesId` | Exception event → `recurringEventId` |
| `exceptions[]` | `EXDATE` |
| expand-on-read | `events.instances()` |
| "this and following" = split | truncate master `UNTIL` + new series |

**My adaptations, because this is a signup system, not a display calendar:**

- **Materialize-on-signup.** Google only stores a row when an instance is *edited or
  cancelled*; it has no "sign up for an occurrence" concept. A `Signup` needs a stable
  `shiftId`, so a signup is a second materialization trigger.
- **The explicit `detached` flag.** Google infers detachment from the *existence* of an
  exception event. I need the flag because materialize-on-signup creates a case Google
  never has: a concrete row that hasn't been individually edited and so should *still*
  follow "edit all."

Google's actual internal storage is proprietary; this describes the model their API
exposes and the standard it's built on, not their literal tables.

## Implementation plan (phased)

1. **Model (done).** Additive, forward-compatible groundwork only:
   - Replaced the hand-rolled date arithmetic with the `rrule` library. Occurrences are
     now computed in UTC, so times no longer drift across timezones/DST (verified by a
     date-level test run under four timezones incl. a half-hour offset).
   - Added `recurrenceId` and `detached` to `Shift`, plus a **partial** unique index on
     `(templateId, recurrenceId)` (partial so standalone shifts don't collide on null).
   - Generation stamps each shift with `recurrenceId = startTime` and `detached: false`.
   - **Deferred:** the `ShiftTemplate` → `ShiftSeries` / `templateId` → `seriesId`
     rename and the `/shift-templates` route rename. Renaming the HTTP surface now would
     mean two contract breaks, since step 4 introduces `/series` endpoints. The rename
     lands as one isolated commit once the behavior justifies it (step 4/5). The unique
     index and fields are named to travel with that rename.
2 + 3. **Read path & signup materialization (done, bundled).** These had to ship
   together: stopping eager generation is what makes occurrences virtual, but a virtual
   occurrence has no `shiftId`, so signups would break unless materialize-on-signup lands
   at the same time.
   - `expandSeries(series, range, overrides)` — pure, DB-free: expands the rule over a
     bounded window and overlays concrete override shifts (matched by `recurrenceId`).
     Unit-tested without a database.
   - `GET /shift-templates/:id/occurrences?from&to` — bounded read endpoint (rejects a
     missing range or one wider than `MAX_RANGE_DAYS`). Purpose-built rather than
     retrofitting the general `GET /shifts`, whose optional `from`/`to` can't bound an
     expansion and whose DB pagination can't page a virtual+concrete merge.
   - `materializeOccurrence(templateId, recurrenceId)` — idempotent upsert on the unique
     `(templateId, recurrenceId)` index; validates the slot is real; sets
     `status: published`. `POST /signups` now accepts either `shiftId` or
     `templateId + recurrenceId`, resolving the latter to a concrete shift *before* the
     existing signup logic runs (so that heavily-tested path stays on a `shiftId`).
   - **Publish default:** a series' occurrences are published / open for signup by
     default. Per-occurrence draft/unpublish is future work.
   - **Eligibility before materialization:** a signup to a virtual occurrence is checked
     (skills/age/overlap) against the series' defaults *before* the row is created, so a
     rejected request never leaves an orphaned occurrence behind. The row is upserted
     only once every check passes.
   - Eager bulk generation is removed — so the Phase-5 "cleanup" is already folded in.
4. **Edit path (done).** The three Google-Calendar edit semantics:
   - **Edit all** — `PUT /shift-templates/:id`. Field changes (`title`, `description`,
     `maxVolunteers`, `minAge`, `requiredSkills`) patch the series *and* propagate to
     materialized-but-not-detached shifts via `updateMany({templateId, detached: false})`;
     virtual occurrences recompute for free; detached ones are skipped. This three-way
     split (virtual / non-detached concrete / detached) is the payoff of the model.
   - **Edit this one** — `PUT /shift-templates/:id/occurrences` with a `recurrenceId`.
     Materializes the occurrence (same idempotent trigger as a signup) and sets
     `detached: true`, then applies the change. Editing an already-concrete series shift
     via `PUT /shifts/:id` likewise flips `detached: true`.
   - **This and following** — `PUT /shift-templates/:id/split` at an occurrence slot. The
     original series keeps the occurrences before the split; a new series carries the rest
     with the given field changes; materialized occurrences at/after the split are
     re-pointed to the new series. The rule *shape* (frequency/interval/daysOfWeek) is
     preserved across the split.
   - **Off-rule-override gap — dissolved, not guarded.** A `recurrenceRule` change on
     `PUT /shift-templates/:id` is rejected with **409** once any occurrence has
     materialized ("split instead"). Since the rule can't change out from under existing
     occurrences, and split preserves the rule shape (so re-pointed shifts stay on-rule),
     an override can never fall off its series' rule — so `expandSeries` needs no special
     handling. Editing a single occurrence's time changes its `startTime` but never its
     `recurrenceId`, so it still overlays onto its slot.

**Not done — the `ShiftTemplate` → `ShiftSeries` rename.** Deferred indefinitely. It's a
pure find-replace across the folder, route, ~15 OpenAPI spots, and every test, with zero
behavioral or design value and real breakage risk. The design uses "series" terminology;
the code implements it under the original `ShiftTemplate` / `templateId` names. The
schema fields and index are already named to travel with the rename if it's ever done.

### Still open (future work)
- **Aggregating over virtual occurrences** in `getEventSummary` / `getEventShifts` (see
  the deferral note above) — unreachable until a series is attached to an event.
- **`GET /shifts` does not surface virtual occurrences** — only the per-series
  `/occurrences` endpoint expands them. A global calendar view would merge across series.
- **Edit-all doesn't re-validate existing signups** against a newly-raised `minAge`.

### Deferred by design: aggregating over virtual occurrences

`getEventSummary` (fill-rate denominator, total hours) and `getEventShifts` read `Shift`
rows directly. Once occurrences are virtual, an event-attached series' un-signed-up
occurrences have no rows, so these readers would under-count. **This is deferred, not
broken, because nothing attaches a series to an event today** (templates carry an
optional `eventId` but no code path sets it; all event shifts are standalone `POST
/shifts` rows, which stay concrete). Reconciling it means either materializing at report
time or expanding inside the aggregation layer — a real tradeoff to make when
event-attached series actually exist. Until then the inconsistent surface is unreachable.

### A bug this design deletes at the root

The Phase-1 `minAge`-drop bug came from `generateShifts` manually copying template fields
into each row and forgetting one. Going virtual removes that copy entirely — occurrences
read `series.minAge` (and every other field) directly in `expandSeries`, so the whole
class of "forgot to copy a field" bugs disappears. The old per-row `minAge`/`>100` tests
were rehomed onto the occurrences endpoint and `expandSeries`, and the
delete-nullifies-`templateId` test now runs against a shift materialized via signup.
