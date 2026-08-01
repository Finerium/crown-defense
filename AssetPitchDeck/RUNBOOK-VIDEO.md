# RUNBOOK VIDEO 60 DETIK

Crown Defense, Tim Cyber Crown, Politeknik Negeri Bandung. Final Hackathon WRECK-IT 7.0, 5 Agustus 2026.
Satu take, tanpa potongan. Semua label di bawah adalah teks yang benar-benar ada di layar (Bahasa Indonesia,
padanan Inggris dalam kurung).

---

## 1. PRA-TERBANG

**Jendela.** Rekam layar penuh 1920x1080, dua jendela peramban berdampingan.

| | Jendela KIRI | Jendela KANAN |
| --- | --- | --- |
| URL | `/konsol` | `/dashboard` |
| Lebar | sekitar 700 px | sekitar 1220 px |
| Zoom | 70 sampai 80 persen | 90 persen |
| Syarat | kartu "Serangan pada workstation radiologi" dan "Enkripsi arsip sah" terlihat tanpa menggulir | lebar CSS harus di atas 1100 px agar panel tab Langsung tetap dua kolom |

**Masuk.** Kredensial hanya dari `KREDENSIAL-DEMO.md` (file itu gitignored, jangan disalin ke mana pun,
jangan muncul di rekaman). Buka `/konsol/masuk`, isi "Email" dan "Kata Sandi", centang "Ingat saya",
tekan "Masuk". Masuk SATU kali saja sebelum rekaman: batas masuk 5 kali per 5 menit per IP.

**Bahasa dasbor.** Tombol bahasa di kanan atas menampilkan kode bahasa yang SEDANG aktif, jadi awalnya
bertuliskan `EN`. Klik satu kali sampai bertuliskan `ID`. Nama tab berubah menjadi Ringkasan, Insiden,
Armada & Host, Sistem, **Langsung**. Konsol sudah Indonesia sejak awal.

**Aliran.** Buka tab "Langsung". Tunggu lencana **LANGSUNG** (LIVE) di panel "Aliran telemetri" dan
"Detak server" mulai naik. Beban kerja HANYA diambil selama ada koneksi aliran hidup. Kalau tab Langsung
tidak terbuka, run akan menggantung di fase "Antre".

**Dial.** Di panel "Dial otonomi, kendali langsung", pilih **"Otomatis penuh"** (FULL_AUTO). Jangan percaya
kliknya: tunggu sampai posisi itu terbaca ulang dari "Detak server" (maksimal sekitar 2 detik). Dial adalah
memori proses, cold start mengembalikannya ke MONITOR_ONLY. FULL_AUTO dipakai karena hanya di posisi ini
perintah isolasi benar-benar diterbitkan, dan penolakan isolasi pada beban kerja sah jadi jauh lebih kuat
justru karena terjadi pada dial paling permisif.

**Posisi awal.** Gulir jendela kanan sampai panel "Aliran telemetri" dan langkah 2 "Evaluator sinyal"
terlihat bersamaan. Muat ulang dasbor tepat sebelum tombol rekam ditekan: koneksi aliran didaur ulang
sekitar tiap 5 menit, memuat ulang memberi jendela bersih untuk take 60 detik.

**Batas laju, baca ini sebelum latihan.** Satu take penuh memakan 2 run + 1 analisis.

- Run: 6 per 5 menit per sesi, 40 per jam global. Maksimal 3 take dalam 5 menit.
- Analisis: 4 per 10 menit per IP, 25 per jam global.

Latih timing dengan gerakan tanpa klik. JANGAN menekan "Buat laporan insiden" untuk latihan: kalau kuota
analisis habis, panel "Rencana pemulihan" tampil nyaris kosong di kamera, dan itu satu-satunya kondisi
yang terlihat rusak.

**Terakhir.** Matikan notifikasi, sembunyikan bilah bookmark, tutup tab lain.

---

## 2. TABEL SHOT

Total 60 detik. KIRI = konsol, KANAN = dasbor.

| Detik | Di layar | Klik (label persis) | Ucapan / caption | Durasi |
| --- | --- | --- | --- | --- |
| 00-07 | KANAN, tab "Langsung". "Detak server" naik `#n` tiap 2 detik, "Jam server (UTC)" berjalan, "Laju peristiwa aliran" datar, tulisan "Menunggu beban kerja" dan catatan "Diam sesuai rancangan..." | tidak ada, diam saja | "Dasbor dalam keadaan diam. Detak server naik tiap dua detik: alirannya hidup, telemetrinya kosong. Sistem tidak mengarang data." | 7 dtk |
| 07-10 | KIRI, panel "Simulasi serangan" | tombol **"Jalankan beban kerja"** pada kartu **"Serangan pada workstation radiologi"** (host `mrh-rad-ws-07`). Panel "Kemajuan beban kerja" berpindah "Antre" lalu "Berjalan" | "Dari konsol terpisah, saya nyalakan serangan pada workstation radiologi." | 3 dtk |
| 10-18 | KANAN. "Peristiwa masuk" naik, panel "Evaluator sinyal": lima baris `CANARY_TAMPER`, `ENTROPY_DELTA`, `OP_FREQUENCY`, `TYPE_HEADER_CHANGE`, `FORMAT_VALIDATION_FAIL` dengan skor, penanda "titik nyala teramati", lencana **MENYALA** / **DIAM**. Lalu langkah 3 "Asal usul keputusan": `MASS_ENCRYPTION`, `ISOLATE_HOST`, "JALUR CEPAT KANARI" | tidak ada, hanya gulir pelan ke langkah 3 | "Konsol tidak pernah mengirim vonis. Mesin membaca telemetri sendiri. Kanari tersentuh, jalur cepat menyala, vonis MASS_ENCRYPTION." | 8 dtk |
| 18-25 | KANAN, langkah 4 "Log aksi agen", sub "CATATAN AUDIT DITULIS SEBELUM PERINTAH DITERBITKAN": catatan audit dengan `chain_seq` dan `record_hash` lebih dulu, lalu baris **"PERINTAH DITERBITKAN"** beserta jenis perintah dan host tujuan. Di sebelahnya "Latensi, sebagaimana diukur", kolom "Deteksi, jam dinding terukur" dengan lencana TERUKUR | gulir ke langkah 4 | "Catatan audit ditulis lebih dulu, baru perintah isolasi diterbitkan. Deteksi terukur di angka milidetik." | 7 dtk |
| 25-36 | KANAN, tab **"Insiden"**, panel "Rencana pemulihan" sub "LLM · saran". Tombol berubah jadi "Membuat (LLM on-prem)…", lalu muncul ringkasan, langkah rencana dengan "sitasi: PB-...", lencana "Kesetiaan" dan baris model | tab **"Insiden"**, lalu tombol **"Buat laporan insiden"** | "Model menulis laporan insiden dan rencana pemulihan, bergerbang kesetiaan, tiap langkah bersitasi playbook. Model hanya memberi saran, tidak pernah menerbitkan aksi." | 11 dtk |
| 36-40 | Kembali KANAN ke tab **"Langsung"** (permukaan kosong lagi, itu wajar), lalu KIRI panel "Beban kerja sah" | tab **"Langsung"**, lalu tombol **"Jalankan beban kerja"** pada kartu **"Enkripsi arsip sah"** (host `mrh-nas-01`) | "Sekarang bagian terpentingnya: beban kerja yang benar-benar sah." | 4 dtk |
| 40-54 | KANAN. Sinyal naik lagi, vonis tetap `MASS_ENCRYPTION`, lalu panel **"Tidak mengisolasi, dengan sengaja"** dengan judul **"ISOLASI DITOLAK"**, kutipan "Mesin, kata demi kata", "Modul kontainmen, kata demi kata", "Alasan yang tercatat di katalog skenario sebelum proses berjalan", dan **"TIDAK ADA PERINTAH DITERBITKAN"** | gulir ke langkah 3 | "Entropi melonjak, format gagal, vonisnya tetap MASS_ENCRYPTION. Dial masih Otomatis penuh. Dan isolasi tetap ditolak, dengan alasan mesin itu sendiri, kata demi kata." | 14 dtk |
| 54-60 | KANAN, panel "Pernyataan batas" di atas tab Langsung | tidak ada | "Peristiwa tersimulasi, mesin keputusan asli. Tidak ada malware nyata di mana pun." | 6 dtk |

Catatan urutan: pindah ke tab "Insiden" me-reset permukaan Langsung (komponennya dilepas). Itu tidak merusak
take, karena run beban kerja sah mengisinya lagi dari nol. Kalau tim ingin panel "Dua proses terakhir,
berdampingan" tetap memuat kedua run, tukar beat 25-36 dengan beat 40-54 (laporan model dipindah ke akhir).

---

## 3. YANG BISA GAGAL, DAN PEMULIHANNYA

**Aliran menyambung ulang.** Lencana berubah jadi "MENYAMBUNG ULANG" atau "ALIRAN TIDAK TERSEDIA".
Sebelum picu: tekan **"Sambungkan ulang sekarang"**, tunggu "LANGSUNG", mulai take dari awal. Di tengah run:
jangan potong, keadaan layar tidak hilang, hanya peristiwa saat putus yang tidak tampil; run tetap selesai.
Kalau layar penuh tanda hubung, itu perilaku jujurnya, angka tidak pernah diisi dari ingatan.

**Fase tetap "Antre".** Aliran tidak terbuka atau instansi server terpisah. Pastikan tab "Langsung" aktif.
Kalau dalam 5 detik "Peristiwa masuk" masih tanda hubung, HENTIKAN take. Jangan klik dua kali, tiap klik
memakan kuota. Pemicu cadangan: panel "Jalankan beban kerja" yang ada di dalam tab Langsung sendiri.

**429.** Pesan merah muncul di konsol: "Terlalu banyak beban kerja dijalankan. Coba lagi beberapa menit
lagi." atau "Batas global per jam tercapai. Demo dijeda sementara untuk menjaga biaya." Berhenti, tunggu
jendela 5 menit lewat, jangan menekan berulang.

**Model tidak tersedia.** Kalau kunci model tidak terkonfigurasi, panel tetap menampilkan tiga langkah
rencana tetapi baris model berbunyi "cadangan". Itu degradasi jujur, boleh tayang, sebut apa adanya.
Kalau gerbang kesetiaan menahan keluaran, panel berbunyi "Diteruskan ke manusia" diikuti angka kesetiaan:
juga hasil sah, ucapkan "gerbang kesetiaan menahan keluaran model". Kalau kuota analisis habis, panel jadi
nyaris kosong: hentikan take, jangan pernah membakar kuota analisis untuk latihan.

**Run tanpa vonis destruktif.** Panel "Asal usul keputusan" berbunyi "Tidak ada vonis destruktif pada proses
ini". Pada run serangan: hentikan take, jangan mengulang di kamera. Pada beban kerja sah: itu justru hasil
yang benar, panel penolakan tetap muncul karena tidak ada perintah yang diterbitkan. Kalau "Enkripsi arsip
sah" tidak berperilaku seperti dilatih, ganti ke kartu **"Kompaksi log"**: tiga sinyal konteks menyala dan
aturan fusi menahan vonis destruktif.

**Cold start.** Dial kembali ke MONITOR_ONLY dan rantai audit kosong. Selalu cek pembacaan ulang dial dari
"Detak server" sebelum tombol rekam ditekan.

---

## 4. YANG TIDAK BOLEH DIUCAPKAN

- Jangan "ini ransomware sungguhan" atau "kami mendeteksi malware". Kalimat aman, dan itu memang tertulis di
  layar: **"Peristiwa tersimulasi, mesin keputusan asli."**
- Jangan menyebut angka latensi sebagai hasil pengukuran lapangan. "Deteksi, jam dinding terukur" adalah
  waktu proses mesin di dalam proses, bukan waktu di endpoint nyata dan bukan round trip jaringan.
  "Deteksi, lini masa SIMULASI" bukan latensi produksi sama sekali, dan layar sudah menandainya.
- Jangan bilang laporan model menganalisis run yang barusan berjalan. Panggilan modelnya hidup, tetapi
  konteks insiden yang dikirim adalah konteks demo tetap (INC-2026-0612-004).
- Jangan menyebut tab Ringkasan, Insiden, Armada & Host, dan Sistem sebagai data langsung. Hanya tab
  "Langsung" yang berasal dari aliran. Spanduk demo di atas layar sudah menyatakannya.
- Jangan menyebut angka false positive sebagai laju statistik.
- Jangan pernah menyebut nama kode internal. Nama produk selalu "Crown Defense".
- Jangan menampilkan halaman masuk yang terisi, jangan menyebut kredensial. Masuk sebelum rekaman.
- Tidak ada malware nyata di mana pun dalam demo ini. Tidak pernah diunduh, tidak pernah dijalankan.

---

## 5. VARIAN 20 DETIK

Persiapan tambahan: jalankan **"Enkripsi arsip sah"** SEBELUM rekaman dengan dial FULL_AUTO, biarkan selesai.
Panel "Dua proses terakhir, berdampingan" kini menyimpan run yang ditahan. Biaya varian ini hanya 1 run saat
rekaman, tanpa analisis.

| Detik | Di layar | Klik | Ucapan | Durasi |
| --- | --- | --- | --- | --- |
| 00-03 | "Detak server" naik, "Menunggu beban kerja" | tidak ada | "Diam. Detak hidup, telemetri kosong." | 3 dtk |
| 03-05 | KIRI | **"Jalankan beban kerja"** pada **"Serangan pada workstation radiologi"** | "Serangan pada workstation radiologi." | 2 dtk |
| 05-12 | "Evaluator sinyal" naik, lalu `MASS_ENCRYPTION`, `ISOLATE_HOST`, "JALUR CEPAT KANARI" | gulir | "Mesin memutuskan sendiri dari telemetri." | 7 dtk |
| 12-16 | "Log aksi agen": catatan audit lebih dulu, lalu "PERINTAH DITERBITKAN" | gulir | "Audit ditulis dulu, baru isolasi." | 4 dtk |
| 16-20 | Panel "Dua proses terakhir, berdampingan": kolom kiri run serangan "PERINTAH DITERBITKAN", kolom kanan beban kerja sah "TIDAK ADA PERINTAH DITERBITKAN" | gulir | "Beban kerja sah, dial sama, isolasi ditolak." | 4 dtk |
