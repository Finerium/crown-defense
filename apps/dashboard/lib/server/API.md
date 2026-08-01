# Demo surface API

Server contract for the hackathon demo surface. Three UI agents build against this file, so it is exact.
All payload types are exported from `apps/dashboard/lib/server/types.ts` and are safe to import type-only
from a `'use client'` component:

```ts
import type { AliranEvent, ScenarioSummary, KonsolStatus } from '../lib/server/types';
```

All routes run on the Node runtime (`export const runtime = 'nodejs'`) with `dynamic = 'force-dynamic'`.
User-facing message strings are Indonesian. Timestamps are UTC ISO-8601 with milliseconds.

---

## THE INVARIANT: the console has no code path to an alert

Pressing a console button starts a workload and nothing else. The detection engine runs server side inside
the telemetry stream and decides on its own from C1 telemetry. No request, field, event or flag originating
from the console tells the dashboard to show an alert, a verdict, a severity or an action.

How this is enforced, architecturally:

1. **Import graph.** `app/api/konsol/*/route.ts` imports only `lib/server/auth.ts`, `lib/server/ratelimit.ts`,
   `lib/server/scenarios.ts`, `lib/server/store.ts` and `lib/server/types.ts`. None of those imports
   `@crown/detection`, `@crown/containment`, `@crown/audit`, `@crown/agent` or `lib/server/runner.ts`.
   `scenarios.ts` imports `@crown/simulator` only (which imports `@crown/contracts` only). There is no
   reachable code on the console request path that can construct a `DetectionVerdict`.
2. **Type surface.** `WorkloadRequest` is exactly `{ runId, scenarioId, requestedAt, requestedBy }`. There is
   no field an alert could travel in. `KonsolStatus` has no verdict, severity, signal or action field.
3. **Response shape.** `POST /api/konsol/jalankan` returns exactly `{ runId, accepted: true }`.
4. **Single producer.** `lib/server/runner.ts` is imported by exactly three route files:
   `api/telemetri/aliran`, `api/audit/verifikasi` and `api/audit/rusak`. Only the first produces verdicts.

---

## Routes

| Method | Path | Auth | Rate limit |
| --- | --- | --- | --- |
| POST | `/api/konsol/masuk` | none (this is sign-in) | 5 per 5 min per IP |
| POST | `/api/konsol/keluar` | none | none |
| GET | `/api/konsol/katalog` | session | none |
| POST | `/api/konsol/jalankan` | session | 6 per 5 min per session, 40 per hour globally |
| GET | `/api/konsol/status` | session | none |
| GET | `/api/telemetri/aliran` | none (public SSE) | none |
| GET | `/api/dial` | none | none |
| POST | `/api/dial` | session | none |
| POST | `/api/audit/verifikasi` | none | none |
| POST | `/api/audit/rusak` | none | none |
| POST | `/api/analyze` | none | 4 per 10 min per IP, 25 per hour globally |

Session = the signed `konsol_sesi` cookie set by `/api/konsol/masuk`. Missing or invalid gives `401` with
`{ pesan: string }`. Every rate limit gives `429` with `{ pesan: string }`. Every limit number reads from an
env var (see `.env.example`).

---

### POST `/api/konsol/masuk`

Sign in to the console.

Request (Zod):

```ts
z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(400),
  ingatSaya: z.boolean().optional(), // 30 day session instead of 8 hours
})
```

Response `MasukResponse`:

```ts
{ ok: boolean; label: string | null; pesan: string | null }
```

`200` with `ok: true` and `label` set (the operator's display name) sets the session cookie.
`400` malformed, `401` wrong credentials, `429` rate limited, `503` when `KONSOL_SECRET` is unset.
Deny by default: with `KONSOL_USERS` unset or unparseable, every attempt returns `401`.

### POST `/api/konsol/keluar`

No body. Clears the cookie. Response `PesanResponse` = `{ pesan: string }`.

### GET `/api/konsol/katalog`

Response: `ScenarioSummary[]` (8 entries, 4 `group: 'serangan'` then 4 `group: 'sah'`).

```ts
interface ScenarioSummary {
  id: string;
  group: 'serangan' | 'sah';
  labelId: string;   // Indonesian label
  labelEn: string;   // English label
  host: string;      // fleet host, also the C1 host_id of the run
  segment: string;
  technique: string | null;   // 'T1486' for the encryptors, null for benign
  descId: string;             // one line, Indonesian
  family: string | null;            // attack only, from the @crown/simulator battery
  mode: string | null;              // attack only, evasion mode
  filesPerSecond: number | null;    // attack only
  blockBytes: number | null;        // attack only, intermittent block size
  plantCanary: boolean | null;      // attack only
  workload: string | null;                    // benign only, @crown/test-infra workload name
  expectedNonIsolationReasonId: string | null; // benign only, Indonesian
  noteId: string | null;  // honesty note, Indonesian. Non-null only on 'backup-lumpuh'.
}
```

Scenario ids: `rad-ws-radiologi`, `ehr-lateral`, `pacs-terputus`, `backup-lumpuh` (attacks);
`backup-terjadwal`, `konversi-citra`, `kompaksi-log`, `enkripsi-arsip` (benign).

`backup-lumpuh` carries `noteId`: the safe simulator models the mass-encryption behaviour on the backup
server, not the Volume Shadow Copy deletion itself. **Show this note in the UI.** It is not decoration.

### POST `/api/konsol/jalankan`

Request (Zod): `z.object({ scenarioId: z.enum(SCENARIO_IDS) })`. Anything else is `400`.

Response `JalankanResponse`, and this is the complete response:

```ts
{ runId: string; accepted: true }
```

### GET `/api/konsol/status`

Response: `KonsolStatus | null` (bare `null` when no run has been requested yet).

```ts
interface KonsolStatus {
  runId: string;
  scenarioId: string;
  phase: 'antre' | 'berjalan' | 'selesai';
  eventsEmitted: number;
  filesTouched: number;
  elapsedMs: number;
}
```

There is no verdict field in this type and there must never be one.

### GET and POST `/api/dial`

`GET` is public and returns `DialResponse` = `{ position: AutonomyMode }`.
`POST` requires a session. Request (Zod): `z.object({ position: AutonomyMode })` where `AutonomyMode` is the
frozen C5 enum `'MONITOR_ONLY' | 'ALERT_RECOMMEND' | 'HUMAN_GATED' | 'FULL_AUTO'`. Returns `DialResponse`.
Default is `CROWN_DIAL_DEFAULT`, itself defaulting to `MONITOR_ONLY`.

The dial applies to the NEXT run: `runScenario` reads it when the stream picks the workload up.

It is process memory, never persisted. A restart or a cold start returns it to `CROWN_DIAL_DEFAULT`
(`MONITOR_ONLY`), on purpose: the dial gates destructive autonomous action, so it fails safe rather than
inheriting an escalated position from a previous process. Read `GET /api/dial` on mount; do not assume.

### POST `/api/audit/verifikasi`

No body. Recomputes the last completed run's hash chain with the real `@crown/audit` verifier.

```ts
interface ChainVerificationResult {
  valid: boolean;
  brokenAt: number | null; // chain_seq of the first broken record
  reason: string | null;
  count: number;
}
```

An empty chain verifies as `{ valid: true, brokenAt: null, reason: null, count: 0 }`.

The chain lives in process memory, sealed with `AUDIT_INTEGRITY_KEY` or, when that is unset, a per-process
random key. A cold start therefore reports `count: 0` rather than a chain it could not verify. Run a
scenario, then verify.

### POST `/api/audit/rusak`

No body. Copies the chain, mutates one record's `detail`, verifies the copy. The stored chain is untouched.

```ts
interface TamperDemoResult {
  mutatedIndex: number;        // -1 when the chain is empty
  mutatedChainSeq: number | null;
  mutatedField: string;        // 'detail'
  before: ChainVerificationResult;  // valid: true
  after: ChainVerificationResult;   // valid: false, brokenAt = the mutated record's chain_seq
  link: {
    chain_seq: number;
    expected_record_hash: string;  // recomputed over the mutated content
    stored_record_hash: string;    // what the record still claims
    next_stored_prev_hash: string | null;
  } | null;
}
```

### POST `/api/analyze`

Unchanged `200` response shape (live LLM incident report). Now returns `429` `{ pesan }` when limited.

---

## GET `/api/telemetri/aliran` (Server-Sent Events)

Public. `text/event-stream`. `maxDuration = 300`, so the connection is recycled about every five minutes;
`EventSource` reconnects on its own. Each frame is `event: <name>\ndata: <JSON>\n\n`, where the JSON is the
event object itself and also carries `type` equal to the event name (so `onmessage` handlers and named
listeners both work).

```ts
const es = new EventSource('/api/telemetri/aliran');
es.addEventListener('tik', (e) => { const tik: TikEvent = JSON.parse(e.data); });
```

Event names: `detak`, `mulai`, `tik`, `putusan`, `kontainmen`, `audit`, `selesai`, `galat`.

### `detak`, idle baseline

Emitted every `TELEMETRI_HEARTBEAT_MS` (default 2000) while nothing is running. It carries no telemetry,
because nothing is happening and inventing some would be a lie. Use `seq` to prove the stream is alive.

```ts
{ type: 'detak'; at: string; seq: number; idle: boolean; dial: AutonomyMode }
```

### `mulai`, a run started

```ts
{
  type: 'mulai';
  runId: string;
  at: string;
  scenario: ScenarioSummary;
  dial: AutonomyMode;      // the dial this run is decided under
  totalEvents: number;     // C1 events the oracle produced
  pacingGapMs: number;     // delivery pacing between ticks, see "Pacing"
}
```

### `tik`, one C1 event ingested by the real engine

One per telemetry event, in order, paced. `signals` is the engine's raw five-evaluator output, verbatim.

```ts
{
  type: 'tik';
  runId: string;
  at: string;            // when the server emitted this frame
  index: number;         // 0-based index in the C1 stream
  eventType: string;     // C1 event_type, e.g. 'FILE_WRITE' | 'CANARY_TOUCHED'
  filePath: string | null;
  emittedAt: string;     // the C1 event's own emitted_at (SIMULATED timeline)
  signals: DetectionSignal[];  // C2: all five, each { signal_type, fired, score, detail }
  verdict: 'BENIGN' | 'SUSPICIOUS' | 'MASS_ENCRYPTION';
  recommendedAction: 'NONE' | 'MONITOR' | 'ALERT' | 'ISOLATE_HOST';
  confidence: number;
  corroboratingCount: number;
  fastPath: boolean;
  suppressedByAllowlist: boolean;
  suppressionReason: string | null;  // the engine's own wording, when suppressed
  counts: RunCounts;
}

interface RunCounts { eventsIngested: number; filesTouched: number; writes: number; renames: number }
```

`filesTouched` = distinct `file.path` across mutation events. `writes` = `FILE_WRITE` plus `FILE_CREATE`.
`renames` = `FILE_RENAME` events; the simulator signals renaming through `op_window.renames_per_sec` rather
than a separate event, so `renames` is legitimately 0 on attack runs. Do not present it as "no renames".

The five `signal_type` values in order: `CANARY_TAMPER`, `ENTROPY_DELTA`, `OP_FREQUENCY`,
`TYPE_HEADER_CHANGE`, `FORMAT_VALIDATION_FAIL`. `CANARY_TAMPER` and `FORMAT_VALIDATION_FAIL` are the
encryption-discriminating pair; the other three are context signals that benign work also trips.

### `putusan`, a MASS_ENCRYPTION verdict

Emitted at most once per run, on the first `MASS_ENCRYPTION` verdict label.

```ts
{
  type: 'putusan';
  runId: string;
  at: string;
  index: number;
  verdict: DetectionVerdict;  // the full frozen C2 record
  latency: LatencyReport;     // containment_wall_ms still null here
}
```

**Read `verdict.recommended_action` before rendering anything.** It is normally `ISOLATE_HOST`, but on the
`enkripsi-arsip` scenario it is `ALERT`: the engine labels legitimate full-disk encryption `MASS_ENCRYPTION`
and the operator allow-list (AC-FP-02) then suppresses the destructive action, so containment comes back
`ALERT_ONLY` and no host is isolated. That is the designed behaviour and the most interesting frame in the
demo. Never render `putusan` as "host isolated": the `kontainmen` frame is what says whether anything was
done. The other three benign scenarios never emit `putusan` at all.

### `kontainmen`, the containment decision

Emitted once, right after `putusan`, carrying the `ContainmentDecision` verbatim from the real module.

```ts
{
  type: 'kontainmen';
  runId: string;
  at: string;
  decision: {
    configuredMode: AutonomyMode;
    effectiveMode: AutonomyMode;
    action: 'ISOLATE_HOST' | null;
    classification: 'AUTO' | 'ASK_TO_ACT' | 'NEVER_AUTO' | null;
    disposition: 'EXECUTE' | 'PROPOSE' | 'ALERT_ONLY' | 'MONITOR_ONLY' | 'DENY_FAILSAFE';
    reason: string;   // the module's own sentence. Render it as is; do not paraphrase it.
  };
  executed: boolean;
  outcome: string | null;        // 'EXECUTED' | 'REJECTED' | 'FAILED', null when no command was issued
  outcomeReason: string | null;
  actionRecordId: string | null;
  command: {                     // null unless a C6 command was actually issued
    command_id: string;
    command_type: string;
    target_host_id: string;
    action_record_id: string;    // the C4 record that PRECEDED this command
    rollback_deadline: string | null;
  } | null;
}
```

Dispositions by dial, for a `MASS_ENCRYPTION` verdict: `FULL_AUTO` -> `EXECUTE`, `HUMAN_GATED` -> `PROPOSE`
(queued for a second distinct approver, no command), `ALERT_RECOMMEND` -> `ALERT_ONLY`, `MONITOR_ONLY` ->
`MONITOR_ONLY` (log only). At `MONITOR_ONLY` `executed` is `false` and `command` is `null`.

### `audit`, one appended action record

Emitted as each record is sealed onto the chain, so it always arrives before the `kontainmen` frame that
describes the command. That ordering is the audit-precedes-action invariant, visible on the wire.

```ts
{ type: 'audit'; runId: string; at: string; record: ActionRecord; chainLength: number }
```

`ActionRecord` is the frozen C4 shape and includes `chain_seq`, `prev_hash`, `record_hash`, `action_type`,
`autonomy_mode`, `classification`, `actor`, `approver`, `justification`, `reversible`, `rollback_deadline`,
`outcome`, `detail`.

### `selesai`, terminal summary

```ts
{
  type: 'selesai';
  runId: string;
  at: string;
  scenarioId: string;
  finalVerdict: 'BENIGN' | 'SUSPICIOUS' | 'MASS_ENCRYPTION';
  destructiveVerdictReached: boolean;
  containmentExecuted: boolean;
  disposition: Disposition | null;
  auditChainLength: number;
  auditHeadHash: string | null;
  counts: RunCounts;
  latency: LatencyReport;
  scratchRemoved: boolean;   // the temp scratch directory was deleted
}
```

### `galat`, the run failed

```ts
{ type: 'galat'; at: string; runId: string | null; pesan: string }
```

---

## Latency, and what each number honestly is

```ts
interface LatencyReport {
  detection_wall_ms: number | null;
  detection_timeline_ms: number | null;
  containment_wall_ms: number | null;
  paced_out_ms: number;
  labels: {                      // Indonesian and English sentences, ready to print
    detection_wall_ms: { id: string; en: string };
    detection_timeline_ms: { id: string; en: string };
    containment_wall_ms: { id: string; en: string };
    paced_out_ms: { id: string; en: string };
  };
}
```

- **`detection_wall_ms`** is real wall clock from `Date.now()` before the first `engine.ingest()` to
  `Date.now()` immediately after the ingest that returned the destructive verdict, minus the measured
  pacing sleeps in that span. Real processing latency of the real engine.
- **`detection_timeline_ms`** is the delta between the `emitted_at` of the first telemetry event and the
  `emitted_at` of the event that produced the verdict. This is latency on the **simulated timeline**.
  Never present it as a measured production latency.
- **`containment_wall_ms`** is real wall clock from the verdict to the terminal containment outcome,
  covering the audit appends and the command issue.
- **`paced_out_ms`** is the pacing that was subtracted, published so the subtraction is auditable.

Nothing is hardcoded: all four are measured per run. Print the matching `labels` string beside any number
you show; that is what it is there for.

## Pacing

Ticks are delivered on a delay so a person can watch the signals light up. The gap is
`clamp(CROWN_DEMO_RUN_WINDOW_MS / eventCount, CROWN_DEMO_TICK_MIN_MS, CROWN_DEMO_TICK_MAX_MS)`, which lands
a run in roughly 6 to 10 seconds regardless of event count. Pacing changes delivery speed only. The
telemetry, the signals, the verdict and the audit records are exactly what the real code produced.

## What the demo actually runs

Every run is the real closed loop: the safe simulator or the benign false-positive suite produces C1
telemetry, the committed `DetectionEngine` decides, and the committed `ContainmentModule` applies the dial
and binds a hash-chained C4 record before any C6 command. There is no demo-only detector anywhere.

The simulator is benign, reversible, key-retaining, single-directory, non-propagating and offline. Each run
writes only inside a freshly created directory under `os.tmpdir()`, removed when the run ends. Attack runs
carry the scenario's fleet host in `host_id`; that is an identity relabel of the oracle's fixture host and
touches no signal-bearing field.
