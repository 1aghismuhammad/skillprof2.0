# Postmortem Arsitektur — Integrasi Frontend–Backend SkillProof (FE-01 s/d FE-10)

- **Status:** FINAL_FOR_COUNCIL
- **Tanggal:** 2026-11-14
- **Peran:** Arsitek (read-only terhadap kode aplikasi)
- **Acuan:** `docs/specs/FRONTEND_INTEGRATION_PLAN.md`, `docs/tickets/FE-01…FE-10`, `docs/ai/handoffs/FE-*-{BUILD,QA,COUNCIL}.md`, kode aktual `frontend/src/**`, dan kode backend yang relevan untuk verifikasi DTO.
- **Metode:** inspeksi kode langsung (bukan hanya membaca handoff), grep aturan §6.2 rencana, `npm test`, build Vite ke direktori sementara, serta dua probe Node di scratchpad (tidak ada file repo yang diubah selain dokumen ini).

---

## 0. Ringkasan untuk Council (BLUF)

**Vonis: arsitektur terimplementasi sesuai rencana dan sehat secara struktural. Klaim "selesai 100%" pada FE-10-COUNCIL §2 belum didukung bukti integrasi nyata.**

Yang terbukti (diverifikasi ulang oleh Arsitek, bukan dikutip dari handoff):

| Aspek | Hasil |
|---|---|
| Lapisan View → Store → `api.js` | 0 view/komponen mengimpor `lib/api`; `axios` hanya di `src/lib/api.js:1` |
| `localStorage`/`sessionStorage`/`document.cookie` | 0 match di `frontend/src` |
| `v-html` / `raw_response` | 0 / 0 |
| `npm test` | **23/23 pass**, 4 suite, 464.9 ms |
| Build Vite (output ke scratchpad, bukan `frontend/dist`) | **1844 modul**, JS 338.45 kB (gzip 107.84 kB), CSS 120.12 kB. Hash `index-Dz63v85t.js` **identik** dengan audit Satpam FE-10 R3, jadi tree yang diaudit sama dengan tree sekarang. |

Tiga hal yang membatasi klaim "selesai":

1. **Belum ada satu pun langkah E2E.** Ke-13 langkah smoke test di rencana §6.3 tidak pernah dijalankan. Setiap QA menyatakan buktinya statis atau memakai API tiruan. Cookie HttpOnly, CORS/SameSite, request-count, dan alur sebenarnya belum pernah diamati di browser.
2. **Kode dan jejak audit tidak terlindungi oleh git.**
   - `frontend/` masih untracked (`git status -s` menampilkan `?? frontend/`).
   - `docs/tickets/` dan `docs/ai/` di-ignore oleh `.gitignore:108-109`.
   - Akibatnya seluruh produk frontend beserta tiket, handoff, dan laporan QA hanya ada di working tree. Satu `git clean -fdx` atau kerusakan disk menghapus semuanya.
   - Prasyarat baseline §5.0 tidak pernah dipenuhi, sehingga kepatuhan allowlist tidak dapat dibuktikan di tiket mana pun.
3. **Lima temuan baru dari analisis ini, tidak tercatat di QA mana pun** (detail di §2.2–§4.3):
   - **A-1 (P1):** pil dan banner analisis AI global tidak tampil di Dashboard, My Projects, My Profile, dan Complete Profile, karena keempat view itu tidak memakai `WorkspaceLayout`. Langkah E2E #4 di rencana akan gagal.
   - **A-2 (P2, keamanan):** *client-side path traversal* di `/p/:slug`. Sudah dibuktikan: `/p/..%2F..%2Fauth%2Fme` menghasilkan `GET http://localhost:3000/api/auth/me` dengan cookie korban.
   - **A-3 (P2):** `fetchUserSkills` dan `fetchPendingAssessments` tidak punya token urutan. Accept dua kartu dengan cepat dapat menghilangkan skill dari daftar (hanya state UI; pulih saat reload).
   - **A-4 (P3):** `custom_bio` tampil dua kali di halaman publik.
   - **A-5 (P3):** tiga view menulis `career.selectedTargetId` langsung, melewati action store.

**Lima tindakan teratas**, dengan detail di §7:

1. Owner meng-commit `frontend/` dan memutuskan nasib `docs/tickets` dan `docs/ai` di `.gitignore`.
2. Jalankan E2E §6.3 dengan `AI_PROVIDER=mock`.
3. Perbaiki A-2: encode slug dan cek regex sebelum request.
4. Perbaiki A-1 dengan memigrasi 4 view ke `WorkspaceLayout`. Ini sekaligus menghapus 4 salinan sidebar.
5. Pindahkan reproduksi race milik Satpam menjadi test store permanen. Ini sudah terbukti bisa dengan `node:test` + `mock.module`, **tanpa dependency baru** (§5.3).

---

## 1. Cakupan & Bukti yang Dijalankan

| Perintah / pemeriksaan | Hasil |
|---|---|
| `npm test` (cwd `frontend`) | `tests 23 · suites 4 · pass 23 · fail 0`. Komposisi: `normalizeApiError` 8, `safeRedirect` 3, `resolveNavigation` 9, `isHttpUrl` 3. |
| `npx vite build --outDir <scratchpad>/dist-check --emptyOutDir` | `✓ 1844 modules transformed`, `index-c0OX2flN.css 120.12 kB`, `index-Dz63v85t.js 338.45 kB │ gzip 107.84 kB`. `frontend/dist` dan `node_modules/.vite` tidak disentuh. |
| Grep aturan §6.2 rencana | Lihat §2.1. Semua lulus. |
| Probe slug (Node, scratchpad) | `{"slug":"../../auth/me","axiosUri":".../api/public/portfolios/../../auth/me","browserResolved":"http://localhost:3000/api/auth/me"}` |
| Probe testabilitas store (Node, scratchpad) | `node --test --experimental-test-module-mocks` dengan `mock.module(api.js)`: store `portfolio.js` asli berhasil diimpor dan diuji (`fetchMine` tanpa `has_portfolio`, GET sharing basi setelah `remove()`). Hasil: `pass 1 · fail 0`. |
| Ekspor handler backend `[id]/route.js` | DELETE ada di projects, user-skills, career-targets, dan portfolios. Preflight `middleware.js:59` mengizinkan `GET, POST, PUT, DELETE, PATCH, OPTIONS`. |
| `git status -s`, `git check-ignore -v` | `?? docs/specs/`, `?? frontend/`. `docs/tickets/` diabaikan oleh `.gitignore:109`, `docs/ai/` oleh `.gitignore:108`. |

**Tidak dijalankan:** E2E browser, backend lint/build/test (tidak ada perubahan backend pada inisiatif ini), dan uji provider AI nyata.

---

## 2. Evaluasi Kepatuhan Arsitektur (Fokus 1)

### 2.1 Aturan lapisan & keamanan

| Aturan (rencana) | Pemeriksaan | Hasil |
|---|---|---|
| D-2: View → store action → `api.js`; tanpa `services/` | `grep -rln "lib/api" src/views src/components` | **0 file** |
| Satu klien HTTP | `grep -rn "from 'axios'" src` | Hanya `src/lib/api.js:1` |
| Cookie auth | `withCredentials: true` (`api.js:15`); `document.cookie` 0 | Lulus |
| Modul murni dapat diuji Node | `import.meta` / `.vue'` di `guard.js`, `apiError.js`, `url.js` | 0 |
| D-9: tanpa storage domain bisnis | `localStorage\|sessionStorage\|indexedDB` di `src` | **0** (kunci `skillproof_*` juga 0) |
| §3.8-2: tanpa HTML mentah | `v-html\|innerHTML\|insertAdjacentHTML` | **0** |
| §3.8-3: URL eksternal | Semua `target="_blank"` di view memakai `rel="noopener noreferrer"` dan `isHttpUrl` (course, project, evidence, kontak publik). `window.open(..., 'noopener,noreferrer')` di builder `:240`. | Lulus |
| §3.8-4: open redirect | `safeRedirect` dipakai di `loginView.vue:47` dan guard; diuji 3 kasus | Lulus |
| §3.8-5: `raw_response` | 0 | Lulus |
| D-6: `/auth/me` hanya untuk rute ber-meta | `router/index.js:70-81`: `ensureSession` hanya bila `requiresAuth \|\| guestOnly`; `/p/:slug` tanpa meta | Lulus |
| D-5: logout/401 = navigasi keras | `auth.js:59-68`, `main.js:13-18` | Lulus |
| D-11: konten tidak mengirim `is_published` | `portfolio.js` `save()` membuang field tersebut | Lulus |

**Kesimpulan:** lapisan diterapkan **konsisten di 16 view dan 3 komponen**. Tidak ada jalur HTTP yang melewati store. Isolasi data bisnis 100%: semua state ada di Pinia (memori) dan bersumber dari server.

### 2.2 Ketidakmurnian yang tersisa (tidak tercatat sebagai blocker)

| ID | Temuan | Lokasi | Dampak | Sev. |
|---|---|---|---|---|
| **A-1** | 4 view tidak memakai `WorkspaceLayout` dan masih membawa sidebar sendiri. Akibatnya **pil "AI menganalisis N proyek…" dan banner selesai tidak tampil** di halaman tersebut. Notice tetap tersimpan di store dan baru muncul saat user membuka halaman ber-layout. | `dashboardView.vue`, `myProjectView.vue`, `myProfileView.vue`, `profileView.vue` (masing-masing 8–9 referensi `sidebar`; 0 referensi `analyzingCount`/`notice`) | AC FE-04 #2 dan E2E §6.3 #4 ("pindah ke Dashboard → pil tampil") **tidak terpenuhi di Dashboard**. Navigasi juga terduplikasi 5 kali dan rawan drift. | **P1** |
| **A-5** | View menulis state store langsung: `career.selectedTargetId = …` | `competencyProgressView.vue:137`, `courseRecommendationsView.vue:92`, `projectRecommendationsView.vue:102` | Melanggar "mutasi lewat action". Penyebabnya `selectTarget()` selalu memicu `fetchGap`, yang tidak dibutuhkan halaman tersebut. Store kurang satu action setter. | P3 |
| A-6 | Normalisasi DTO backend berada di **view**, bukan store: `applyDraft`/`applyPortfolio` membaca `suggested_*`/`selected_*` dan `career_target` nested/flat | `portfolioBuilderView.vue:243-263, 343-377` | View mengetahui dua bentuk wire format, dan normalizer tidak bisa diuji sebagai modul murni. Lihat §3.3. | P2 |
| A-7 | Duplikasi `isHttpUrl` lokal | `profileView.vue:51` (versi tanpa `trim`, berbeda dari `lib/url.js`) | Dua implementasi validasi URL di trust boundary | P3 |
| A-8 | Kode mati | `components/HelloWorld.vue` (+ `assets/vue.svg`, `vite.svg`) tidak diimpor; `portfolioStore.publicPortfolio` (`portfolio.js:12`) tidak pernah dipakai; `fetchGapSummary` di rencana §3.3.4 tidak dibuat (Dashboard memakai target progress, sesuai catatan FE-08-QA) | Kebisingan untuk agen berikutnya | P3 |

Catatan: A-1 berasal dari **cacat rencana saya sendiri**. Rencana §7 (`FRONTEND_INTEGRATION_PLAN.md:992`) mengeluarkan refactor sidebar duplikat dari lingkup, padahal §6.3 #4 mengharapkan pil tampil di Dashboard. Kedua pernyataan itu saling bertentangan, dan tidak ada QA yang menangkapnya karena E2E tidak pernah dijalankan.

### 2.3 Postur keamanan: temuan baru A-2 (Client-Side Path Traversal)

- **Mekanisme:** vue-router mendekode `%2F` di param. `portfolio.js:108` lalu menyisipkan `slug` mentah ke path: `` api.get(`/public/portfolios/${slug}`) ``. Browser menormalisasi `..` sehingga request keluar ke endpoint API lain **dengan cookie korban** (`withCredentials`).
- **Bukti:** probe di §1. `/p/..%2F..%2Fauth%2Fme` menjadi `GET /api/auth/me`.
- **Dampak saat ini: rendah.**
  - Hanya metode GET.
  - CSRF middleware hanya memeriksa metode yang mengubah state (`middleware.js:39`).
  - Respons dirender sebagai teks, tanpa `v-html`, dan hanya tampil ke korban sendiri. Tidak ada eksfiltrasi.
  - Efek samping nyata saat ini: penyerang dapat membagikan tautan `/p/..%2Fcareer-targets%2F<id>%2Frecommendations`. Korban yang membukanya memicu **panggilan AI berbayar** atas sesinya (ID target berurutan sehingga mudah ditebak).
  - Risiko naik bila suatu GET kelak memiliki efek samping.
- **Perbaikan (±3 baris):**
  1. Di `fetchPublic`, ganti path dengan `` `/public/portfolios/${encodeURIComponent(slug)}` ``.
  2. Di `publicPortfolioView.load()`, tolak slug yang tidak cocok dengan `^[a-z0-9]+(?:-[a-z0-9]+)*$`; langsung tampilkan pesan 404 identik tanpa request.
- **Pemeriksaan sumber param lain:** `route.query.project` di analyzer hanya dicocokkan ke daftar ID dari server (`aiSkillAnalyzerView.vue:29-46`), jadi tidak rentan. Semua `${id}` lain berasal dari data server.

---

## 3. Adaptasi DTO & Drift Kontrak (Fokus 2)

### 3.1 Inventaris drift yang ditemukan di lapangan

| # | Drift | `API_CONTRACT.md` | Backend aktual (sumber kebenaran, D-1) | Adaptasi frontend | Lapisan | Penilaian |
|---|---|---|---|---|---|---|
| 1 | `GET /portfolios` tanpa `has_portfolio` | `:2270`, `:2321` menulis `has_portfolio` | `app/api/portfolios/route.js:25-31`: hanya `{status, data, message?}` | `fetchMine()`: `has_portfolio != null ? Boolean(flag) : Boolean(data)`, lalu `&& data != null` | **Store** ✔ | Benar dan forward-compatible bila backend kelak menambah flag. |
| 2 | Draf AI `suggested_projects/skills` vs `selected_*` | `:2210` `selected_projects` | `lib/ai/portfolio-builder.js:306-307` `suggested_*` | `applyDraft()` membaca `suggested_* \|\| selected_*` | **View** ⚠ | Aman, tetapi di lapisan yang salah (A-6). Toleransi ganda menyamarkan drift berikutnya. |
| 3 | `career_target` nested vs flat | Flat `career_target_id` | Privat: `{id,title,description}` (`lib/portfolio.js:157-163`). Publik: `{title,description}` tanpa `id` (`:712-717`). Tulis: flat `career_target_id`. | Baca `career_target?.id ?? career_target_id`; tulis flat | **View** ⚠ | Menutup cacat P1 FE-09 F3 (relasi target terhapus diam-diam pada save kedua). Asimetri baca-nested/tulis-flat perlu didokumentasikan. |
| 4 | Batas panjang `summary`/`custom_bio` | `:2362-2363` maks 4000 | `lib/validation.js:797` summary 2000, `:812` bio 1000; `custom_description` **dipotong** diam-diam di 2000 | Validasi pra-submit, `maxlength`, dan tampilan `errors[]` | View | Pilihan benar (kode = kebenaran). Validasi kini terduplikasi di 2 tempat dengan kontrak yang salah, jadi akan drift lagi. |
| 5 | `PUT /profile` → `data` langsung | Tiket FE-02 `:37` menulis `data:{user}` | `data` berisi field user | `updateProfile` merge `res.data.data` | Store ✔ | Tiket yang salah, bukan kontrak. |
| 6 | Payload accept: field datar | Tiket mengasumsikan `user_skill` nested | Datar (`user_skill_id`, `skill_name`, …) | `acceptAssessment` mendukung keduanya, lalu refetch penuh | Store ✔ | Cabang nested bersifat spekulatif (kode mati yang ditoleransi). |
| 7 | Middleware 403 memakai `error`, bukan `message` | Tidak didokumentasikan | `middleware.js:45,73,86` | `normalizeApiError`: `message \|\| error \|\| fallback` (diuji) | Lib ✔ | Benar. |
| 8 | 409 portofolio: dua makna | Tidak dibedakan | `lib/portfolio.js:197` ("sudah memiliki portofolio") vs `:208/:364` ("Slug … sudah digunakan") | `msg.includes('slug')` / `'portofolio'` | View ⚠ | **Rapuh:** bergantung pada teks pesan berbahasa Indonesia. Backend perlu `code` mesin (§7, BE-GAP-07). |
| 9 | 422 generate | Tidak ada di kontrak #39 | Ada | Ditangani, dengan CTA ke `/projects` dan `/skill-profile` | View ✔ | Sudah tercatat di DOC-01. |
| 10 | `published_at` | Bermakna "tanggal publikasi" | `= updated_at` (`lib/portfolio.js:720`) | Ditampilkan apa adanya | — | Semantik backend salah: edit kontak mengubah "Dipublikasikan". |
| 11 | Pagination key | — | `totalPages` (camelCase) | Membaca `totalPages ?? total_pages` | Store | Toleransi tidak berbahaya. |

### 3.2 Apakah adaptasinya arsitektural, aman, dan interoperabel?

- **Aman: ya.**
  - Semua adaptasi bersifat *read-tolerant*. Tidak ada adaptasi yang menambah field tulis.
  - D-11 utuh.
  - Tidak ada data yang hilang diam-diam setelah perbaikan FE-09 F3.
- **Arsitektural: sebagian.**
  - Adaptasi 1, 5, 6, 7, 11 berada di store/lib, yaitu lapisan *anti-corruption* yang dirancang.
  - Adaptasi 2, 3, 4, 8 berada di view. Akibatnya bentuk wire format bocor ke komponen dan tidak bisa diuji sebagai modul murni.
- **Interoperabilitas: berisiko jangka menengah.**
  - Pola "terima dua bentuk" menutupi gejala tanpa menetapkan kontrak.
  - Bila backend berubah lagi, frontend bisa diam-diam membaca field yang salah.
  - Akar masalahnya: **`API_CONTRACT.md` tidak pernah diperbarui** selama 10 tiket. Setiap agen menemukan ulang drift yang sama. FE-09 butuh 3 putaran revisi, sebagian besar karena drift #1–#4.

### 3.3 Rekomendasi kontrak

1. **DOC-01 (diperluas):** perbarui `API_CONTRACT.md` mengikuti kode untuk butir 1, 2, 3, 4, 8, 9, 10, plus jumlah endpoint (47) dan makna `public_url`.
2. **Pindahkan normalizer ke store** sebagai fungsi murni. Contoh: `normalizeDraft()` dan `normalizePortfolio()` diekspor dari `stores/portfolio.js` atau `lib/dto.js`. Uji dengan **fixture JSON hasil tangkapan backend aktual**, bukan contoh di dokumen.
3. Setelah kontrak dikoreksi, hapus cabang toleransi yang tidak lagi kanonis (`selected_*`, nested `user_skill`, `total_pages`) agar drift berikutnya gagal keras di test, tidak lolos diam-diam.

---

## 4. Ketahanan Konkurensi (Fokus 3)

### 4.1 Inventaris mekanisme

| Mekanisme | Lokasi | Cakupan kunci | Menjaga sukses / error / `finally` | Penilaian |
|---|---|---|---|---|
| `loadSeq` | `publicPortfolioView.vue:17,52-77` | Per instance view | ✔ / ✔ / ✔ (+ `document.title`) | Efektif untuk pergantian slug cepat (FE-10 F1). |
| `progressSeq` | `skills.js:13,202-208` | Global | ✔ / – / – | Efektif untuk urutan. Error dan loading dikelola view tanpa token (kosmetik). |
| `targetProgressSeqById` | `career.js:16,208-220` | Per target | ✔ / – / – | Efektif. |
| `gapSeq` | `career.js:18,120-141` | Global (state gap global) | ✔ / ✔ / ✔ | Efektif. Residual FE-06: request gap tertunda saat target terakhir dihapus meninggalkan error basi tak terlihat. |
| `timelineSeqBySkill` + `timelineSeq` | `skills.js:14,211-219` + `competencyProgressView.vue:28,143-157` | Per skill (store) + global (drawer) | ✔ / ✔ / ✔ | Dua lapis yang saling melengkapi. Efektif. |
| `sharingSeq` + tangkap `targetId` | `portfolio.js:14,77-104`; `remove()` menaikkan generasi | Generasi + identitas | ✔ / – / – | **Pola terkuat:** menolak commit bila generasi atau portofolio berubah. Menutup GET↔PATCH↔DELETE dan Settings↔Builder (FE-10 R3). |
| `generateSeq`/`saveSeq`/`deleteSeq` | `portfolioBuilderView.vue:61-63` | Per instance view | ✔ / ✔ / ✔ | Sebagian redundan dengan `isBusy`. Nilai nyatanya adalah **invalidasi silang**: save/delete menaikkan `generateSeq` sehingga draf AI terlambat tidak mengisi form yang sudah disimpan atau dihapus. |
| `isBusy` (mutex) | `portfolioBuilderView.vue:102-107` | Gabungan flag store (`saving`, `generating`) + flag view (`deleting`, `sharingSaving`, `sharingLoading`) | — | Efektif dalam builder. Karena `saving`/`generating` ada di store, mutex tetap benar setelah remount. |
| `analyzing[id]` | `projects.js:125` | Per proyek | — | Mencegah double-submit per tab. Lintas tab/klien bergantung pada 409 dari server lalu polling. |
| `reviewing[id]` | `skills.js:139,175` | Per assessment | — | Kunci per kartu, tanpa optimistic update (D-8). |
| `recLoading` + `{version, revision}` | `career.js:148-206` | Per target × `competencyVersion` × `targetRevision` | ✔ (commit hanya bila versi masih sama) | Dedupe in-flight dan invalidasi cache yang benar. Residual FE-07: tidak ada refetch otomatis setelah versi naik, dan view membaca entri cache tanpa memeriksa versi. |
| `searchSeq`, `detailSeq`, `requestSeq` | `SkillCatalogPicker.vue:34`, `skillProfileView.vue:36`, `course/projectRecommendationsView.vue` | Per instance | ✔ / ✔ / ✔ | Efektif. |

**Penilaian umum:** token yang dipasang **efektif untuk tujuannya**. Ini bukan klaim Council semata: Satpam membuktikan setiap token dengan reproduksi respons terbalik. Empat pola dipakai dengan tepat:

- latest-wins seq;
- generasi + identitas;
- dedupe in-flight berkunci versi;
- mutex per entitas.

### 4.2 Celah yang tersisa

| ID | Celah | Skenario konkret | Sev. |
|---|---|---|---|
| **A-3** | **Pengambil koleksi tanpa token:** `fetchUserSkills` (`skills.js:38`), `fetchPendingAssessments` (`:116`), `fetchProjects`, `fetchAnalyses`, `fetchTargets`, `fetchMine`. Masing-masing dipanggil dari banyak tempat. | Accept kartu A lalu kartu B dengan cepat. Masing-masing memicu `fetchUserSkills` (`:160`, `:188`). Bila respons pertama (snapshot sebelum B di-commit server) tiba terakhir, ia menimpa daftar dan **skill B hilang dari UI** walau `upsertUserSkill` sudah menambahkannya. Pulih pada fetch berikutnya. Pola serupa terjadi pada `fetchPendingAssessments` (selesai analisis + mount analyzer). | P2 |
| A-9 | Token per instance view mati bersama komponen. | Generate portofolio (sampai ±93 dtk), lalu user pindah halaman. Respons dikirim ke instance lama, dan **draf AI hilang** (biaya AI terbuang). Bandingkan dengan analisis, yang dimiliki store (D-7) dan bertahan lintas navigasi. | P3 |
| A-10 | Urutan ≠ kesegaran. | Token menjamin respons lama tidak menimpa yang baru, tetapi tidak menjamin snapshot mencerminkan perubahan kompetensi terbaru tanpa request baru (residual FE-07 dan FE-08). | P3 |
| A-11 | Flag loading tanpa token di beberapa view. | `competencyProgressView` `loadingTarget`/`loadingProgress` dapat padam lebih awal saat target diganti cepat. | P3 |
| A-12 | Tidak ada koordinasi lintas tab. | Diterima. Satu-satunya penjaga lintas klien adalah 409 analyze. Identitas hasil polling 409 ambigu bila beberapa klien berjalan bersamaan (residual FE-04). | Diterima |

### 4.3 Masalah struktural: token dipasang reaktif, bukan berdasarkan aturan

Ada **12+ implementasi ad-hoc**. Hampir semuanya ditambahkan **setelah** Satpam menemukan race: FE-04 sampai FE-10 masing-masing punya putaran R dengan temuan konkurensi. Penyebabnya rencana tidak memuat aturan konkurensi lintas-tiket.

Rekomendasi minimal, tanpa pustaka baru:

- **Aturan (masuk rencana dan template tiket):** setiap action store yang **mengganti seluruh koleksi atau snapshot** dan dipanggil dari lebih dari 1 tempat wajib menangkap `seq` per kunci resource dan hanya commit bila masih terbaru. Error dan `finally` mengikuti token yang sama.
- **Implementasi:** terapkan dulu pada `fetchUserSkills` dan `fetchPendingAssessments` (A-3). Ekstrak helper bersama hanya bila pola ketiga muncul. Alternatif setara: `AbortController` via opsi `signal` axios per kunci resource.
- **Bukti permanen:** semua reproduksi Satpam saat ini **efemeral** (data-URL di memori) dan tidak ada di repo. Regresi tidak akan terdeteksi oleh `npm test`. Lihat §5.3.

---

## 5. Kesehatan Sistem Pasca-Integrasi (Fokus 4)

### 5.1 Test & build

| Metrik | Nilai | Catatan |
|---|---|---|
| Unit test | 23/23 pass | Hanya modul murni: `apiError`, `guard`, `url`. **0 test store.** ±900 baris logika store dan semua race guard tidak terlindungi regresi. |
| Build | 1844 modul, 0 error | Satu chunk JS 338 kB. Ke-16 view diimpor eager di `router/index.js:5-20`, sehingga pengunjung `/p/:slug` mengunduh seluruh aplikasi. Lazy route `() => import(...)` adalah perbaikan murah (P3). |
| Endpoint terpakai | 39 operasi unik dari store | Rencana menyebut 40. Selisih 1 = `GET /career-targets/gap-analysis` (`fetchGapSummary`) yang diganti target progress di FE-08. Konsisten dengan catatan FE-08-QA. |
| Putaran revisi | 18 putaran untuk 10 tiket | FE-01 R1, FE-02 R1, FE-03 R2, FE-04 R3, FE-05 R2, FE-06 R1, FE-07 R1, FE-08 R1, FE-09 R3, FE-10 R3 |

### 5.2 Kesehatan proses (governance)

1. **Baseline tidak pernah dibuat** (prasyarat §5.0). Setiap QA menyatakan allowlist tidak dapat dibuktikan secara historis. Untuk 10 tiket, disiplin allowlist hanya klaim Tukang.
2. **Jejak audit di-ignore git** (`.gitignore:108-109`). Keputusan Council, vonis QA, dan tiket tidak memiliki riwayat versi.
3. **Satpam berulang kali melanggar batas tulisnya sendiri**: `npm run build` menulis `frontend/dist`, dan ini tercatat di FE-02 sampai FE-10. Solusi yang sudah dicoba dalam analisis ini: `npx vite build --outDir <tmp> --emptyOutDir` membuktikan kompilasi tanpa menyentuh repo. Masukkan ke `SATPAM-INSTRUCTIONS.md`.
4. **E2E tidak punya pemilik.** Rencana §6.3 menulis "manual atau via browser automation Satpam", sehingga tidak ada tiket yang mewajibkannya.

### 5.3 Testabilitas store: terbukti mungkin tanpa dependency baru

Probe §1 menunjukkan langkah-langkah berikut berjalan di Node v22.21.0:

- `node --test --experimental-test-module-mocks`;
- `mock.module('<file-url>/src/lib/api.js', { namedExports: { api, AI_TIMEOUT_MS } })`;
- impor `stores/portfolio.js` asli dan `pinia` (`setActivePinia(createPinia())`).

Dengan cara ini, reproduksi Satpam dapat menjadi suite permanen:

- sharing GET/PATCH/DELETE terbalik;
- invalidasi cache rekomendasi oleh `competencyVersion`/`targetRevision`;
- 409 → polling;
- normalizer DTO dengan fixture backend.

Perubahan yang diperlukan hanya script `test` menjadi `node --test --experimental-test-module-mocks`. Ini tetap selaras dengan D-13 (tanpa dependency baru). Flag ini masih eksperimental di Node 22, jadi kunci versi Node di dokumentasi.

---

## 6. Retrospektif Rencana (Kesalahan Arsitek)

| Keputusan rencana | Hasil di lapangan |
|---|---|
| D-1 sampai D-14 | Bertahan. Tidak ada yang dibatalkan. 120 dtk, `localhost`, field `error`, `/p/:slug`, D-11, dan 5 store terbukti tepat. |
| Bentuk DTO diambil dari `API_CONTRACT.md` tanpa verifikasi baris-per-baris terhadap kode | **Kesalahan utama.** Menghasilkan drift #1–#4, termasuk cacat P1 FE-09 dan batas 4000 yang salah di tiket. Pelajaran: Arsitek wajib memverifikasi bentuk respons per endpoint terhadap kode, atau mewajibkan penangkapan fixture nyata di FE-01. |
| Tidak ada aturan konkurensi lintas-tiket | Race ditemukan satu per satu oleh QA (§4.3) dan menambah sebagian besar dari 18 putaran revisi. |
| D-13 membatasi test ke modul murni | Terlalu sempit. Logika paling berisiko (store) tidak teruji permanen. `mock.module` sudah tersedia saat rencana ditulis. |
| §7 mengeluarkan refactor sidebar, tetapi §6.3 #4 mengharapkan pil di Dashboard | Kontradiksi internal yang menjadi A-1. |
| P-04 (bio wajib) vs tiket FE-02 (bio opsional) | Konflik yang diputus Council (opsional). Rencana perlu dikoreksi. |
| §6.3 E2E tanpa pemilik dan tanpa tiket | Tidak pernah dijalankan. |

---

## 7. Rekomendasi Pemeliharaan & Residual Risks (Fokus 5)

### 7.1 Backlog berprioritas

| ID | Item | Pemilik | Prioritas | Upaya | Alasan |
|---|---|---|---|---|---|
| GOV-01 | Commit `frontend/` sebagai baseline. Putuskan apakah `docs/tickets` dan `docs/ai/handoffs` di-track atau diarsipkan di tempat lain. | Owner | **P0** | Menit | Risiko kehilangan total. Prasyarat audit allowlist berikutnya. |
| QA-E2E-01 | Jalankan E2E §6.3 (13 langkah) di `http://localhost:5173` dengan `AI_PROVIDER=mock`. Tambahkan cek: A-1 (pil di Dashboard), A-2 (`/p/..%2F..%2Fauth%2Fme` tidak menghasilkan request ke `/api/auth/me`), request-count `/courses` ↔ `/recommendations`, dan respons GET `/portfolios` aktual. | Satpam (tiket baru) | **P0** | ½–1 hari | Satu-satunya cara membuktikan cookie, CORS, dan alur nyata. |
| FE-FIX-01 | A-2: `encodeURIComponent(slug)` di `fetchPublic` dan cek regex slug di view | Tukang | **P1** | 3 baris + 1 test | Tutup vektor CSPT sebelum ada GET berefek samping. |
| FE-FIX-02 | A-1: migrasikan `dashboard`, `myProject`, `myProfile`, `profile` ke `WorkspaceLayout`; hapus 4 sidebar duplikat | Tukang | **P1** | ±½ hari | Memenuhi AC FE-04 #2 dan menghapus drift navigasi. |
| DOC-01 | Selaraskan `API_CONTRACT.md` (§3.3 butir 1), ARCHITECTURE §8–9, dan rencana (P-04 bio, batas 2000/1000, `fetchGapSummary`) | Arsitek/Council | **P1** | ½ hari | Menghentikan penemuan ulang drift. |
| FE-TEST-01 | Suite store via `mock.module` (§5.3): sharing races, cache rekomendasi, 409 polling, normalizer DTO dengan fixture nyata | Tukang | **P1** | 1 hari | Mengubah bukti efemeral menjadi pengaman regresi. |
| FE-FIX-03 | A-3: token urutan untuk `fetchUserSkills` dan `fetchPendingAssessments` | Tukang | P2 | Kecil | Daftar skill/antrian tidak boleh mundur. |
| FE-REF-01 | A-6: pindahkan normalizer ke store. A-5: action `setSelectedTarget(id)`. A-7: hapus `isHttpUrl` lokal. A-8: hapus kode mati. | Tukang | P2 | Kecil | Kemurnian lapisan dan testabilitas. |
| FE-FIX-04 | A-4: `author.bio` (`= custom_bio \|\| user_bio`, `lib/portfolio.js:704`) dan `data.custom_bio` keduanya dirender (`publicPortfolioView.vue:102,109`). Render salah satu saja. | Tukang | P3 | 1 baris | Duplikasi teks di halaman publik. |
| FE-PERF-01 | Lazy-load route (`() => import()`) | Tukang | P3 | Kecil | Halaman publik tidak perlu mengunduh 338 kB. |
| SATPAM-PROC-01 | Build QA ke `--outDir` sementara | Council | P2 | Dokumen | Menghentikan pelanggaran batas tulis berulang. |

### 7.2 Evaluasi ulang BE-GAP

| ID | Status | Rekomendasi |
|---|---|---|
| BE-GAP-01 (field akademik) | Field dihapus dari UI (D-9) | Keputusan produk. Prioritas rendah. |
| BE-GAP-02 (`category`/`technologies` proyek) | Dihapus dari UI | Sedang. Akan memperkaya input analisis AI. Butuh migrasi dan rollback. |
| BE-GAP-03 (upload avatar) | Avatar via URL berfungsi | Rendah. Biaya keamanan upload file tinggi dibanding manfaatnya. |
| BE-GAP-04 (`analyses_count` di list) | N+1 terkonfirmasi (`myProjectView.vue:115-119`; 20 proyek = 21 request) | **Kerjakan.** Cukup satu subquery. Shortcut sudah tercatat di `projects.js:88`. |
| BE-GAP-05 (ganti password, hapus akun) | Settings minimal | **Sedang-tinggi** untuk pengguna nyata (keamanan akun, hak hapus data). |
| BE-GAP-06 (analisis async 202 + job) | Ditunda | Pemicu objektif: p95 latensi analyze provider nyata > 60 dtk di log. |
| **BE-GAP-07 (baru)** | — | Field `code` mesin pada error 409 (`PORTFOLIO_EXISTS`, `SLUG_TAKEN`) untuk mengganti pencocokan teks (§3.1 #8). |
| **BE-GAP-08 (baru)** | — | `published_at` nyata yang di-set saat publikasi, bukan `updated_at` (§3.1 #10). Butuh migrasi dan rollback. |

### 7.3 Register risiko residual

| Risiko | Kemungkinan | Dampak | Mitigasi | Pemilik |
|---|---|---|---|---|
| Cacat integrasi nyata (cookie, CORS, bentuk respons) karena tidak pernah ada E2E | Tinggi (≥1 cacat) | Sedang–tinggi | QA-E2E-01 | Satpam |
| Kehilangan kode atau jejak audit (untracked/ignored) | Rendah | **Kritis** | GOV-01 | Owner |
| Regresi race tanpa test permanen | Sedang | Sedang | FE-TEST-01 | Tukang |
| Drift kontrak berikutnya lolos diam-diam (toleransi ganda) | Sedang | Sedang | DOC-01 + fixture test + hapus fallback | Arsitek |
| Logout gagal meninggalkan cookie server (residual FE-01); berbahaya di komputer bersama | Rendah | Sedang | Tampilkan peringatan bila POST logout gagal | Council |
| Biaya AI: "Muat ulang AI" bisa diklik berulang secara berurutan (hanya dedupe paralel); CSPT A-2 | Sedang | Rendah–sedang | Cooldown UI + FE-FIX-01; backend sudah mengembalikan 429 | Tukang |
| Produksi: `SameSite=None; Secure`, HTTPS, `FRONTEND_URL` belum direncanakan | Pasti saat deploy | Tinggi | Rencana deploy terpisah (di luar lingkup) | Council |
| Dismiss profil hilang saat reload (D-14, diterima) | Pasti | Rendah | Diterima. Ditinjau ulang bila ada keluhan. | — |

---

## 8. Kesimpulan

Arsitektur tiga lapis, isolasi data, dan pertahanan XSS/open redirect diterapkan **konsisten dan murni**. Adaptasi DTO aman dan selalu mengikuti kode backend sebagai sumber kebenaran. Token urutan efektif untuk race yang ditargetkan.

Kelemahannya ada di **bukti dan proses**, bukan di struktur:

- tidak ada E2E;
- tidak ada baseline git;
- kontrak tidak diperbarui;
- bukti race tidak permanen;
- satu temuan keamanan kecil (A-2) dan satu AC yang gagal di Dashboard (A-1) lolos karena dua celah pertama.

Dengan GOV-01, QA-E2E-01, FE-FIX-01/02, DOC-01, dan FE-TEST-01, klaim "selesai 100%" dapat dinyatakan berbasis bukti.

---

## 9. Addendum Verifikasi FE-FIX-CONSOLIDATED (2026-11-14)

**Vonis Arsitek: A-1 s/d A-5 TERTUTUP secara arsitektural. Sign-off diberikan.**

- Verifikasi menemukan **satu regresi visual baru (R-1)** dan **satu residual lama (R-2)**. Keduanya P3 dan bukan blocker.
- Status sistem: **arsitektur lengkap, operasional belum terverifikasi**. Pernyataan "siap pakai" di FE-FIX-CONSOLIDATED-COUNCIL §2 belum berlaku sampai GOV-01 dan QA-E2E-01 selesai.

### 9.1 Bukti yang dijalankan Arsitek

| Pemeriksaan | Hasil |
|---|---|
| `npm test` | `tests 23 · suites 4 · pass 23 · fail 0` |
| `npx vite build --outDir <scratchpad>` | 1844 modul. `index-B1jVSMt4.js` 327.84 kB (gzip 105.98), CSS 108.10 kB. Hash **identik** dengan audit Satpam, jadi tree yang diaudit sama dengan tree sekarang. JS turun 10.6 kB setelah sidebar duplikat dihapus. |
| Grep di `src` | storage + `v-html` = 0; impor `lib/api` di view/komponen = 0; penulisan state store langsung dari view/komponen = **0** (sebelumnya 3) |
| Sisa sidebar di 4 view yang dimigrasi | `sidebar\|<aside\|topbar` = 0; impor tak terpakai = 0 |
| Probe slug (`encodeURIComponent` + regex) | `../../auth/me` gagal regex, jadi tidak ada request. Bila regex dilewati, path tetap `/api/public/portfolios/..%2F..%2Fauth%2Fme` (satu segmen). |
| Reproduksi store (`node:test` + `mock.module`, scratchpad) | 2 test, 2 pass. Hasilnya di §9.2 (A-3) dan §9.3 (R-2). |
| `git status -s` | Masih `?? frontend/`. GOV-01 belum dikerjakan. |

### 9.2 Status penutupan temuan

| ID | Perbaikan | Verifikasi Arsitek | Status |
|---|---|---|---|
| **A-1** | `dashboard`, `myProject`, `myProfile`, `profile` dibungkus `WorkspaceLayout`; sidebar lokal dihapus | **12/12 view terautentikasi** kini memakai layout bersama, jadi pil dan banner analisis AI dirender di semua halaman ber-sesi. Yang tidak memakainya hanya landing, login, register, dan `/p/:slug` (disengaja). Bukti statis; belum diamati di browser. | **TERTUTUP** (lihat R-1) |
| **A-2** | Regex slug di `publicPortfolioView.vue:63-70` sebelum request; `encodeURIComponent` di `portfolio.js:108` | Vektor CSPT tertutup. Catatan: `encodeURIComponent` tidak meng-encode `.`, sehingga slug `..` saja akan resolve ke `/api/public/`. **Regex di view adalah kontrol utama**; encode di store hanya lapisan kedua. Pemanggil `fetchPublic` di masa depan harus memvalidasi slug juga. | **TERTUTUP** |
| **A-3** | `userSkillsSeq` dan `pendingAssessmentsSeq`, guard dipasang setelah seluruh loop paginasi | Reproduksi: dua fetch serentak dengan respons lama tiba terakhir. Hasilnya daftar `[1,9]` tetap utuh. | **TERTUTUP** (lihat R-2) |
| **A-4** | `displayBio = custom_bio \|\| author.bio`, satu titik render di `:120` | Semantiknya sama dengan `author.bio` backend (`custom_bio \|\| user_bio`), jadi tidak ada informasi yang hilang. Sisa: CSS `.author-bio` (`:277`) kini mati. | **TERTUTUP** |
| **A-5** | Action `setSelectedTargetId(id)` (`career.js:58-60`), dipakai di 3 view | Penulisan langsung = 0. `id ? Number(id) : null` memperlakukan `0` sebagai null; aman karena ID AUTO_INCREMENT ≥ 1. | **TERTUTUP** |

### 9.3 Temuan baru dari verifikasi

| ID | Temuan | Asal | Perbaikan | Sev. |
|---|---|---|---|---|
| **R-1** | `active="my-profile"` di `myProfileView.vue:37` dan `profileView.vue:115` tidak cocok dengan key nav `'profile'` (`WorkspaceLayout.vue:24`). Akibatnya **tidak ada item nav yang aktif** di `/my-profile` dan `/complete-profile`, sementara 10 view lain cocok. | **Tiket** (§1 butir 2 menetapkan `my-profile`). Tukang mengikuti apa adanya; Satpam memeriksa keberadaan prop, bukan kecocokan key. | Ganti ke `active="profile"` di 2 view | P3 (regresi visual) |
| **R-2** | Mutasi lokal `addSkill`/`updateSkill`/`removeSkill` tidak menaikkan `userSkillsSeq`, sehingga `fetchUserSkills` yang sedang berjalan tetap boleh commit. Reproduksi: `removeSkill(5)` selama fetch berjalan, lalu fetch basi tiba, hasilnya `[1,5]` (skill yang dihapus muncul lagi). | Pra-ada (bukan regresi). Kelas yang sama dengan A-3 tetapi jalurnya berbeda. Skenario serupa di antrian review pulih sendiri lewat 400 → refetch. | `userSkillsSeq += 1` di awal ketiga mutasi | P3 |
| R-3 | Slug berhuruf besar kini ditolak di klien. Sebelumnya collation MySQL case-insensitive (`backend/lib/portfolio.js:594`) mungkin tetap mencocokkannya. | Efek samping A-2 | Diterima: builder selalu menghasilkan slug huruf kecil. Opsional: `toLowerCase()` sebelum regex. | Info |

### 9.4 Catatan proses

- Bukti allowlist Satpam berbasis **mtime file**. Ini bukti lemah: tidak menunjukkan isi perubahan dan mtime dapat berubah karena alat lain. Bukti yang andal baru mungkin setelah GOV-01.
- Satpam kembali menjalankan `npm run build` ke `frontend/dist`. SATPAM-PROC-01 belum diadopsi.
- Kesalahan key di R-1 lahir dari tiket. Untuk tiket berikutnya, kriteria penerimaan yang menyebut identifier harus dicek ke sumbernya (di sini key nav di `WorkspaceLayout`).

### 9.5 Status arsitektural final

| Dimensi | Status |
|---|---|
| Lapisan View → Store → `api.js` | **Murni.** 0 impor `api.js` dari view; 0 mutasi state langsung dari view. |
| Layout | Seragam. 12/12 view terautentikasi memakai `WorkspaceLayout`; satu sumber navigasi. |
| Keamanan klien | `v-html` 0, storage 0, `safeRedirect`, `isHttpUrl` + `rel`, CSPT tertutup. |
| Konkurensi | Koleksi skill dan antrian review kini dijaga token. Masih tanpa token: `fetchProjects`, `fetchAnalyses`, `fetchTargets`, `fetchMine` (risiko rendah, §4.2) dan R-2. |
| Test | 23/23, tetap **0 test store**. FE-TEST-01 terbuka; polanya sudah terbukti dua kali di scratchpad. |
| Governance | **GOV-01 terbuka (P0).** Frontend dan jejak audit belum ada di git. |
| Integrasi nyata | **QA-E2E-01 terbuka (P0).** Belum ada pengamatan browser. |

**Backlog yang tersisa**, mengacu ke §7.1. Daftar ini menggantikan butir FE-FIX-01/02 yang kini selesai.

- **P0:** GOV-01, QA-E2E-01.
- **P1:** DOC-01, FE-TEST-01.
- **P2:**
  - FE-REF-01 (A-6 normalizer DTO ke store, A-7 duplikasi `isHttpUrl`, A-8 kode mati termasuk CSS `.author-bio`);
  - SATPAM-PROC-01.
- **P3:** R-1, R-2, FE-PERF-01, A-9 s/d A-11.
- **Backend:** BE-GAP-04, BE-GAP-05, BE-GAP-07, BE-GAP-08.

**Sign-off Arsitek:** FE-FIX-CONSOLIDATED **diterima**. Inisiatif integrasi frontend dinyatakan **lengkap secara arsitektural**. Klaim siap produksi menunggu GOV-01 dan QA-E2E-01.
