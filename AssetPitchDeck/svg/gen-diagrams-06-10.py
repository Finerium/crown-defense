#!/usr/bin/env python3
"""Generate diagrams 06-10 for the Crown Defense pitch deck.
Hand-authored SVG, one helper per primitive so the font stack is on every <text>.
Includes a width fit-check (0.55 * fontSize per char) that warns on overflow.
"""
import os, sys

OUT = "/Users/ghaisan/Documents/CrownDefense/AssetPitchDeck/svg"
FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"

DARK  = "#0F2438"
MID   = "#1E4D7B"
SLATE = "#64748B"
LGREY = "#EEF2F6"
BORD  = "#CBD5E1"
RED   = "#DC2626"
DRED  = "#7F1D1D"
GREEN = "#16A34A"
AMBER = "#D97706"
WHITE = "#FFFFFF"
PALE  = "#C8D8E8"   # light text on dark boxes

WARN = []


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def w_of(s, size):
    return 0.55 * size * len(s)


def T(x, y, s, size=22, fill=DARK, weight="normal", anchor="start", maxw=None, tag=""):
    if maxw is not None:
        w = w_of(s, size)
        if w > maxw:
            WARN.append(f"[{tag}] OVERFLOW {int(w)}>{int(maxw)}: {s!r}")
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{esc(s)}</text>')


def box(x, y, w, h, fill=WHITE, stroke=BORD, sw=2.5, rx=14):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" ry="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def bar(x, y, h, color, w=8):
    """Accent bar on the left edge of a box."""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" ry="4" fill="{color}"/>'


def line(x1, y1, x2, y2, color=MID, sw=3, marker=None, dash=None):
    m = f' marker-end="url(#{marker})"' if marker else ""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
            f'stroke-width="{sw}" stroke-linecap="round"{m}{d}/>')


def path(d, color=MID, sw=3, fill="none", marker=None, dash=None, cap="round"):
    m = f' marker-end="url(#{marker})"' if marker else ""
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"{m}{da}/>')


def check(x, y, color=GREEN, sw=4.5, s=24):
    """Check-mark glyph, ~s x s from (x,y)."""
    return path(f"M {x} {y+s*0.52} l {s*0.33} {s*0.36} l {s*0.63} {-s*0.78}", color, sw)


def cross(x, y, color=RED, sw=4.5, s=22):
    return path(f"M {x} {y} l {s} {s} M {x+s} {y} l {-s} {s}", color, sw)


def warn_tri(x, y, color=AMBER, sw=3.2, s=26):
    return path(f"M {x+s/2} {y} L {x+s} {y+s*0.88} L {x} {y+s*0.88} Z", color, sw)


def circ(cx, cy, r, fill, stroke="none", sw=0):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def badge(x, y, w, h, txt, fill, size=19, tc=WHITE, rx=9):
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" ry="{rx}" fill="{fill}"/>']
    out.append(T(x + w / 2, y + h / 2 + size * 0.36, txt, size, tc, "bold", "middle",
                 maxw=w - 16, tag="badge"))
    return "".join(out)


def numcirc(cx, cy, r, n, fill, size=24):
    return circ(cx, cy, r, fill) + T(cx, cy + size * 0.36, n, size, WHITE, "bold", "middle")


MARKERS = "".join(
    f'<marker id="a-{name}" viewBox="0 0 18 18" refX="16" refY="9" '
    f'markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" orient="auto">'
    f'<path d="M 0 0 L 18 9 L 0 18 Z" fill="{col}"/></marker>'
    for name, col in (("mid", MID), ("dark", DARK), ("red", RED), ("green", GREEN),
                      ("slate", SLATE), ("amber", AMBER))
)


def svg(name, w, h, body):
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
           f'viewBox="0 0 {w} {h}" font-family="{FONT}">'
           f'<rect x="0" y="0" width="{w}" height="{h}" fill="{WHITE}"/>'
           f'<defs>{MARKERS}</defs>' + "".join(body) + '</svg>')
    p = os.path.join(OUT, name + ".svg")
    with open(p, "w") as f:
        f.write(doc)
    return p


# ---------------------------------------------------------------- DIAGRAM 06
def d06():
    W, H = 2000, 1410
    b = []
    b.append(T(60, 66, "Pagar anti-halusinasi pada lapisan orkestrasi AI", 50, DARK, "bold", maxw=1880, tag="06t"))
    b.append(T(60, 110, "Setiap keluaran model wajib melewati empat pagar sebelum boleh ditampilkan sebagai analisis resmi.",
               24, SLATE, maxw=1880, tag="06s"))

    MX, MW = 340, 820
    MR = MX + MW          # 1160
    ml = MX + 30
    mmax = MW - 60
    cx = MX + MW / 2      # 750
    SX, SW_ = 1250, 700
    sl = SX + 32
    smax = SW_ - 64

    # --- B1 model output
    b.append(box(MX, 150, MW, 110, MID, DARK, 3))
    b.append(T(ml, 196, "Keluaran model bahasa", 30, WHITE, "bold", maxw=mmax, tag="06b1h"))
    b.append(T(ml, 232, "Produksi: model swakelola. Purwarupa: API. Suhu 0,1.", 22, PALE, maxw=mmax, tag="06b1a"))

    def guard(n, y, h, title, lines):
        o = [box(MX, y, MW, h, LGREY, MID, 2.5), bar(MX + 6, y + 10, h - 20, MID)]
        o.append(badge(ml, y + 22, 124, 36, "PAGAR " + n, MID, 20))
        o.append(T(ml + 148, y + 48, title, 28, DARK, "bold", maxw=MR - 30 - (ml + 148), tag="06g" + n))
        yy = y + 90
        for ln in lines:
            o.append(T(ml, yy, ln, 22, SLATE, maxw=mmax, tag="06g" + n + "l"))
            yy += 30
        return o

    b += guard("1", 310, 180, "Pembumian lewat pengambilan (RAG)", [
        "retrieve() mengambil 6 pasase paling relevan dari playbook",
        "respons insiden internal, turunan NIST SP 800-61 dan MITRE",
        "ATT&CK. Prompt melarang model mengarang id pasase.",
    ])
    b += guard("2", 540, 150, "Validasi skema ketat", [
        "extractJson() lalu Zod safeParse terhadap IncidentReport",
        "dan RecoveryPlan. Keluaran cacat tidak pernah lolos.",
    ])
    b += guard("3", 740, 200, "Gerbang kesetiaan (faithfulness gate)", [
        "Setiap langkah pemulihan dan setiap kutipan wajib menunjuk",
        "id pasase yang benar-benar diambil, dan berbagi minimal 2",
        "istilah bermakna dengan pasase itu. LULUS bila skor lebih",
        "besar atau sama dengan 0,8 DAN tidak ada kutipan fiktif.",
    ])
    b += guard("4", 990, 160, "Bentuk keluaran dikunci ke C7", [
        "Hanya laporan insiden, peta radius dampak, dan rencana",
        "pemulihan. Tidak pernah ActionRecord atau AgentCommand.",
        "Peta radius dampak dihitung dari data insiden, bukan model.",
    ])

    for y0, y1 in ((260, 310), (490, 540), (690, 740), (940, 990)):
        b.append(line(cx, y0, cx, y1 - 4, DARK, 4, "a-dark"))

    # --- bottom strip
    b.append(box(MX, 1200, 1610, 120, LGREY, GREEN, 3))
    b.append(bar(MX + 6, 1210, 100, GREEN))
    b.append(check(MX + 32, 1224, GREEN, 5, 28))
    b.append(T(MX + 78, 1250, "Status akhir: penasihat saja.", 28, DARK, "bold", maxw=800, tag="06f1"))
    b.append(T(MX + 32, 1292, "Lapisan AI tidak pernah mengeksekusi apa pun. Tindakan destruktif tetap tunduk pada dial otonomi.",
               24, SLATE, maxw=1540, tag="06f2"))

    # --- side column
    b.append(box(SX, 150, SW_, 200, WHITE, AMBER, 3))
    b.append(bar(SX + 6, 160, 180, AMBER))
    b.append(warn_tri(sl, 174, AMBER))
    b.append(T(sl + 44, 196, "Model tidak tersedia", 26, DARK, "bold", maxw=smax - 44, tag="06s0h"))
    for i, ln in enumerate([
        "status: LLM_UNAVAILABLE, degraded = true",
        "Deteksi dan containment TETAP berjalan.",
        "Tidak ada tindakan destruktif baru.",
        "Sistem merosot ke posisi yang lebih aman.",
    ]):
        b.append(T(sl, 240 + i * 30, ln, 21, SLATE, maxw=smax, tag="06s0"))

    b.append(box(SX, 540, SW_, 150, WHITE, RED, 3))
    b.append(bar(SX + 6, 550, 130, RED))
    b.append(cross(sl, 566, RED))
    b.append(T(sl + 44, 588, "Keluaran tidak sesuai skema", 26, DARK, "bold", maxw=smax - 44, tag="06s1h"))
    for i, ln in enumerate([
        "status: MALFORMED_OUTPUT",
        "routed_to_human = true. Tidak ditampilkan.",
    ]):
        b.append(T(sl, 630 + i * 30, ln, 21, SLATE, maxw=smax, tag="06s1"))

    b.append(box(SX, 740, SW_, 200, WHITE, RED, 3))
    b.append(bar(SX + 6, 750, 180, RED))
    b.append(cross(sl, 766, RED))
    b.append(T(sl + 44, 788, "Gagal gerbang kesetiaan", 26, DARK, "bold", maxw=smax - 44, tag="06s2h"))
    for i, ln in enumerate([
        "status: BLOCKED_LOW_FAITHFULNESS",
        "routed_to_human = true",
        "Tidak ditampilkan sebagai fakta.",
        "Dirutekan ke analis manusia untuk ditinjau.",
    ]):
        b.append(T(sl, 830 + i * 30, ln, 21, SLATE, maxw=smax, tag="06s2"))

    b.append(box(SX, 990, SW_, 160, DARK, DARK, 3))
    b.append(T(sl, 1038, "Prinsip yang ditegakkan", 26, WHITE, "bold", maxw=smax, tag="06s3h"))
    b.append(T(sl, 1080, "Penolakan yang aman lebih baik daripada", 22, PALE, maxw=smax, tag="06s3a"))
    b.append(T(sl, 1112, "jawaban lancar yang tidak berdasar.", 22, PALE, maxw=smax, tag="06s3b"))

    # branch arrows (main -> side)
    b.append(line(MR, 218, SX - 6, 218, AMBER, 3.5, "a-amber"))
    b.append(line(MR, 615, SX - 6, 615, RED, 3.5, "a-red"))
    b.append(line(MR, 840, SX - 6, 840, RED, 3.5, "a-red"))
    b.append(T(MR + 12, 207, "gagal", 20, AMBER, "bold", maxw=80, tag="06e0"))
    b.append(T(MR + 12, 604, "gagal", 20, RED, "bold", maxw=80, tag="06e1"))
    b.append(T(MR + 12, 829, "gagal", 20, RED, "bold", maxw=80, tag="06e2"))

    b.append(T(60, 1372, "Sumber: packages/llm/src/orchestrator.ts, packages/llm/src/faithfulness.ts, packages/llm/src/playbook.ts",
               20, SLATE, maxw=1880, tag="06src"))
    return svg("DIAGRAM-06-pagar-anti-halusinasi-llm", W, H, b)


# ---------------------------------------------------------------- DIAGRAM 07
def d07():
    W, H = 2000, 1160
    b = []
    b.append(T(60, 66, "Dial otonomi dan matriks klasifikasi tindakan", 50, DARK, "bold", maxw=1880, tag="07t"))
    b.append(T(60, 110, "Empat posisi dial, tiga kelas tindakan. Posisi bawaan adalah posisi yang paling aman.",
               24, SLATE, maxw=1880, tag="07s"))

    # LEFT
    b.append(T(60, 178, "Dial otonomi (C5)", 32, DARK, "bold", maxw=760, tag="07lh"))
    b.append(T(60, 212, "Urutan otonomi 0 (paling aman) sampai 3 (paling otonom).", 20, SLATE, maxw=760, tag="07ln"))

    SXX, SWW = 180, 640
    rows = [
        ("3", "FULL_AUTO", "otomatis penuh", DARK, None),
        ("2", "HUMAN_GATED", "persetujuan manusia", AMBER, "tri"),
        ("1", "ALERT_RECOMMEND", "peringatan dan rekomendasi", MID, None),
        ("0", "MONITOR_ONLY", "pemantauan saja", GREEN, "check"),
    ]
    ys = [240, 394, 548, 702]
    for (n, nm, sub, col, glyph), y in zip(rows, ys):
        b.append(box(SXX, y, SWW, 132, WHITE, col, 3.2))
        b.append(bar(SXX + 6, y + 10, 112, col))
        b.append(numcirc(SXX + 62, y + 66, 27, n, col, 25))
        b.append(T(SXX + 106, y + 56, nm, 28, DARK, "bold", maxw=380, tag="07r" + n))
        b.append(T(SXX + 106, y + 94, sub, 22, SLATE, maxw=380, tag="07rs" + n))
        if glyph == "check":
            b.append(check(SXX + 556, y + 32, GREEN, 5, 26))
            b.append(badge(SXX + 340, y + 68, 280, 36, "BAWAAN, PALING AMAN", GREEN, 19))
        elif glyph == "tri":
            b.append(warn_tri(SXX + 556, y + 34, AMBER, 3.2, 26))
            b.append(badge(SXX + 340, y + 68, 280, 36, "KENDALI GANDA WAJIB", AMBER, 19))

    b.append(line(112, 250, 112, 826, DARK, 7, "a-dark"))
    b.append(f'<text x="76" y="538" font-family="{FONT}" font-size="24" font-weight="bold" '
             f'fill="{DARK}" text-anchor="middle" transform="rotate(-90 76 538)">FAIL-SAFE</text>')

    b.append(box(60, 870, 760, 180, LGREY, DARK, 2.8))
    b.append(bar(66, 880, 160, DARK))
    b.append(T(92, 916, "Fail-safe: kegagalan selalu menurunkan", 24, DARK, "bold", maxw=696, tag="07f1"))
    b.append(T(92, 950, "ke posisi yang lebih aman.", 24, DARK, "bold", maxw=696, tag="07f2"))
    b.append(T(92, 988, "Tidak pernah menaikkan ke tindakan destruktif.", 21, SLATE, maxw=696, tag="07f3"))
    b.append(T(92, 1020, "Control plane putus, posisi efektif menjadi MONITOR_ONLY.", 21, SLATE, maxw=696, tag="07f4"))

    # RIGHT
    b.append(T(880, 178, "Matriks klasifikasi tindakan", 32, DARK, "bold", maxw=1060, tag="07rh"))
    b.append(T(880, 212, "Kelas sebuah tindakan bergantung pada posisi dial saat itu.", 20, SLATE, maxw=1060, tag="07rn"))

    cols = [
        (880, GREEN, ["AUTO"], 28, "boleh otomatis", "check"),
        (1240, AMBER, ["MINTA", "PERSETUJUAN"], 25, "ASK_TO_ACT", "tri"),
        (1600, DRED, ["TIDAK PERNAH", "OTOMATIS"], 25, "NEVER_AUTO", "cross"),
    ]
    CW = 340
    for x, col, titles, ts, sub, glyph in cols:
        b.append(box(x, 240, CW, 120, col, col, 2.5))
        if glyph == "check":
            b.append(check(x + 20, 264, WHITE, 4.5, 26))
        elif glyph == "tri":
            b.append(warn_tri(x + 20, 266, WHITE, 3.4, 26))
        else:
            b.append(cross(x + 22, 268, WHITE, 4.2, 22))
        ty = 302 if len(titles) == 1 else 286
        for tl in titles:
            b.append(T(x + 58, ty, tl, ts, WHITE, "bold", maxw=CW - 78, tag="07c"))
            ty += 30
        b.append(T(x + 58, 336 if len(titles) == 1 else 344, sub, 19, WHITE, maxw=CW - 78, tag="07cs"))
        b.append(box(x, 370, CW, 406, WHITE, BORD, 2))

    body = [
        [("Selalu, non-destruktif:", "h"), ("ALERT_RAISED", "n"), ("RECOMMENDATION_MADE", "n"),
         ("LLM_REPORT_GENERATED", "n"), ("DIAL_CHANGED", "n"), ("", "g"),
         ("Destruktif, hanya pada:", "h"), ("FULL_AUTO", "n"),
         ("ISOLATE_HOST", "s"), ("KILL_PROCESS", "s"), ("LOCK_SHARES", "s"), ("", "g"),
         ("Semua tercatat di audit.", "s")],
        [("Destruktif, pada posisi:", "h"), ("HUMAN_GATED", "n"),
         ("ISOLATE_HOST", "s"), ("KILL_PROCESS", "s"), ("LOCK_SHARES", "s"), ("", "g"),
         ("Pembalikan, selalu:", "h"), ("RELEASE_HOST", "n"), ("UNLOCK_SHARES", "n"), ("", "g"),
         ("Wajib penyetuju kedua", "s"), ("yang berbeda dari", "s"), ("pemohon.", "s")],
        [("Destruktif, pada posisi:", "h"), ("MONITOR_ONLY", "n"), ("ALERT_RECOMMEND", "n"), ("", "g"),
         ("Dan saat fail-safe:", "h"), ("control plane putus,", "s"), ("posisi efektif turun", "s"),
         ("ke MONITOR_ONLY.", "s"), ("", "g"),
         ("Tidak pernah dieksekusi", "s"), ("otomatis. Hanya dicatat", "s"), ("dan direkomendasikan.", "s")],
    ]
    for (x, col, *_), items in zip(cols, body):
        yy = 416
        for txt, kind in items:
            if kind == "g":
                yy += 16
                continue
            if kind == "h":
                b.append(T(x + 22, yy, txt, 22, DARK, "bold", maxw=CW - 44, tag="07bh"))
                yy += 34
            elif kind == "n":
                b.append(T(x + 22, yy, txt, 21, MID, "bold", maxw=CW - 44, tag="07bn"))
                yy += 30
            else:
                b.append(T(x + 22, yy, txt, 20, SLATE, maxw=CW - 44, tag="07bs"))
                yy += 28

    # dual control callout
    b.append(box(880, 820, 1060, 230, LGREY, AMBER, 3.2))
    b.append(bar(886, 830, 210, AMBER))
    b.append(warn_tri(912, 848, AMBER, 3.4, 28))
    b.append(T(958, 872, "Kendali ganda", 30, DARK, "bold", maxw=960, tag="07dch"))
    b.append(T(912, 918, "Tindakan destruktif pada HUMAN_GATED wajib disetujui oleh", 23, DARK, maxw=996, tag="07dc1"))
    b.append(T(912, 950, "penyetuju kedua yang BERBEDA dari pemohon.", 23, DARK, maxw=996, tag="07dc2"))
    b.append(T(912, 986, "Satu orang tidak cukup. Permintaan seperti itu DITOLAK.", 23, DARK, "bold", maxw=996, tag="07dc3"))
    b.append(T(912, 1024, "Dibatasi waktu (rollback_deadline). Satu klik untuk membatalkan (RELEASE_HOST).",
               21, SLATE, maxw=996, tag="07dc4"))

    b.append(T(60, 1112, "Sumber: packages/contracts/src/c5-autonomy.ts, c4-audit.ts, c6-command.ts, packages/containment/src/policy.ts",
               20, SLATE, maxw=1880, tag="07src"))
    return svg("DIAGRAM-07-dial-otonomi-matriks-aksi", W, H, b)


# ---------------------------------------------------------------- DIAGRAM 08
def d08():
    W, H = 2000, 1270
    b = []
    b.append(T(60, 66, "Jejak audit tahan-sangkal, rantai hash append-only", 50, DARK, "bold", maxw=1880, tag="08t"))
    b.append(T(60, 110, "Setiap tindakan otonom dan setiap persetujuan menjadi satu catatan yang tidak dapat diubah.",
               23, SLATE, maxw=1880, tag="08s"))

    # ordering strip (two-phase)
    strip = [
        (60, 560, DARK, "1.  Catatan niat ditulis dahulu", "ActionRecord dengan outcome QUEUED"),
        (690, 480, MID, "2.  Perintah dikirim ke agen", "AgentCommand membawa action_record_id"),
        (1240, 700, DARK, "3.  Catatan hasil terminal ditulis", "EXECUTED, BLOCKED, atau FAILED sesuai hasil"),
    ]
    for x, w, col, hd, sb in strip:
        b.append(box(x, 150, w, 110, col, col, 3))
        b.append(T(x + 28, 194, hd, 25, WHITE, "bold", maxw=w - 56, tag="08o"))
        b.append(T(x + 28, 228, sb, 20, PALE, maxw=w - 56, tag="08os"))
    b.append(line(626, 205, 684, 205, DARK, 4, "a-dark"))
    b.append(line(1176, 205, 1234, 205, DARK, 4, "a-dark"))

    # chain records
    BW, PITCH, Y0, BH = 414, 488, 310, 390
    recs = [
        ("0", "0000...0000", "7d2e...9b41", "ALERT_RAISED", "EXECUTED", MID,
         ["Peringatan dinaikkan,", "belum ada tindakan."], True),
        ("1", "7d2e...9b41", "c40a...18e6", "ISOLATE_HOST", "QUEUED", AMBER,
         ["Niat isolasi dicatat", "sebelum perintah dikirim."], False),
        ("2", "c40a...18e6", "5b93...a27f", "ISOLATE_HOST", "EXECUTED", MID,
         ["Hasil terminal,", "host terisolasi."], False),
        ("3", "5b93...a27f", "e118...36c4", "LLM_REPORT_GENERATED", "EXECUTED", MID,
         ["Laporan insiden C7", "selesai dibuat."], False),
    ]
    xs = [54 + i * PITCH for i in range(4)]
    for x, (seq, ph, rh, act, outc, ocol, desc, genesis) in zip(xs, recs):
        tl, tmax = x + 22, BW - 44
        b.append(box(x, Y0, BW, BH, WHITE, MID, 3))
        b.append(badge(tl, Y0 + 18, 176, 40, "chain_seq " + seq, MID, 21))
        b.append(line(x + 16, Y0 + 80, x + BW - 16, Y0 + 80, BORD, 2))
        b.append(T(tl, Y0 + 114, "prev_hash" + ("   (genesis)" if genesis else ""), 20, SLATE, maxw=tmax, tag="08ph"))
        b.append(T(tl, Y0 + 142, ph, 22, DARK, "bold", maxw=tmax, tag="08phv"))
        b.append(T(tl, Y0 + 182, "record_hash", 20, SLATE, maxw=tmax, tag="08rh"))
        b.append(T(tl, Y0 + 210, rh, 22, DARK, "bold", maxw=tmax, tag="08rhv"))
        b.append(line(x + 16, Y0 + 236, x + BW - 16, Y0 + 236, BORD, 2))
        b.append(T(tl, Y0 + 270, act, 22, DARK, "bold", maxw=tmax, tag="08act"))
        b.append(T(tl, Y0 + 300, "outcome: " + outc, 20, ocol, "bold", maxw=tmax, tag="08out"))
        for i, dl in enumerate(desc):
            b.append(T(tl, Y0 + 336 + i * 28, dl, 20, SLATE, maxw=tmax, tag="08d"))

    for i in range(3):
        x0 = xs[i] + BW
        x1 = xs[i + 1]
        b.append(path(f"M {x0 + 4} {Y0+204} C {x0+40} {Y0+204} {x1-40} {Y0+142} {x1-6} {Y0+142}",
                      DARK, 3.5, marker="a-dark"))

    b.append(T(1000, 738, "Panah menyambung record_hash catatan sebelumnya ke prev_hash catatan berikutnya. Nilai hash dipersingkat untuk ilustrasi.",
               21, SLATE, anchor="middle", maxw=1880, tag="08leg"))

    # WORM band
    b.append(box(60, 770, 1880, 110, LGREY, DARK, 2.8))
    b.append(bar(66, 780, 90, DARK))
    b.append(T(100, 814, "WORM di lapisan basis data", 28, DARK, "bold", maxw=1800, tag="08wh"))
    b.append(T(100, 852, "Tulis sekali, baca berkali. UPDATE, DELETE, dan TRUNCATE ditolak oleh trigger basis data, bukan sekadar konvensi aplikasi.",
               22, SLATE, maxw=1800, tag="08w1"))

    # tamper strip
    b.append(box(60, 920, 1880, 250, WHITE, RED, 3.2))
    b.append(bar(66, 930, 230, RED))
    b.append(cross(100, 940, RED, 4.5, 22))
    b.append(T(146, 966, "Percobaan pengubahan catatan", 28, RED, "bold", maxw=900, tag="08th"))

    minis = [
        (120, BORD, DARK, "chain_seq 1", ["record_hash", "c40a...18e6"], None),
        (620, RED, RED, "chain_seq 2  DIUBAH", ["isi diubah, hash dihitung", "ulang menjadi 9fd1...0c72"], "cross"),
        (1120, RED, RED, "chain_seq 3", ["prev_hash 5b93...a27f", "tidak cocok lagi"], "cross"),
    ]
    for x, stc, txc, hd, ls, gl in minis:
        b.append(box(x, 1000, 380, 120, WHITE, stc, 3))
        b.append(T(x + 20, 1036, hd, 22, txc, "bold", maxw=340, tag="08mh"))
        for i, ln in enumerate(ls):
            b.append(T(x + 20, 1068 + i * 26, ln, 19, SLATE, maxw=340, tag="08ml"))
    b.append(line(504, 1060, 612, 1060, SLATE, 3, "a-slate"))
    # broken-link glyph between mini 2 and mini 3: a severed connector with two break slashes
    b.append(line(1004, 1060, 1044, 1060, RED, 5))
    b.append(line(1076, 1060, 1114, 1060, RED, 5, "a-red"))
    b.append(line(1046, 1038, 1058, 1082, RED, 5))
    b.append(line(1062, 1038, 1074, 1082, RED, 5))
    b.append(T(1060, 1110, "putus", 19, RED, "bold", anchor="middle", maxw=120, tag="08bk"))

    b.append(T(1560, 1042, "Rantai putus.", 27, RED, "bold", maxw=360, tag="08x1"))
    b.append(T(1560, 1078, "Perubahan terdeteksi,", 22, DARK, maxw=360, tag="08x2"))
    b.append(T(1560, 1106, "tidak dapat disangkal.", 22, DARK, maxw=360, tag="08x3"))
    b.append(T(1560, 1140, "verifyChain: valid=false, brokenAt=2", 18, SLATE, maxw=370, tag="08x4"))

    b.append(T(60, 1228, "Sumber: packages/audit/src/hash-chain.ts, packages/audit/src/store.ts, scripts/migrations/audit/001_action_records.sql",
               20, SLATE, maxw=1880, tag="08src"))
    return svg("DIAGRAM-08-rantai-audit-hash-chain", W, H, b)


# ---------------------------------------------------------------- DIAGRAM 09
def d09():
    W, H = 2000, 1130
    b = []
    b.append(T(60, 66, "Arsitektur demo, kenapa ini bukan pertunjukan yang diatur", 48, DARK, "bold", maxw=1880, tag="09t"))
    b.append(T(60, 110, "Peristiwa yang dipentaskan, tetapi jalur keputusan sepenuhnya asli.", 23, SLATE, maxw=1880, tag="09s"))

    BW, PITCH, Y0, BH = 330, 390, 170, 190
    xs = [55 + i * PITCH for i in range(5)]
    ctr = [x + BW / 2 for x in xs]

    # 0 attack console
    x = xs[0]
    b.append(box(x, Y0, BW, BH, WHITE, DRED, 3.5))
    b.append(bar(x + 6, Y0 + 10, BH - 20, DRED))
    b.append(badge(x + 24, Y0 + 20, 152, 32, "SIMULASI", DRED, 18))
    b.append(T(x + 24, Y0 + 96, "Konsol Simulasi", 25, DARK, "bold", maxw=BW - 48, tag="09b0a"))
    b.append(T(x + 24, Y0 + 126, "Serangan", 25, DARK, "bold", maxw=BW - 48, tag="09b0b"))
    b.append(T(x + 24, Y0 + 160, "Memicu skenario serangan.", 19, SLATE, maxw=BW - 48, tag="09b0c"))

    # 1 sandbox dir
    x = xs[1]
    b.append(box(x, Y0, BW, BH, WHITE, GREEN, 3.5))
    b.append(bar(x + 6, Y0 + 10, BH - 20, GREEN))
    b.append(T(x + 24, Y0 + 54, "Direktori scratch", 25, DARK, "bold", maxw=BW - 48, tag="09b1a"))
    b.append(T(x + 24, Y0 + 84, "tersandbox", 25, DARK, "bold", maxw=BW - 48, tag="09b1b"))
    b.append(check(x + 24, Y0 + 104, GREEN, 4.5, 24))
    b.append(T(x + 58, Y0 + 124, "Semua tulisan berhenti", 19, SLATE, maxw=BW - 82, tag="09b1c"))
    b.append(T(x + 58, Y0 + 150, "di dalam direktori ini.", 19, SLATE, maxw=BW - 82, tag="09b1d"))

    darks = [
        (xs[2], MID, "Endpoint Agent", ["Mengamati direktori yang", "sama seperti di produksi.", "Tidak tahu ada simulasi."]),
        (xs[3], DARK, "Detection Engine", ["Kode produksi yang sama.", "Fusi lima sinyal, tanpa", "jalan pintas apa pun."]),
        (xs[4], MID, "Command Dashboard", ["Menampilkan vonis dan", "aksi yang benar-benar", "terjadi."]),
    ]
    for x, col, hd, ls in darks:
        b.append(box(x, Y0, BW, BH, col, col, 3))
        b.append(T(x + 24, Y0 + 54, hd, 25, WHITE, "bold", maxw=BW - 48, tag="09h"))
        for i, ln in enumerate(ls):
            b.append(T(x + 24, Y0 + 94 + i * 26, ln, 19, PALE, maxw=BW - 48, tag="09l"))

    for i in range(4):
        b.append(line(xs[i] + BW + 6, Y0 + 95, xs[i + 1] - 6, Y0 + 95, MID, 4, "a-mid"))
    labels = ["menulis berkas nyata", "diamati agen", "telemetri C1 asli", "vonis C2 dan aksi"]
    for i, lb in enumerate(labels):
        b.append(T((xs[i] + BW + xs[i + 1]) / 2, 398, lb, 19, SLATE, anchor="middle", maxw=380, tag="09cl"))

    # guarantees panel
    b.append(box(420, 440, 1160, 200, LGREY, GREEN, 2.8))
    b.append(bar(426, 450, 180, GREEN))
    b.append(T(452, 486, "Jaminan simulator aman", 27, DARK, "bold", maxw=1100, tag="09gh"))
    colA = ["Jinak, tanpa kode berbahaya", "Dapat dipulihkan, kunci disimpan", "Satu direktori, tidak bisa keluar"]
    colB = ["Tidak menyebar ke berkas lain", "Tanpa jaringan, tanpa proses anak", "Tidak ada malware nyata sama sekali"]
    for i, ln in enumerate(colA):
        b.append(check(452, 512 + i * 34, GREEN, 4, 20))
        b.append(T(486, 530 + i * 34, ln, 21, SLATE, maxw=500, tag="09ga"))
    for i, ln in enumerate(colB):
        b.append(check(1020, 512 + i * 34, GREEN, 4, 20))
        b.append(T(1054, 530 + i * 34, ln, 21, SLATE, maxw=500, tag="09gb"))

    # the path that does not exist
    b.append(path(f"M {ctr[0]} {Y0+BH+12} L {ctr[0]} 720 L {ctr[4]} 720 L {ctr[4]} {Y0+BH+16}",
                  RED, 5, marker="a-red", dash="16 12"))
    b.append(circ(1000, 720, 44, WHITE, RED, 5))
    b.append(path("M 980 700 l 40 40 M 1020 700 l -40 40", RED, 9))
    b.append(T(1000, 812, "jalur ini tidak ada", 30, RED, "bold", anchor="middle", maxw=800, tag="09np"))
    b.append(T(1000, 846, "Konsol tidak pernah mengirim apa pun ke dasbor.", 21, SLATE, anchor="middle", maxw=900, tag="09np2"))

    # legend
    b.append(box(300, 890, 1400, 150, WHITE, DARK, 2.8))
    b.append(check(340, 912, GREEN, 5, 28))
    b.append(T(388, 940, "Peristiwa tersimulasi, mesin keputusan asli.", 28, DARK, "bold", maxw=1270, tag="09lg1"))
    b.append(T(340, 990, "Tidak pernah ada malware nyata yang diunduh, dibangun, disimpan, atau dijalankan.",
               24, SLATE, maxw=1320, tag="09lg2"))

    b.append(T(60, 1090, "Sumber: packages/simulator/src/simulator.ts, packages/detection/src/, packages/agent/src/",
               20, SLATE, maxw=1880, tag="09src"))
    return svg("DIAGRAM-09-alur-demo-anti-curang", W, H, b)


# ---------------------------------------------------------------- DIAGRAM 10
def d10():
    W, H = 2000, 1090
    b = []
    b.append(T(60, 66, "Rantai serangan ransomware dan tiga titik intervensi Crown Defense",
               46, DARK, "bold", maxw=1880, tag="10t"))
    b.append(T(60, 110, "Tiga titik paling menentukan, bukan seluruh rantai.", 23, SLATE, maxw=1880, tag="10s"))

    b.append(T(60, 200, "Tiga titik intervensi", 28, DARK, "bold", maxw=440, tag="10kl1"))
    b.append(T(60, 234, "Crown Defense", 28, DARK, "bold", maxw=440, tag="10kl2"))
    b.append(T(60, 278, "Nomor mengikuti urutan posisi", 20, SLATE, maxw=440, tag="10kl3"))
    b.append(T(60, 304, "pada rantai serangan, bukan", 20, SLATE, maxw=440, tag="10kl4"))
    b.append(T(60, 330, "urutan waktu tindakan.", 20, SLATE, maxw=440, tag="10kl5"))

    # callouts
    cal = [
        (520, 400, "1", ["Kecerdasan pemulihan", "mandiri"],
         ["Rencana restore terurut", "prioritas, independen dari", "mekanisme yang dilumpuhkan", "penyerang."]),
        (980, 400, "2", ["Deteksi seketika", "lewat fusi sinyal"],
         ["Lima sinyal digabung.", "Termasuk enkripsi terputus", "(intermittent) dan header", "saja."]),
        (1440, 460, "3", ["Containment memutus", "host"],
         ["Pergerakan lateral dan", "enkripsi lanjutan terhenti.", "Audit ditulis sebelum", "perintah dikirim."]),
    ]
    for x, w, n, hd, ls in cal:
        b.append(box(x, 150, w, 230, WHITE, GREEN, 3.2))
        b.append(bar(x + 6, 160, 210, GREEN))
        b.append(numcirc(x + 42, 186, 22, n, GREEN, 23))
        b.append(T(x + 76, 178, hd[0], 25, DARK, "bold", maxw=x + w - 30 - (x + 76), tag="10ch"))
        b.append(T(x + 76, 208, hd[1], 25, DARK, "bold", maxw=x + w - 30 - (x + 76), tag="10ch2"))
        b.append(check(x + 32, 236, GREEN, 4, 20))
        for i, ln in enumerate(ls):
            b.append(T(x + 66, 256 + i * 28, ln, 20, SLATE, maxw=w - 96, tag="10cl"))

    # chain
    BW, PITCH, Y0, BH = 272, 314, 560, 230
    xs = [42 + i * PITCH for i in range(6)]
    ctr = [x + BW / 2 for x in xs]
    stages = [
        ("1", None, ["Akses awal"], ["Phishing atau RDP", "yang terbuka."]),
        ("2", None, ["Eksekusi muatan"], ["Muatan ransomware", "dijalankan."]),
        ("3", "T1562", ["Penghindaran", "pertahanan"], ["Antivirus", "dinonaktifkan."]),
        ("4", None, ["Pergerakan", "lateral"], ["Menyebar ke host lain", "di segmen yang sama."]),
        ("5", "T1490", ["Pelumpuhan", "pemulihan"], ["Volume Shadow Copy", "dihapus."]),
        ("6", "T1486", ["Enkripsi massal"], ["Berkas dienkripsi", "secara masif."]),
    ]
    for x, (n, tech, hd, ls) in zip(xs, stages):
        col = RED if tech else SLATE
        b.append(box(x, Y0, BW, BH, WHITE, col, 3 if tech else 2.5))
        b.append(numcirc(x + 34, Y0 + 34, 19, n, col, 19))
        if tech:
            b.append(badge(x + BW - 128, Y0 + 16, 112, 34, tech, RED, 19))
        yy = Y0 + 96
        for ln in hd:
            b.append(T(x + 24, yy, ln, 23, DARK, "bold", maxw=BW - 48, tag="10sh"))
            yy += 28
        yy = Y0 + 156 if len(hd) == 1 else Y0 + 158
        for ln in ls:
            b.append(T(x + 24, yy, ln, 19, SLATE, maxw=BW - 48, tag="10sl"))
            yy += 26
    for i in range(5):
        b.append(line(xs[i] + BW + 5, Y0 + BH / 2, xs[i + 1] - 5, Y0 + BH / 2, RED, 4, "a-red"))

    # leaders callout -> chain anchor
    for (x, w, *_), anch in zip(cal, [ctr[4], ctr[5], xs[5] + BW]):
        b.append(line(x + w / 2, 384, anch, Y0 - 8, GREEN, 3, "a-green", dash="12 9"))

    # outcome strip
    b.append(box(1298, 830, 642, 110, LGREY, GREEN, 3))
    b.append(bar(1304, 840, 90, GREEN))
    b.append(check(1330, 858, GREEN, 4.5, 26))
    b.append(T(1372, 880, "Rantai serangan berhenti di sini.", 24, DARK, "bold", maxw=540, tag="10o1"))
    b.append(T(1330, 916, "Host terputus, enkripsi lanjutan tidak terjadi.", 20, SLATE, maxw=580, tag="10o2"))

    b.append(T(42, 880, "Crown Defense tidak berusaha menghentikan seluruh rantai, melainkan", 23, SLATE, maxw=1210, tag="10h1"))
    b.append(T(42, 912, "memusatkan kekuatan pada tiga titik paling menentukan.", 23, SLATE, maxw=1210, tag="10h2"))

    b.append(T(42, 990, "Kode teknik mengikuti MITRE ATT&CK: T1562 Impair Defenses, T1490 Inhibit System Recovery, T1486 Data Encrypted for Impact.",
               20, SLATE, maxw=1900, tag="10m"))
    b.append(T(42, 1044, "Sumber: proposal Crown Defense dan pemetaan MITRE ATT&CK; deteksi diimplementasikan di packages/detection/src/.",
               20, SLATE, maxw=1900, tag="10src"))
    return svg("DIAGRAM-10-killchain-mitre-intervensi", W, H, b)


if __name__ == "__main__":
    for fn in (d06, d07, d08, d09, d10):
        print("wrote", fn())
    if WARN:
        print("\n--- FIT WARNINGS ---")
        for w in WARN:
            print(w)
        sys.exit(0)
    print("\nno fit warnings")
