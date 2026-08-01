# Pernyataan Penggunaan AI Generatif

Crown Defense dibangun dengan bantuan AI generatif, dan pernyataan ini menjelaskan secara spesifik bagian
mana yang dibantu, bagian mana yang murni karya tim, dan bagaimana hasilnya dinilai. Prinsipnya sederhana:
**diungkap lebih dulu, bukan ditemukan belakangan.**

---

## 1. Yang merupakan karya asli Tim Cyber Crown

Berikut adalah pemikiran tim, terdokumentasi **sebelum** satu baris kode pun ditulis:

- **Gagasan produk.** Pertahanan ransomware otonom kelas perbankan, dengan tesis bahwa kecepatan deteksi
  adalah demonya sementara tidak-bertindak-keliru, keterbuktian, dan fail-safety adalah produknya.
- **Model ancaman.** Insiden PDNS 20 Juni 2024 sebagai titik berangkat, pemetaan MITRE ATT&CK
  (T1562 Impair Defenses, T1490 Inhibit System Recovery, T1486 Data Encrypted for Impact), dan aritmetika
  jendela waktu antara dwell time berhari-hari dan enkripsi bermenit-menit.
- **Arsitektur.** Loop tertutup deteksi ke containment ke analisis ke audit, keputusan bahwa dial otonomi
  hidup **di dalam** modul containment dan bukan ditempel di atasnya, dan keputusan bahwa substrat audit
  harus ada sebelum aksi pertama mungkin terjadi.
- **Kontrak beku C1 sampai C10.** Nama field, tipe, semantik, dan enumerasinya dirancang tim sebagai tulang
  punggung anti-divergensi, lalu dibekukan.
- **Keputusan rekayasa yang terkunci, ADR-001 sampai ADR-015.** Termasuk aturan fusi banyak sinyal dengan
  fast-path canary, keharusan LLM self-hosted on-premise, dial 4 posisi dengan matriks klasifikasi aksi,
  invarian fail-safe, dan pemisahan store audit dari store operasional.
- **Kriteria penerimaan.** 70 kriteria yang menjadi Definition of Done, dikunci sebelum pembangunan dan
  diinisialisasi seluruhnya sebagai `passes: false`.
- **Batas keamanan.** Keputusan bahwa tidak ada malware asli yang akan pernah diunduh, dibangun, disimpan,
  atau dijalankan, dan bahwa validasi memakai simulator aman.
- **Narasi pitch, kurasi skenario demo, dan seluruh keputusan produk.**

Dokumen sumbernya ada di repositori ini:

| Artefak | Lokasi | Isi |
| --- | --- | --- |
| Blueprint | [`docs/internal/blueprint-talos.md`](docs/internal/blueprint-talos.md) | Sumber tunggal kebenaran fungsional dan arsitektural. Memuat kontrak beku, ADR terkunci, kriteria penerimaan, dan tulang punggung 15 fase |
| Prompt orkestrator | [`docs/internal/prompt-orchestrator-talos.md`](docs/internal/prompt-orchestrator-talos.md) | Misi yang diberikan tim kepada agen pembangun, lengkap dengan aturan gate dan aturan verifikasinya |
| Persiapan environment | [`docs/internal/env-prep-talos.md`](docs/internal/env-prep-talos.md) | Artefak perencanaan yang menghasilkan `.env` |
| Catatan run | [`docs/internal/notes.md`](docs/internal/notes.md) | Pelajaran, deviasi, dan konflik blueprint per fase, ditulis berjalan sepanjang pembangunan |
| Status gate | [`.crown/progress.json`](.crown/progress.json) | Gate mana yang lulus dan dengan bukti apa |
| Kriteria penerimaan | [`.crown/feature-list.json`](.crown/feature-list.json) | 70 kriteria terkunci, masing-masing dengan status kelulusannya |
| Manifest bukti | [`reports/manifests/`](reports/manifests/) | Manifest per gate, menautkan setiap kriteria ke artefak buktinya |

Catatan penamaan: `talos` adalah **kodename internal** yang tersisa di nama berkas artefak perencanaan.
Ia tidak pernah menjadi string yang menghadap pengguna. Nama produknya adalah **Crown Defense**, dibaca dari
satu konstanta tunggal `PRODUCT_NAME` di `@crown/contracts`.

---

## 2. Claude sebagai alat pembangunan, bukan penggagas

**Claude (Anthropic), melalui Claude Code, dipakai sebagai alat implementasi** di bawah spesifikasi dan
arahan tim. Ia menulis kode terhadap kontrak yang sudah dibekukan tim, bukan merancang kontraknya.

### Artefak yang ditulis dengan bantuan agen

- **Seluruh kode aplikasi** di `packages/` dan `apps/`, ditulis terhadap kontrak beku C1 sampai C10.
- **Simulator aman** di `packages/simulator/` dan infrastruktur uji di `packages/test-infra/`.
- **Uji** di seluruh berkas `*.test.ts`.
- **Skrip bukti** di `scripts/gate*-evidence.ts` dan artefak JSON yang dihasilkannya di `reports/`.
- **Dokumentasi teknis**: `docs/architecture.md`, `docs/contracts.md`, `docs/adr/README.md`,
  `docs/runbooks/air-gapped-detonation-runbook.md`, `Report-hackathon.md`, `README.md`, dan berkas ini.
- **Command Dashboard** di `apps/dashboard/`, diport dari bundle desain yang menjadi kebenaran visual.

Prompt yang mengorkestrasi pekerjaan itu **ada di repositori ini** dan bisa dibaca dewan juri:
[`docs/internal/prompt-orchestrator-talos.md`](docs/internal/prompt-orchestrator-talos.md).

### Bagaimana pekerjaan agen dinilai

Empat aturan berlaku sepanjang pembangunan, keempatnya tercatat di `CLAUDE.md` dan ditegakkan lewat hook:

1. **Penulis tidak pernah meloloskan kodenya sendiri.** Setiap gate dinilai peninjau berkonteks-segar yang
   tidak ikut menulis kodenya, terhadap kriteria penerimaan yang terkunci.
2. **Oracle uji tidak bisa ditulis agen pekerja.** Simulator aman, suite beban kerja jinak, seluruh berkas
   uji, artefak bukti di `reports/`, dan `.crown/{progress,feature-list}.json` diblokir hook `PreToolUse`
   dari ditulis subagen pekerja yang berjalan di worktree. Agen yang membangun sebuah fitur tidak bisa
   melonggarkan uji yang menilainya.
3. **Bukti mendahului pernyataan.** Aturan grounded-claims berlaku verbatim: sebelum melaporkan kemajuan,
   audit setiap klaim terhadap hasil tool dari sesi itu; bila belum terverifikasi, katakan belum. Tidak ada
   centang hijau yang tidak diperoleh.
4. **Commit per gate.** Setiap gate menghasilkan commit checkpoint dan manifest bukti, sehingga status yang
   diklaim selalu bisa diperiksa ulang terhadap repositori nyata.

### Cacat nyata yang ditangkap proses review

Mengklaim proses review berjalan tanpa menyebut apa yang ditangkapnya adalah klaim kosong. Berikut cacat
sungguhan yang ditemukan peninjau berkonteks-segar, semuanya tercatat di
[`docs/internal/notes.md`](docs/internal/notes.md) dan [`.crown/progress.json`](.crown/progress.json):

- **Isolasi keliru pada beban kerja yang sah (Gate 2, FAIL).** Review membangun false positive hidup melalui
  engine sungguhan: konversi gambar png ke webp, kompaksi log di tempat, dan sebuah pemindai yang hanya
  **membaca** berkas jebakan, ketiganya mencapai `ISOLATE_HOST`. Sekaligus ditemukan lubang sebaliknya:
  mengenkripsi mp4 yang sudah berentropi tinggi tetap `SUSPICIOUS` selamanya. Akar masalahnya adalah fusi
  yang terlalu mudah menyala. Perbaikannya adalah desain ulang: sinyal dibelah menjadi diskriminatif dan
  konteks, verdict destruktif mensyaratkan minimal satu sinyal diskriminatif, fast-path canary hanya menyala
  pada WRITE, RENAME, atau DELETE dan tidak pernah pada READ, dan `minCorroboration` dijepit ke minimal 2
  sebagai lantai keamanan yang tidak bisa dilonggarkan konfigurasi.
- **Celah otorisasi di batas aktuasi (Gate 3, FAIL).** Server perintah agen mempercayai **peer mana pun**
  yang berantai ke CA, sehingga keanggotaan CA setara otoritas. Pengikatan catatan audit juga hanya memeriksa
  keberadaan field, bukan keterresolusiannya. Dan distingsi dual control masih berupa pemeriksaan keberadaan
  `rejectionReason`, bukan penegakan approver yang berbeda. Ketiganya diperbaiki menjadi otorisasi issuer yang
  wajib dan deny-by-default, verifikasi catatan audit, dan allow-list fail-closed yang menolak persetujuan
  diri sendiri.
- **Kegagalan aksesibilitas (Gate 5, FAIL).** Baris host di layar Fleet adalah `<tr>` yang hanya bisa diklik
  dan tidak bisa dioperasikan keyboard (WCAG 2.1.1), dan tombol tutup drawer berupa ikon tanpa nama yang bisa
  dibaca teknologi bantu (WCAG 4.1.2). Diperbaiki dan diverifikasi ulang.
- **Kegagalan internasionalisasi (Gate 5, FAIL).** Kamus dan fungsi `t()` sudah ada, tetapi sekitar 30 string
  chrome masih hardcoded Bahasa Inggris: setiap `aria-label`, setiap `title`, seluruh header tabel, tombol
  Prev dan Next, dan baris model. Pelajarannya dicatat: "tanpa string hardcoded" harus mencakup label
  aksesibilitas dan tooltip, bukan hanya teks isi yang terlihat.
- **Kebocoran label di oracle (Gate 1, FAIL).** Battery serangan dan battery jinak ternyata bisa dipisahkan
  sempurna oleh metadata, bukan oleh sinyal: `emitted_at` memakai dua basis jam berbeda, rentang `pid`
  terpisah, `process.signed` selalu berlawanan, dan nama keluarga bocor ke `process.path`. Sebuah detektor
  bisa lulus dengan menghafal metadata alih-alih mendeteksi enkripsi. Diperbaiki, lalu dikunci uji
  separability yang falsifiable, dan uji itu sendiri sempat gagal sampai kebocoran terakhir tertutup.

Menyebut cacat yang benar-benar tertangkap lebih dapat dipercaya daripada mengklaim tidak ada cacat.

### Deviasi metode yang dicatat jujur

Blueprint merencanakan Fase 2 di-fan-out ke banyak agen pekerja di worktree terpisah. Itu **tidak** dilakukan,
dan alasannya dicatat: classifier keamanan pada model pembangun memblokir sebagian besar subagen yang membaca
kode deteksi ransomware, sehingga fan-out menjadi tidak andal; keputusan fusi bersifat sangat terkopel dan
membawa kontrak, yang memang tidak cocok untuk pengerjaan paralel; dan evaluator sinyalnya adalah fungsi murni
kecil yang biaya koordinasinya melebihi kompleksitasnya. Sebagai gantinya, jaminan "penulis tidak meloloskan
kodenya sendiri" dipertahankan lewat **beberapa gelombang review adversarial berkonteks-segar** ditambah
harness penilaian sisi oracle dengan skenario buta.

---

## 3. DeepSeek V4 Pro sebagai mesin runtime produk

Ini kategori yang berbeda dari Claude, dan perbedaannya penting.

**Claude adalah alat waktu-bangun.** Ia menulis kode. Ia tidak berjalan saat produk dipakai, dan tidak ada
satu pun panggilan ke Claude di dalam produk.

**DeepSeek V4 Pro adalah mesin runtime produk.** Ia dipanggil saat aplikasi berjalan untuk menghasilkan
artefak C7: `IncidentReport`, `BlastRadiusMap`, dan `RecoveryPlan`. Pada prototipe ini ia dipanggil lewat
API dengan endpoint yang OpenAI-compatible, dengan kunci API yang **selalu berada di sisi server** dan tidak
pernah masuk ke kode klien.

**Untuk produksi, ini bukan jawaban akhirnya.** ADR-002 mengunci bahwa LLM produksi harus **self-hosted
on-premise** di infrastruktur bank, karena telemetri keamanan tidak boleh keluar dari perimeter, dan itu
persoalan kedaulatan data, bukan preferensi teknis. Kliennya sudah dibangun model-agnostik di belakang
antarmuka `LLMClient`, jadi penggantian ke model open-weight yang dijalankan sendiri lewat SGLang atau vLLM
bersifat **perubahan konfigurasi**, bukan penulisan ulang. LLM cloud di repositori ini berstatus
**dev, test, dan demo saja**, dan itu dinyatakan di `.env.example` maupun di dokumen arsitektur.

Lapisan LLM juga dipagari secara struktural, bukan hanya secara kebijakan: tipe keluarannya hanya memuat
artefak C7, sehingga model tidak punya jalur tipe untuk menerbitkan sebuah `ActionRecord` maupun
`AgentCommand`. Setiap langkah rencana pemulihan harus lolos gerbang faithfulness, dan sitasi yang dikarang
mendiskualifikasi seluruh rencana lalu mengalihkannya ke manusia. Rinciannya, lengkap dengan contoh satu
langkah yang lolos dan satu yang ditolak, ada di [README.md](README.md).

---

## 4. Ringkasan pembagian

| Bagian | Status |
| --- | --- |
| Gagasan produk, model ancaman, tesis | Murni Tim Cyber Crown |
| Arsitektur, kontrak beku C1 sampai C10, ADR-001 sampai ADR-015 | Murni Tim Cyber Crown |
| Kriteria penerimaan dan definisi gate | Murni Tim Cyber Crown |
| Batas keamanan dan keputusan tidak menyentuh malware asli | Murni Tim Cyber Crown |
| Narasi pitch, kurasi skenario demo | Murni Tim Cyber Crown |
| Implementasi kode di `packages/` dan `apps/` | Dibantu Claude, di bawah spesifikasi tim |
| Uji, simulator aman, harness bukti | Dibantu Claude, dinilai peninjau berkonteks-segar |
| Dokumentasi teknis termasuk README dan berkas ini | Dibantu Claude, di bawah arahan tim |
| Pembangkitan laporan insiden dan rencana pemulihan saat runtime | DeepSeek V4 Pro, komponen produk |
| Penyajian LLM produksi | Self-hosted on-premise, roadmap, belum dibangun |

---

## 5. Verifikasi mandiri

Seluruh dasar pernyataan ini bisa diperiksa langsung dari repositori ini, tanpa perlu mempercayai kata-katanya:

```bash
pnpm install
pnpm typecheck                # tsc -b, keluar dengan kode 0
pnpm test                     # 134 uji di 16 berkas
                              # tanpa pnpm db:up dan tanpa DEEPSEEK_API_KEY,
                              # 129 lulus dan 5 uji yang bergantung layanan luar gagal
```

Aturan pembangunannya ada di `CLAUDE.md` dan `.claude/rules/`. Penegakannya ada di `.claude/hooks/`.
Statusnya ada di `.crown/progress.json`. Buktinya ada di `reports/`. Pelajaran dan deviasinya, termasuk
setiap kegagalan review yang disebut di atas, ada di `docs/internal/notes.md`.

---

**Tim Cyber Crown**, Politeknik Negeri Bandung.
Ghaisan Khoirul Badruzaman, Hafiz Fauzan Syafrudin, Moh. Fariq Alaudin, Hasan Nasrullah.
Hackathon WRECK-IT 7.0, final 5 Agustus 2026.
