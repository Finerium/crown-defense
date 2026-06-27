# Air-Gapped Real-Malware Detonation Runbook & SOP

**Status:** Documentation only. **Crown Defense's autonomous build never executes this.**
**Audience:** Ghaisan's team (human operators). **Classification:** internal, handle as hazardous-material procedure.

---

## 0. The hard safety boundary (read first, non-negotiable)

Crown Defense's autonomous build pipeline (the Orchestrator and every subagent) **NEVER downloads, handles,
builds, stores, or executes real or live malware.** That is a refusal-and-stop condition, not a capability gap.
The build proves detection against the **SAFE simulator** (`@crown/simulator`: benign, reversible, key-retaining,
single-directory, non-propagating, no network). Validation against **real ransomware families** is a
**human-operated, out-of-band activity** performed by your team in a physically isolated lab, following this
runbook. The Orchestrator wrote this document; a human executes it.

If at any point a step would route a real sample onto a build machine, a developer workstation, a networked
host, or any system reachable from the corporate network — **STOP. That is out of scope and unsafe.**

---

## 1. Purpose & scope

Validate that the Crown Defense detection engine (multi-signal fusion: canary, entropy-delta, op-frequency,
type/header, format-validation) and the containment path behave against **real** ransomware families the way
they behave against the safe simulator's evasion battery (full, intermittent, header-only, first-4KB,
low-and-slow). This closes OQ-6: the build proves the simulator battery; the team proves real-family behavior here.

In scope: detonation of curated samples in an isolated lab against an instrumented Crown Defense agent.
Out of scope: any detonation touching production, corporate networks, or unmanaged endpoints; exfiltration
testing; destructive payloads beyond file encryption (wipers) unless a separate hazard review is completed.

---

## 2. Lab network design (physical + logical isolation)

1. **Air gap.** The detonation network has **no physical or wireless path** to any other network. No shared
   switches, no shared Wi-Fi, no USB pass-through to corporate machines, no cloud sync clients.
2. **Topology.** A single isolated subnet on a dedicated, **non-uplinked** switch:
   - `victim-01..N`: VMs running the Crown Defense agent (Windows + Linux variants).
   - `control-plane-lab`: a lab-only Crown Defense control plane + operational/audit stores (mirrors prod
     topology; ADR-012/013) so containment commands and audit records are exercised end-to-end.
   - `analyst-01`: the operator console (read-only dashboard; never mounts victim disks live).
3. **DNS/Internet sinkhole.** Provide a fake gateway / INetSim-style sinkhole so a sample that tries to reach
   a C2 resolves to a dead-end inside the lab. **Never give a sample real Internet.**
4. **Hypervisor hardening.** Disable shared folders, shared clipboard, drag-and-drop, and guest additions
   networking. Treat a guest-to-host escape as the primary lab risk; keep the host OS patched and offline.
5. **One-way evidence diode.** Results leave the lab only as **plain text / JSON / PNG** copied to fresh,
   write-once media (or a one-way data diode), scanned on a separate clean machine before it touches anything else.
   **Never** carry an executable, a memory image containing the sample, or an encrypted victim disk out of the lab.

---

## 3. Sample handling SOP (chain of custody)

1. **Acquisition (human only).** Pull samples from reputable sources — theZoo, MalwareBazaar / abuse.ch,
   VX-Underground, MITRE — onto a **dedicated, air-gapped acquisition machine**, never a build or dev box.
   Verify the published SHA-256 before anything else.
2. **Custody log.** For each sample record: family, source URL, acquisition date, SHA-256, intended evasion
   class (full / intermittent / header-only / partial / low-and-slow), operator name. Keep the log on paper or
   on the isolated analyst console — never in the build repo.
3. **Storage.** Keep samples **password-protected (zip with a documented passphrase)** at rest, named by hash,
   on encrypted, labelled, physically-secured media. Decrypt only inside a victim VM immediately before detonation.
4. **Transfer into the lab.** Move the password-protected archive via the labelled write-once media only.
   The passphrase travels separately (paper). Never email, never network-copy, never cloud.
5. **Disposal.** After the campaign: revert every snapshot, then **cryptographically wipe or physically
   destroy** the media holding samples. Update the custody log with disposal date + method + witness.

---

## 4. Snapshot / revert procedure (the core safety control)

1. Build each victim VM from a known-clean golden image with the Crown Defense agent installed and enrolled to
   `control-plane-lab`. Plant canaries per the agent's normal provisioning (ADR-010).
2. Take a **clean snapshot** of every VM and the lab control plane **before any detonation**.
3. Detonate **one sample per victim VM per run**. Never reuse a detonated VM for a second sample without a revert.
4. After each run: capture evidence (Section 6), then **revert every touched VM to the clean snapshot**.
5. Verify the revert (hash the golden files; confirm the agent re-enrolls clean) before the next run.
6. If a VM behaves unexpectedly (suspected escape, network beacon seen at the sinkhole that shouldn't exist),
   **power off the whole lab segment**, do not revert-and-continue, and escalate to the hazard owner.

---

## 5. Exact manual test steps (per sample)

For each curated sample, mapped to the matching safe-simulator evasion class:

1. Confirm the lab air gap (no uplink; sinkhole answering; custody log current).
2. Boot the target victim VM from the clean snapshot; confirm the agent is `ONLINE` and canaries are `intact`
   on the lab dashboard; confirm the control plane and audit store are healthy (C9 `HEALTHY`).
3. Set the autonomy dial to the position under test. Run the **matrix at least at `MONITOR_ONLY`** (observe-only,
   safest) **and** at `FULL_AUTO` (to time containment). For `HUMAN_GATED`, stage a second approver on the console.
4. Decrypt the sample inside the victim VM and detonate it on a seeded user-document tree (mirror the simulator's
   seed set: docx/xlsx/pdf/png/jpg/txt/csv across a directory).
5. Start a stopwatch / capture the agent's first telemetry timestamp. Observe and record:
   - time-to-first-`MASS_ENCRYPTION`-verdict and the contributing signals (expect canary fast-path and/or
     entropy-delta + format-validation; for an intermittent family, expect **format-validation** to carry it),
   - files encrypted before containment (target ≤ 10),
   - in `FULL_AUTO`: containment latency from verdict to host isolation (target p95 < 10 s),
   - the audit chain: every action/approval produced an immutable `ActionRecord`; verify the chain.
6. If containment fired, confirm isolation persisted when you simulate a control-plane link drop (pull the
   lab control-plane NIC); confirm **no new** destructive action initiated under the partition (fail-safe).
7. Stop, capture evidence, **revert all snapshots.**

Repeat across families to cover ≥ the simulator's behavior battery (≥20 families, the 4+ evasion classes).

---

## 6. Results recording (what leaves the lab)

Record per sample, as **text/JSON only**, copied out via the one-way evidence path:

- family, SHA-256, evasion class, OS;
- detected (yes/no), time-to-verdict, contributing signals, confidence;
- files lost before containment; containment latency (FULL_AUTO);
- fail-safe behavior under control-plane partition (no rogue action: yes/no);
- audit chain verified (yes/no), export slice produced (yes/no);
- false-positive observations on any benign workload run alongside.

Aggregate into a **real-family detection report** and compare against the simulator-battery numbers from the
build (`reports/detection/*`, `reports/fp/*`). Discrepancies feed back as detection-tuning work items.

---

## 7. Roles, approvals, stop conditions

- **Hazard owner:** approves the campaign, owns the custody log, holds disposal sign-off.
- **Operator(s):** execute detonation; two-person rule for any wiper-class or unknown sample.
- **Stop conditions (halt + power down the segment):** any unexpected outbound beacon that escapes the
  sinkhole; any sign of guest-to-host escape; any sample that propagates beyond the seeded directory or the
  victim VM; any media leaving the lab that is not plain text/JSON/PNG; custody log gaps.

---

## 8. Why this is documentation, not automation

Real-malware detonation is irreducibly a human-judgment, physical-control activity: air gaps, snapshot reverts,
chain-of-custody, and stop-and-power-down decisions cannot be safely delegated to an autonomous agent. Crown
Defense's value is proven on the safe simulator under automation; real-family confirmation is earned here, by
people, under these controls. **The build never crosses this line.**
