'use client';
/**
 * Sign-in for the attack simulation console.
 *
 * The copy on this page is FIXED Indonesian, agreed with the product owner character for character, so it
 * is deliberately NOT routed through lib/i18n: it must read the same whatever the console language toggle
 * says. The two places the copy spells the product name out are built by interpolating PRODUCT_NAME, so the
 * rendered text matches the agreed wording without hardcoding the display name (product.md / OQ-5).
 *
 * The environment summary numbers are COMPUTED from the seeded demo environment (lib/data.ts), never typed
 * as literals. The third stat is 0 real malware, which is the safety boundary, not a measurement.
 */
import { useState } from 'react';
import { Glyph } from '../../../components/ui';
import { PRODUCT_NAME, demoScenario } from '../../../lib/data';
import type { MasukResponse } from '../../../lib/server/types';
import '../../konsol.css';

const GAGAL_JARINGAN = 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.';
const CATATAN_LUPA =
  'Purwarupa ini tidak punya pemulihan mandiri. Hubungi Tim Cyber Crown untuk mengatur ulang kata sandi Anda.';

export default function Page() {
  const s = demoScenario();
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [ingat, setIngat] = useState(false);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [lupa, setLupa] = useState(false);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch('/api/konsol/masuk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: sandi, ingatSaya: ingat }),
      });
      const d = (await r.json()) as MasukResponse;
      if (r.ok && d.ok) {
        // Full navigation, so the server component at /konsol re-reads the freshly set session cookie.
        window.location.assign('/konsol');
        return;
      }
      setGalat(d.pesan ?? GAGAL_JARINGAN);
    } catch {
      setGalat(GAGAL_JARINGAN);
    }
    setProses(false);
  }

  return (
    <div className="kn-masuk" lang="id">
      {/* The form comes first in the DOM: on a narrow screen it stacks first with no CSS reordering, so the
          visual order and the reading order stay identical. */}
      <section className="kn-masuk-form">
        <div className="kn-masuk-inner">
          <h1>Masuk ke konsol</h1>
          <p>Konsol simulasi dibatasi untuk tim penguji dan juri.</p>

          <div role="alert" aria-live="assertive">
            {galat ? (
              <p className="kn-masuk-err">
                <Glyph k="tri" size={11} color="#7a1f18" />
                <span>{galat}</span>
              </p>
            ) : null}
          </div>

          {/* method="post" matters even though onSubmit handles this: before hydration, or with JS off,
              a submit falls back to the browser's native behaviour, and the default is GET. That would
              put the operator password into the URL, the history, and the server access log. */}
          <form onSubmit={kirim} method="post" noValidate>
            <label className="kn-field" htmlFor="kn-email">
              <span>Email</span>
              <input
                id="kn-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nama@instansi.go.id"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </label>

            <label className="kn-field" htmlFor="kn-sandi">
              <span>Kata Sandi</span>
              <input
                id="kn-sandi"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Masukkan kata sandi Anda"
                value={sandi}
                onChange={(ev) => setSandi(ev.target.value)}
                required
              />
            </label>

            <div className="kn-masuk-row">
              <label className="kn-check" htmlFor="kn-ingat">
                <input
                  id="kn-ingat"
                  type="checkbox"
                  checked={ingat}
                  onChange={(ev) => setIngat(ev.target.checked)}
                />
                Ingat saya
              </label>
              <button
                type="button"
                className="kn-lupa"
                aria-expanded={lupa}
                aria-controls="kn-lupa-note"
                onClick={() => setLupa(!lupa)}
              >
                Lupa kata sandi
              </button>
            </div>

            <div id="kn-lupa-note">{lupa ? <p className="kn-hint">{CATATAN_LUPA}</p> : null}</div>

            <button type="submit" className="kn-submit" disabled={proses} aria-busy={proses}>
              {proses ? <Glyph k="circle" size={8} color="#fff6f4" className="kn-live" /> : null}
              Masuk
            </button>
            {/* <output> is natively a polite live region, so the pending state announces itself. */}
            <output className="kn-masuk-pending">{proses ? 'Memeriksa kredensial...' : ''}</output>
          </form>

          <p className="kn-masuk-foot">
            Akses dibatasi dan setiap sesi tercatat. Butuh akses? Hubungi Tim Cyber Crown.
          </p>
          <p className="kn-masuk-sign">{`${PRODUCT_NAME}, Purwarupa Hackathon WRECK-IT 7.0`}</p>
        </div>
      </section>

      <aside className="kn-masuk-copy">
        <div>
          <div className="kn-masuk-brand">{PRODUCT_NAME.toUpperCase()}</div>
          <div className="kn-masuk-brandsub">KONSOL SIMULASI SERANGAN</div>
        </div>

        <span className="kn-masuk-badge">
          <Glyph k="ring" size={9} color="#ff8177" />
          LINGKUNGAN TERISOLASI
        </span>

        <h2 className="kn-masuk-h1">Serangannya kami yang memulai. Keputusannya bukan.</h2>

        <p className="kn-masuk-lede">
          {`Konsol ini hanya menyalakan beban kerja pada lingkungan rumah sakit tersimulasi. Ia tidak mengirim peringatan, tidak menyentuh dasbor, dan tidak memiliki satu pun jalur menuju keputusan isolasi. Yang memutuskan host mana yang diputus adalah mesin deteksi ${PRODUCT_NAME}, membaca telemetri, dan menanggung sendiri bila ia keliru.`}
        </p>

        <div className="kn-masuk-card">
          <h3>RINGKASAN LINGKUNGAN</h3>
          <div className="kn-masuk-stats">
            <div className="kn-masuk-stat">
              <b>{s.kpis.enrolled}</b>
              <span>host terpantau</span>
            </div>
            <div className="kn-masuk-stat">
              <b>{s.segments.length}</b>
              <span>segmen klinis</span>
            </div>
            <div className="kn-masuk-stat">
              <b>0</b>
              <span>malware nyata</span>
            </div>
          </div>
        </div>

        <ul className="kn-masuk-chips">
          <li className="kn-masuk-chip">
            <Glyph k="check" size={11} color="#6fd79b" />
            <div>
              <b>Simulator jinak</b>
              <span>Reversibel, terkurung satu direktori, tanpa jaringan</span>
            </div>
          </li>
          <li className="kn-masuk-chip">
            <Glyph k="x" size={11} color="#ff8177" />
            <div>
              <b>Tanpa malware nyata</b>
              <span>Tidak pernah diunduh maupun dijalankan</span>
            </div>
          </li>
          <li className="kn-masuk-chip">
            <Glyph k="diamond" size={11} color="#b3bfcd" />
            <div>
              <b>Setiap aksi teraudit</b>
              <span>Rantai hash, tercatat sebelum dieksekusi</span>
            </div>
          </li>
        </ul>
      </aside>
    </div>
  );
}
