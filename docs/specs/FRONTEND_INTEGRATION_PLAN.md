# Technical Specification — Frontend–Backend Integration Plan (SkillProof)

- **Status:** READY_FOR_COUNCIL
- **Author:** Arsitek (Claude Code / Claude Opus 5.5)
- **Reviewer:** Council
- **Tanggal:** 2026-11-13
- **Sumber acuan:** `docs/api/API_CONTRACT.md` (sumber kebenaran kontrak), `docs/product/PRD.md`, `docs/architecture/ARCHITECTURE.md`, `docs/ai/AI_SAFETY_AND_GUARDRAILS.md`, `docs/ai/PROMPT_SPECIFICATIONS.md`, `frontend/src/**`, `backend/middleware.js`, `backend/lib/**` (diverifikasi langsung dari kode)

---

## 0. Ringkasan untuk Council (BLUF)

1. **Kondisi saat ini:** Ke-15 view Vue berjalan sepenuhnya dengan data dummy: array hardcoded, simulasi `setTimeout`, dan `localStorage` dengan kunci `skillproof_*`. Belum ada instance Axios, Pinia store, maupun navigation guard. Backend sudah lengkap: route handler terverifikasi mengekspor semua method di kontrak, termasuk `DELETE`.
2. **Arsitektur:** `View → Pinia store action → src/lib/api.js (Axios, withCredentials) → Next.js /api`. View **tidak pernah** mengimpor `api.js` (aturan ini bisa diperiksa dengan grep). Ada 5 store: `auth`, `projects`, `skills`, `career`, `portfolio`. **`profileStore` sengaja tidak dibuat** (lihat D-3).
3. **Temuan kritis yang mengubah desain:**
   - Satu panggilan AI bisa memakan **~93 detik** (3 percobaan × 30 dtk + backoff, `backend/lib/ai/provider.js:6-7`). Timeout Axios 15 dtk di ARCHITECTURE §9.1 akan memutus setiap analisis nyata. **Endpoint AI wajib memakai timeout 120 dtk.**
   - Cookie `auth_token` memakai `SameSite=lax`. Frontend **wajib dibuka di `http://localhost:5173`**, bukan `127.0.0.1:5173`. Kalau tidak, cookie tidak terkirim ke `localhost:3000` dan semua request akan 401.
   - Middleware CSRF/CORS mengembalikan error dengan field `error`, bukan `message` (`backend/middleware.js:45,73,86`). Normalizer error frontend harus membaca keduanya.
   - Banyak field UI **tidak punya padanan di backend**: universitas, prodi, angkatan, foto base64, kategori dan teknologi proyek, rating kursus, notifikasi, ganti password. Keputusan: field ini dihapus dari UI, bukan disimpan di `localStorage` (D-9). Daftarnya ada di §5.5 (BE-GAP) untuk diputuskan Council.
   - **Belum ada route halaman portofolio publik.** Rencana ini menambah halaman ke-16, `/p/:slug` → `publicPortfolioView.vue`.
4. **Jumlah endpoint:** Kontrak memuat **47 baris**, bukan 35. Frontend memakai **40**; 7 sisanya sengaja tidak dipakai (alasannya di §3.6).
5. **Roadmap:** 4 fase berisi 10 tiket (FE-01 s/d FE-10), masing-masing dengan allowlist file, acceptance criteria, dan perintah verifikasi. Tiket berjalan berurutan; hanya FE-02 ∥ FE-03 yang aman diparalelkan.
6. **Risiko tata kelola:** `frontend/` masih **untracked** di git (`?? frontend/`). Satpam tidak punya baseline untuk `git diff` per tiket. **Rekomendasi: Owner meng-commit baseline frontend sebelum FE-01 dimulai.**

---

## 1. Problem Statement

### 1.1 Inventaris kondisi view (diverifikasi dari kode)

| # | View (file) | Route | Sumber data saat ini | Target integrasi |
|---|---|---|---|---|
| 1 | `landingView.vue` | `/` | Statis | Tetap statis (tanpa API) |
| 2 | `loginView.vue` | `/login` | `localStorage.skillproof_logged_in`, nama default "Ruby" | `POST /api/auth/login` |
| 3 | `registerView.vue` | `/register` | `localStorage` nama/email | `POST /api/auth/register` |
| 4 | `profileView.vue` | `/complete-profile` | `localStorage.skillproof_profile` + foto base64 via canvas | `PUT /api/profile` |
| 5 | `dashboardView.vue` | `/dashboard` | Array statis `stats/skills/projects` | 4 endpoint agregat |
| 6 | `myProfileView.vue` | `/my-profile` | `localStorage.skillproof_profile` | `authStore.user` |
| 7 | `myProjectView.vue` | `/projects` | `defaultProjects` + `localStorage.skillproof_projects` | CRUD `/api/projects` |
| 8 | `aiSkillAnalyzerView.vue` | `/ai-skill-analyzer` | `setTimeout(900ms)` merangkai skill dari nama teknologi | `POST /api/projects/:id/analyze` + review |
| 9 | `skillProfileView.vue` | `/skill-profile` | Array skill statis, minat dari `localStorage` | `/api/user-skills`, `/api/skills`, assessments |
| 10 | `skillGapAnalysisView.vue` | `/skill-gap-analysis` | `roles` + `roleData` hardcoded | `/api/career-targets/*` + gap-analysis |
| 11 | `courseRecommendationsView.vue` | `/courses` | 6 kursus statis (rating/match fiktif) | `GET /api/career-targets/:id/recommendations` |
| 12 | `projectRecommendationsView.vue` | `/recommendations` | Proyek statis | sama dengan #11 (cache bersama) |
| 13 | `competencyProgressView.vue` | `/competency` | Angka fiktif ("72%", "+14%") | `/api/competency-progress/*` |
| 14 | `portfolioBuilderView.vue` | `/portfolio` | Proyek/skill statis, bio di `localStorage` | `/api/portfolios/*` |
| 15 | `settingsView.vue` | `/settings` | `localStorage` notif/privasi/track | `PUT /api/profile`, logout, sharing |
| 16 | *(belum ada)* | `/p/:slug` | — | `GET /api/public/portfolios/:slug` |

Logout saat ini hanya `localStorage.removeItem('skillproof_logged_in')`, terduplikasi di `WorkspaceLayout.vue`, `dashboardView.vue`, `myProfileView.vue`, `myProjectView.vue`, dan `profileView.vue` (sidebar masing-masing).

### 1.2 Drift dokumentasi (aturan sumber kebenaran)

| Dokumen | Isi yang usang | Sikap |
|---|---|---|
| `ARCHITECTURE.md` §8 | Daftar endpoint lama (`/api/skills/profile`, `/api/portfolio/me`, `POST /api/skill-gaps/analyze`, …) | **Diabaikan.** Pakai `API_CONTRACT.md`. |
| `ARCHITECTURE.md` §8.1–8.2 | Envelope `{success, data}` / `{success:false, error:{code}}` | **Salah.** Envelope aktual: `{status:"success", data}` / `{status:"error", message, errors[]}`. |
| `ARCHITECTURE.md` §9.1 | `timeout: 15000` global | Tidak cukup untuk endpoint AI (D-7). |
| Brief Council | "35 endpoint" | Kontrak memuat 47 baris (§3.6). |
| `API_CONTRACT.md` #46/#47 | `public_url` berisi path API (`/api/public/portfolios/<slug>`) | Frontend menyusun URL halaman sendiri: `/p/<slug>` (D-12). |
| `API_CONTRACT.md` #39 | Tidak menyebut HTTP 422 | Backend mengembalikan **422** bila user belum punya proyek atau skill aktif (`lib/ai/portfolio-builder.js:61,103`). Frontend wajib menanganinya. |

---

## 2. Solution Overview & Architecture Diagram

```text
┌────────────────────────── Browser: http://localhost:5173 ──────────────────────────┐
│                                                                                    │
│  Vue Router (beforeEach → resolveNavigation)                                        │
│        │                                                                           │
│  Views (*.vue) ── baca state / panggil action ──►  Pinia stores                     │
│  Components                                       auth · projects · skills ·       │
│  (WorkspaceLayout, AssessmentReviewCard,          career · portfolio               │
│   SkillCatalogPicker)                                   │                          │
│                                                         ▼                          │
│                                          src/lib/api.js (Axios instance)            │
│                                          baseURL  = VITE_API_BASE_URL               │
│                                          withCredentials = true                     │
│                                          timeout 15 dtk (AI: 120 dtk per-request)   │
│                                          interceptor → normalizeApiError + 401      │
└───────────────────────────────────────────────┬────────────────────────────────────┘
                                                │ JSON / REST + Cookie auth_token (HttpOnly)
                                                ▼
                    Next.js 16 Route Handlers  http://localhost:3000/api/*
                    middleware.js: CORS allowlist + CSRF Origin check
                    ├── MySQL (mysql2 pool)
                    └── AI Provider (Gemini / OpenAI-compatible / Mock), 30 dtk × 3 percobaan
```

Prinsip yang berlaku:
- **Satu jalur:** setiap HTTP call lewat store action. Store action adalah lapisan service (D-2).
- **Backend adalah sumber kebenaran:** tidak ada data domain di `localStorage`/`sessionStorage`.
- **AI = rekomendasi:** semua output AI ditampilkan sebagai kandidat dan menunggu keputusan manusia (`needs_review` → `active`/`rejected`).

---

## 3. Component & Service Design

### 3.1 Struktur file baru dan file yang diubah

```text
frontend/
├── .env.example                      (BARU) VITE_API_BASE_URL=http://localhost:3000/api
├── package.json                      (UBAH) scripts.test = "node --test"
├── tests/
│   ├── guard.test.mjs                (BARU) node:test, modul murni
│   └── apiError.test.mjs             (BARU) node:test, modul murni
└── src/
    ├── main.js                       (UBAH) daftarkan unauthorized handler
    ├── lib/
    │   ├── api.js                    (BARU) instance Axios + interceptor
    │   ├── apiError.js               (BARU) normalizeApiError, murni (tanpa import.meta / .vue)
    │   └── url.js                    (BARU) isHttpUrl, murni
    ├── router/
    │   ├── index.js                  (UBAH) meta, guard, route /p/:slug, catch-all
    │   └── guard.js                  (BARU) resolveNavigation + safeRedirect, murni
    ├── stores/
    │   ├── auth.js                   (BARU) useAuthStore
    │   ├── projects.js               (BARU) useProjectStore
    │   ├── skills.js                 (BARU) useSkillStore
    │   ├── career.js                 (BARU) useCareerStore
    │   └── portfolio.js              (BARU) usePortfolioStore
    ├── components/
    │   ├── WorkspaceLayout.vue       (UBAH) nama user, logout, indikator AI global
    │   ├── AssessmentReviewCard.vue  (BARU) kartu accept/reject, dipakai 2 view
    │   └── SkillCatalogPicker.vue    (BARU) pencarian katalog /api/skills, dipakai 2 view
    └── views/
        └── publicPortfolioView.vue   (BARU) halaman ke-16, mengikuti konvensi camelCase view
```

Tidak ada dependency baru. `axios`, `pinia`, dan `vue-router` sudah ada di `frontend/package.json`. Node 22.21.0 sudah tersedia, jadi test runner memakai `node --test` bawaan.

### 3.2 API Client (`src/lib/api.js`)

```js
import axios from 'axios'
import { normalizeApiError } from './apiError.js'

// Backend: 30 dtk × (1 + MAX_RETRIES 2) + backoff ≈ 93 dtk (backend/lib/ai/provider.js:6-7)
export const AI_TIMEOUT_MS = 120000

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) { onUnauthorized = fn }

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  withCredentials: true,           // wajib: cookie HttpOnly auth_token
  timeout: 15000,
  headers: { Accept: 'application/json' },
  // Jangan set Content-Type global: GET tetap "simple request" (tanpa preflight); Axios menyetel JSON untuk body object.
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.skipAuthRedirect) onUnauthorized()
    return Promise.reject(normalizeApiError(err))
  },
)
```

**`skipAuthRedirect: true`** wajib dipasang pada `GET /auth/me` (bootstrap sesi, 401 di sini normal untuk tamu) dan `POST /auth/login` (401 berarti kredensial salah, bukan sesi habis).

**`src/lib/apiError.js`**: fungsi murni. Hasilnya `Error` dengan properti `status`, `message`, `errors`:

| Kondisi | `status` | `message` |
|---|---|---|
| Tidak ada `err.response`, `code` = `ECONNABORTED`/`ETIMEDOUT` | `0` | "Server tidak merespons dalam batas waktu. Coba lagi." |
| Tidak ada `err.response` (lainnya) | `0` | "Tidak dapat terhubung ke server. Pastikan backend berjalan di localhost:3000." |
| Ada response, body object | `res.status` | `body.message` → `body.error` (format middleware) → fallback per status |
| Ada response, body bukan object (HTML/string) | `res.status` | fallback per status |
| `errors` | — | `Array.isArray(body.errors) ? body.errors : []` |

Fallback per status: `401` "Sesi berakhir, silakan login kembali." · `403` "Permintaan ditolak oleh kebijakan keamanan (CORS/CSRF)." · `404` "Data tidak ditemukan." · `409` "Terjadi konflik data." · `422` "Data belum memenuhi syarat." · `429` "Kuota layanan AI tercapai. Coba lagi beberapa saat." · `502` "Respons AI tidak valid. Coba lagi." · `503` "Layanan sedang tidak tersedia." · `504` "Layanan AI melebihi batas waktu. Coba lagi." · default "Terjadi kesalahan pada server."

**Unauthorized handler** (dipasang di `main.js` setelah `app.use(router)`):

```js
setUnauthorizedHandler(() => {
  const r = router.currentRoute.value
  if (r.meta.requiresAuth) window.location.assign(`/login?redirect=${encodeURIComponent(r.fullPath)}`)
})
```

Ini navigasi keras (*hard navigation*), bukan `router.push`. Alasannya di D-5.

**Envelope respons:** store membaca `res.data.data` (umum), `res.data.user` (auth), `res.data.pagination` (list berpaginasi), dan `res.data.has_portfolio` (GET `/portfolios`). Tidak ada unwrap global karena field sibling seperti `pagination` dan `has_portfolio` akan hilang.

### 3.3 Pinia Stores

Semua store memakai **setup store** (`defineStore('x', () => {...})`). Data dibaca ulang saat view di-mount. **Satu-satunya cache** adalah rekomendasi AI (D-4).

#### 3.3.1 `useAuthStore` (`stores/auth.js`)

| State/Getter | Keterangan |
|---|---|
| `user` | `null` \| `{id, name, email, bio, avatar_url, created_at, updated_at}`. Satu-satunya pemilik data profil. |
| `isAuthenticated` | `!!user` |
| `profileIncomplete` | `!!user && !user.bio` |
| `profilePromptDismissed` | `false` (memori saja; di-set `true` saat simpan atau lewati di Complete Profile) |

| Action | Endpoint | Catatan |
|---|---|---|
| `ensureSession()` | `GET /auth/me` (`skipAuthRedirect`) | Promise di-memoize sekali per page load. 200 → `user = res.data.user`; error apa pun → `user = null`. |
| `login(email, password)` | `POST /auth/login` (`skipAuthRedirect`) | `user = res.data.user` |
| `register(name, email, password)` | `POST /auth/register` | `user = res.data.user` (201, cookie langsung terpasang) |
| `updateProfile({name, bio?, avatar_url?})` | `PUT /profile` | `user = {...user, ...res.data.data}`. Field yang tidak dikirim tidak dikosongkan oleh backend. |
| `logout()` | `POST /auth/logout` | Di `finally`: `window.location.assign('/login')`, meskipun request gagal. |

#### 3.3.2 `useProjectStore` (`stores/projects.js`)

| State | Keterangan |
|---|---|
| `projects` | Array dari `GET /projects` (tanpa evidences) |
| `analysesByProject` | `{ [projectId]: Analysis[] }` |
| `analyzing` | `{ [projectId]: startedAtMs }`, in-flight milik store, aman saat pindah halaman |
| `lastAnalysis` | `{ [projectId]: AnalysisDetail }` |
| `analysisError` | `{ [projectId]: ApiError }` |
| `notice` | `null` \| `{ projectId, title, kind: 'done'|'error', message }`, untuk banner global |
| getter `analyzingCount` | `Object.keys(analyzing).length` |

| Action | Method & Endpoint | Request | Response yang dipakai |
|---|---|---|---|
| `fetchProjects()` | `GET /projects` | — | `data[]`: id, title, description, repository_url, live_url, start_date, end_date, created_at |
| `fetchProject(id)` | `GET /projects/:id` | — | `data` + `evidences[]` |
| `createProject(p)` | `POST /projects` | `{title, description, repository_url, live_url, start_date, end_date, evidences[]}` | `data` (201) |
| `updateProject(id, p)` | `PUT /projects/:id` | Field sama. **`evidences` selalu dikirim lengkap** (semantik replace). | `data` |
| `deleteProject(id)` | `DELETE /projects/:id` | — | message. Lalu `useSkillStore().bumpCompetency()` (assessment terkait bisa ikut ter-cascade). |
| `fetchAnalyses(id)` | `GET /projects/:id/analyses` | — | `data[]`: id, summary, status, total_skills, created_at |
| `fetchAnalysis(id, aid)` | `GET /projects/:id/analyses/:aid` | — | `data`: summary, feedback, skills[] (skill_name, category, proficiency_level, score, reasoning). **`raw_response` tidak pernah dirender.** |
| `analyzeProject(id)` | `POST /projects/:id/analyze` | `{}`, `timeout: AI_TIMEOUT_MS` | `data` (201). Detail alurnya di §3.5.1. |
| `dismissNotice()` | — | — | — |

#### 3.3.3 `useSkillStore` (`stores/skills.js`)

| State | Keterangan |
|---|---|
| `userSkills` | Array dari `GET /user-skills` |
| `pendingAssessments`, `pendingTotal` | Antrian review (status `pending`) |
| `reviewing` | `{ [assessmentId]: true }`, status pending per baris |
| `progress` | Data `GET /competency-progress` |
| `competencyVersion` | Integer, naik setiap kali data kompetensi berubah. Dipakai sebagai kunci invalidasi cache rekomendasi (D-4). |

| Action | Method & Endpoint | Request | Response yang dipakai |
|---|---|---|---|
| `fetchUserSkills({status='active'})` | `GET /user-skills?status=&limit=100` | query | `data[]`, `pagination.total` |
| `fetchUserSkill(id)` | `GET /user-skills/:id` | — | `data` + `assessments[]` (source_type, review_status, project_title, notes, created_at) |
| `addSkill(b)` | `POST /user-skills` | `{skill_id, proficiency_level, score, notes?}` | `data` (201) → bump |
| `updateSkill(id, b)` | `PATCH /user-skills/:id` | `{proficiency_level?, score?, notes?}` (minimal satu) | `data` → bump |
| `removeSkill(id)` | `DELETE /user-skills/:id` | — | soft delete ke `rejected` → bump |
| `searchCatalog(q, category?)` | `GET /skills?search=&category=&limit=20` | query | `data[]`: id, name, category (publik, tanpa cache) |
| `fetchPendingAssessments()` | `GET /user-skills/assessments?status=pending&limit=100` | query | `data[]` (skill_name, skill_category, proficiency_level, score, ai_reasoning, project_id, project_title, user_skill_status, current_active_level/score), `pagination.total` → `pendingTotal` |
| `acceptAssessment(id, body={})` | `POST /user-skills/assessments/:id/accept` | `{}` (pakai nilai AI) atau `{proficiency_level, score, notes?}` | `data` → hapus dari `pendingAssessments`, `pendingTotal--`, bump |
| `rejectAssessment(id, notes?)` | `POST /user-skills/assessments/:id/reject` | `{notes?}` | `data` → hapus dari antrian, bump |
| `fetchProgress()` | `GET /competency-progress` | — | `data.summary`, `data.active_skills[]`, `data.recent_accepted_assessments[]` |
| `fetchSkillTimeline(skillId)` | `GET /competency-progress/skills/:id` | — | `data.skill`, `current_state`, `assessment_statistics`, `assessment_history[]` |
| `bumpCompetency()` | — | — | `competencyVersion++` |

Bila accept/reject menghasilkan **400** ("sudah ditinjau"), store memanggil `fetchPendingAssessments()` ulang (kemungkinan sudah ditinjau dari tab lain), lalu melempar error ke kartu.

#### 3.3.4 `useCareerStore` (`stores/career.js`)

| State | Keterangan |
|---|---|
| `targets` | Array dari `GET /career-targets` (sudah berisi `target_skills[]`, sehingga `GET /:id` tidak diperlukan) |
| `selectedTargetId` | Target aktif yang dipakai bersama oleh Gap, Courses, Project Recs, Competency, dan Portfolio. Default: target pertama. |
| `recommendations` | `{ [targetId]: { version, data } }`, cache rekomendasi AI |
| `recLoading` | `{ [targetId]: Promise }`, dedupe request in-flight |

| Action | Method & Endpoint | Request | Response yang dipakai |
|---|---|---|---|
| `fetchTargets()` | `GET /career-targets` | — | `data[]`. Bila `selectedTargetId` tidak ada di list, pilih `data[0]?.id ?? null`. |
| `createTarget(b)` | `POST /career-targets` | `{title, description?, target_skills:[{skill_id, expected_proficiency_level?, expected_score?}]}` | `data` (201) → select target baru |
| `updateTarget(id, b)` | `PUT /career-targets/:id` | Field sama. **`target_skills` dikirim lengkap** (semantik replace). | `data` → hapus `recommendations[id]` |
| `deleteTarget(id)` | `DELETE /career-targets/:id` | — | hapus dari list dan cache, pilih ulang default |
| `fetchGap(id)` | `GET /career-targets/:id/gap-analysis` | — | `data.career_target`, `data.summary`, `data.skills[]` |
| `fetchGapSummary()` | `GET /career-targets/gap-analysis` | — | `data[]` (summary per target), untuk Dashboard |
| `fetchRecommendations(id, {force})` | `GET /career-targets/:id/recommendations` | `timeout: AI_TIMEOUT_MS` | `data` (lihat §3.5.3) |
| `fetchTargetProgress(id)` | `GET /competency-progress/career-targets/:id` | — | `data.readiness_percentage`, `projected_readiness_percentage`, `has_requirements`, `skills_progress[]` |

```js
async function fetchRecommendations(id, { force = false } = {}) {
  const v = useSkillStore().competencyVersion
  const hit = recommendations.value[id]
  if (!force && hit && hit.version === v) return hit.data
  recLoading.value[id] ??= api.get(`/career-targets/${id}/recommendations`, { timeout: AI_TIMEOUT_MS })
    .then((res) => (recommendations.value[id] = { version: v, data: res.data.data }).data)
    .finally(() => { delete recLoading.value[id] })
  return recLoading.value[id]
}
```

#### 3.3.5 `usePortfolioStore` (`stores/portfolio.js`)

| State | Keterangan |
|---|---|
| `portfolio`, `hasPortfolio`, `loaded` | Dari `GET /portfolios` (maksimal 1 per user) |
| `generating` | boolean |
| `sharing` | Data `GET /portfolios/:id/sharing` |

| Action | Method & Endpoint | Request | Response yang dipakai |
|---|---|---|---|
| `fetchMine()` | `GET /portfolios` | — | `data` (null bila belum ada), `has_portfolio` |
| `generateDraft(careerTargetId)` | `POST /portfolios/generate` | `{career_target_id: id \| null}`, `timeout: AI_TIMEOUT_MS` | `data` (title, summary, custom_bio, suggested_slug, selected_projects[], selected_skills[]). **Draf tidak disimpan ke state persisten.** |
| `save(b)` | `hasPortfolio ? PUT /portfolios/:id : POST /portfolios` | `{title, slug, summary, custom_bio, career_target_id, projects:[{project_id, custom_description, display_order}], skills:[{skill_id, display_order}]}`. **`is_published` tidak dikirim** (D-11). | `data` → `portfolio`, `hasPortfolio = true` |
| `remove()` | `DELETE /portfolios/:id` | — | reset state |
| `fetchSharing()` | `GET /portfolios/:id/sharing` | — | `data` |
| `updateSharing(patch)` | `PATCH /portfolios/:id/sharing` | Minimal satu field dari `{is_published, slug, public_email, github_url, linkedin_url, website_url}` | `data` → `sharing`; sinkronkan `portfolio.slug` dan `portfolio.is_published` |
| `fetchPublic(slug)` | `GET /public/portfolios/:slug` | — | Dikembalikan langsung (tanpa state, tanpa sesi) |

#### 3.3.6 Matriks sinkronisasi dan invalidasi

| Mutasi | Efek di store | View yang terdampak |
|---|---|---|
| Accept/Reject assessment | Hapus dari `pendingAssessments`, bump `competencyVersion` | Analyzer, Skill Profile (langsung). Gap, Competency, Dashboard, Portfolio, Recs (refetch saat mount / cache basi). |
| Add/Patch/Delete user-skill | Update `userSkills`, bump | sama |
| Analyze sukses | `lastAnalysis`, refetch `analyses` dan `pendingAssessments`, bump, `notice` | Analyzer, banner global, Skill Profile |
| Delete project | Hapus dari `projects`, bump | Projects, Recs |
| Create/Update/Delete target | Update `targets`, hapus `recommendations[id]` | Gap, Recs, Competency, Portfolio |
| Save portfolio / PATCH sharing | Ganti `portfolio` / `sharing` | Portfolio Builder, Settings |

### 3.4 Router & Navigation Guards

**Tabel route.** Semua route lama dipertahankan, ditambah `meta` dan dua route baru.

| Path | Name | View | `meta` | Tiket |
|---|---|---|---|---|
| `/` | Landing | landingView | publik (tanpa meta) | — |
| `/login` | Login | loginView | `{ guestOnly: true }` | FE-01 |
| `/register` | Register | registerView | `{ guestOnly: true }` | FE-01 |
| `/complete-profile` | CompleteProfile | profileView | `{ requiresAuth: true }` | FE-01 |
| `/my-profile`, `/projects`, `/dashboard`, `/ai-skill-analyzer` (alias `/ai-analyzer`), `/skill-profile`, `/skill-gap-analysis` (alias `/skill-gap`), `/courses`, `/recommendations`, `/competency`, `/portfolio`, `/settings` | (tetap) | (tetap) | `{ requiresAuth: true }` | FE-01 |
| `/p/:slug` | PublicPortfolio | publicPortfolioView (BARU) | publik | FE-10 |
| `/:pathMatch(.*)*` | — | `redirect: '/'` | — | FE-01 |

**`src/router/guard.js`** (murni, diuji dengan `node --test`):

```js
export function safeRedirect(target, fallback = '/dashboard') {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
    ? target : fallback
}

export function resolveNavigation(to, s) {
  if (to.meta?.requiresAuth && !s.isAuthenticated) return { name: 'Login', query: { redirect: to.fullPath } }
  if (to.meta?.guestOnly && s.isAuthenticated) return safeRedirect(to.query?.redirect)
  if (to.meta?.requiresAuth && s.profileIncomplete && !s.profilePromptDismissed && to.name !== 'CompleteProfile')
    return { name: 'CompleteProfile' }
  return true
}
```

**`src/router/index.js`.** Guard berbasis nilai kembali (vue-router 5, tanpa `next`):

```js
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth || to.meta.guestOnly) await auth.ensureSession()   // D-6
  return resolveNavigation(to, {
    isAuthenticated: auth.isAuthenticated,
    profileIncomplete: auth.profileIncomplete,
    profilePromptDismissed: auth.profilePromptDismissed,
  })
})
```

Urutan di `main.js` (`app.use(createPinia())` sebelum `app.use(router)`) sudah benar, jadi `useAuthStore()` bisa dipanggil di dalam guard.

**Aturan alur:**
- Tamu → route terlindungi → `/login?redirect=<fullPath>` → login sukses → `router.replace(safeRedirect(route.query.redirect))`.
- User login → `/login` atau `/register` → `/dashboard` (atau `redirect` yang aman).
- Register sukses → `router.replace({ name: 'CompleteProfile' })`.
- Profil belum lengkap (`bio` kosong) → semua route terlindungi diarahkan ke CompleteProfile, **kecuali** user sudah menyimpan atau menekan "Lewati" pada sesi ini (D-14).

### 3.5 Alur Khusus

#### 3.5.1 Analisis AI asinkron (`POST /api/projects/:id/analyze`)

Backend memproses analisis **secara sinkron** (1 request, hingga ~93 dtk, transaksi atomik). Sifat non-blocking dicapai di frontend: request dimiliki **store**, bukan komponen. Promise tetap berjalan saat user berpindah halaman SPA.

```text
          klik Analyze (pre-check: description terisi & ≤ 4000 karakter)
                │
   idle ───────►│ running   analyzing[id] = Date.now()   (tombol disabled, timer elapsed)
                │
     ┌──────────┼───────────────────────────┬────────────────────────────────────┐
     │ 201      │ 409 "sedang berjalan"     │ 400/404/429/502/503/504/0          │
     ▼          ▼                           ▼                                    │
 succeeded   polling: GET /analyses         failed: analysisError[id] = e        │
 lastAnalysis   tiap 5 dtk, maks 24×        notice = {kind:'error'}              │
 + refetch      (≤ 120 dtk) sampai id max   tombol retry (kecuali 400/503)       │
 pending        > id max saat 409           ◄────────────────────────────────────┘
 + bump         ├─ ada id baru → fetchAnalysis → succeeded
 + notice       └─ habis → failed("Analisis masih diproses. Muat ulang riwayat beberapa saat lagi.")
```

Kerangka action:

```js
async function analyzeProject(id) {
  if (analyzing.value[id]) return                       // cegah double submit
  analyzing.value[id] = Date.now()
  delete analysisError.value[id]
  try {
    try {
      const res = await api.post(`/projects/${id}/analyze`, {}, { timeout: AI_TIMEOUT_MS })
      lastAnalysis.value[id] = res.data.data
    } catch (e) {
      if (e.status !== 409) throw e
      lastAnalysis.value[id] = await pollNewAnalysis(id)  // id max sebelum = Math.max(0, ...fetchAnalyses(id).map(a => a.id))
    }
    const skills = useSkillStore()
    skills.bumpCompetency()
    await Promise.allSettled([fetchAnalyses(id), skills.fetchPendingAssessments()])
    notice.value = { projectId: id, title: titleOf(id), kind: 'done' }
  } catch (e) {
    analysisError.value[id] = e
    notice.value = { projectId: id, title: titleOf(id), kind: 'error', message: e.message }
  } finally {
    delete analyzing.value[id]
  }
}
```

**UX loading (jujur, tanpa progress bar palsu):**
- Penghitung detik berjalan, ditambah pesan bertahap menurut waktu: 0–5 dtk "Mengirim proyek ke AI…" · 5–20 dtk "Mengekstrak kandidat skill dari deskripsi & bukti…" · >20 dtk "Provider AI lambat; sistem mencoba ulang otomatis (maks. ~90 detik)…".
- Teks bantu: "Anda boleh berpindah halaman. Analisis tetap berjalan."
- `WorkspaceLayout` menampilkan pil global **"AI menganalisis N proyek…"** selama `analyzingCount > 0`, serta banner dari `notice` ("Analisis '<judul>' selesai — Tinjau hasil →" `/ai-skill-analyzer?project=<id>`). Banner bisa ditutup.
- Batasan: reload penuh browser menghapus state in-flight. Request di server tetap selesai. Saat kembali, riwayat (`GET /analyses`) dan antrian pending menampilkan hasilnya. Bila user menekan Analyze lagi saat server masih memproses, server merespons 409 dan alur masuk ke cabang polling.

**Matriks error endpoint AI** (berlaku juga untuk recommendations dan portfolio generate):

| Status | Arti | UX |
|---|---|---|
| 400 | Deskripsi kosong / URL bukti invalid (analyze); target tanpa kriteria (recs) | Pesan server + CTA "Edit proyek" / "Tambah kebutuhan skill". Tanpa tombol retry. |
| 404 | Tidak ditemukan / bukan milik user | Pesan + tautan kembali |
| 409 | Analisis sedang berjalan | Masuk mode polling |
| 422 | Generate portofolio: belum ada proyek / skill aktif | Pesan server + CTA ke `/projects` atau `/skill-profile` |
| 429 | Rate limit provider | Pesan + retry |
| 502 | Output AI gagal divalidasi | Pesan + retry |
| 503 | `AI_API_KEY` belum dipasang / DB putus | Pesan server, tanpa retry otomatis |
| 504 | Provider timeout | Pesan + retry |
| 0 | Timeout klien 120 dtk / jaringan | Pesan + "Muat ulang riwayat" (hasil mungkin sudah tersimpan) |

#### 3.5.2 Human-in-the-loop review dan sinkronisasi

- **Sumber antrian tunggal:** `skillStore.pendingAssessments` (`GET /user-skills/assessments?status=pending`).
  - **Analyzer** menampilkan antrian yang difilter `project_id === selectedProjectId`.
  - **Skill Profile** menampilkan seluruh antrian.
  - Keduanya memakai `AssessmentReviewCard.vue`. Dengan begitu, hasil POST analyze (201) maupun hasil polling ditinjau lewat jalur yang sama.
- **Isi `AssessmentReviewCard`** (prop: `assessment`):
  - `skill_name`, `skill_category`, `project_title`, `ai_reasoning`, serta level dan skor usulan AI (semua dirender sebagai teks).
  - Bila `current_active_level != null`, tampilkan "Skill ini sudah aktif (level X, skor Y). Menerima akan menggantinya dengan nilai di bawah."
  - Kontrol koreksi: select level (`beginner|intermediate|advanced`), input skor 0–100, catatan opsional.
  - **Terima** → `acceptAssessment(id, changed ? {proficiency_level, score, notes} : {})`.
  - **Tolak** → `rejectAssessment(id, notes)`.
  - Kartu dikunci saat `reviewing[id]`. **Tidak ada optimistic update** (D-8).
  - Disclaimer: "Hasil AI adalah rekomendasi, bukan sertifikasi kompetensi."
- **Efek ke kompetensi** (backend, transaksional):
  - Accept → `user_skills.status = active` dengan level/skor yang disetujui.
  - Reject → `rejected` hanya bila tidak ada assessment `accepted` atau `pending` lain (Rule 7). Bila ada, skill tetap aktif.
- **Efek di frontend:**
  - Kartu hilang dari antrian dan `competencyVersion` naik.
  - Halaman Gap, Competency, Dashboard, dan Portfolio refetch saat mount.
  - Cache rekomendasi menjadi basi otomatis, sehingga kunjungan berikutnya memanggil AI ulang karena gap berubah.
- **Gap analysis** menampilkan bucket `pending_review` sebagai "Menunggu tinjauan Anda" dengan tautan ke `/skill-profile` (bagian antrian). Bucket ini **tidak** dihitung sebagai kompetensi.

#### 3.5.3 Rekomendasi kursus & proyek (AI, read-only)

- Frontend memakai **endpoint gabungan #33 saja**. Satu panggilan AI menghasilkan `courses` dan `projects` (`lib/ai/recommender.js:489-490`, satu `provider.analyzeProject`). Halaman `/courses` dan `/recommendations` membaca cache yang sama, jadi berpindah antar keduanya tidak memanggil AI lagi (D-10).
- Fetch otomatis saat mount bila cache kosong atau basi. Tombol "Muat ulang rekomendasi (AI)" memaksa fetch (`force`) dan disabled selama loading.
- `data.status === 'goal_reached'` → state "Selamat, seluruh kriteria terpenuhi" dengan CTA ke `/competency` dan `/portfolio`.
- 400 "Target karier belum memiliki kriteria kompetensi." → empty state dengan CTA ke `/skill-gap-analysis`.
- Tanpa target sama sekali (`targets.length === 0`) → empty state "Buat target karier dulu". Tidak ada request.

#### 3.5.4 Portofolio: generate → simpan → publikasi → slug publik

1. **Generate (opsional, stateless):** `POST /portfolios/generate` mengisi form (title, summary, custom_bio, slug = `suggested_slug` bila slug masih kosong, projects, skills). Banner "Draf AI — tinjau sebelum menyimpan." **Tidak ada penulisan DB** sampai user menekan Simpan.
2. **Simpan:** `POST` (pertama kali) atau `PUT` (berikutnya). Backend mempertahankan `is_published` bila field ini tidak dikirim pada update (`backend/lib/validation.js:866-870`). Menyimpan konten tidak pernah mengubah status publikasi.
3. **Publikasi:** hanya lewat panel Sharing (`PATCH /portfolios/:id/sharing {is_published}`). Pesan sebelum publish: "Hanya skill berstatus aktif yang tampil di halaman publik."
4. **URL publik:** `${window.location.origin}/p/${slug}`, dengan tombol salin (`navigator.clipboard.writeText`). Field `public_url` dari backend **tidak dipakai** karena berisi path API (D-12).
5. **Halaman publik `/p/:slug`:**
   - Tanpa sesi dan tanpa `WorkspaceLayout`. Memanggil `portfolioStore.fetchPublic(slug)`.
   - 404 menampilkan **satu pesan yang sama** untuk slug yang tidak ada maupun portofolio privat: "Portofolio tidak ditemukan atau belum dipublikasikan." Ini meniru *probing resistance* backend.
   - `document.title` diisi judul portofolio.
6. **Validasi slug di klien** (pre-check saja; server tetap otoritatif): pola `^[a-z0-9]+(?:-[a-z0-9]+)*$`, panjang 3–60. Reserved word dan keunikan diputuskan server (400/409).

### 3.6 Pemetaan Halaman → Endpoint

Konvensi tiap halaman: **Mount** = request saat halaman dibuka · **Aksi** = request dari interaksi · **Hapus** = elemen dummy yang harus dibuang.

**P-01 Landing (`/`)**: publik, tanpa API, tidak diubah.

**P-02 Login (`/login`)**: FE-01
- Aksi: `authStore.login` → `POST /auth/login {email, password}` → 200 `user`.
- Sukses → `router.replace(safeRedirect(route.query.redirect))`.
- 401 → pesan server ditampilkan inline di bawah form (`role="alert"`), tanpa redirect.
- Hapus: `localStorage skillproof_logged_in/skillproof_name`, `alert('Login successful…')`.

**P-03 Register (`/register`)**: FE-01
- Aksi: `authStore.register` → `POST /auth/register {name, email, password}` → 201 `user`.
- Validasi klien: name 2–100, password 8–100, konfirmasi cocok.
- 409 → "Email sudah terdaftar." · 400 → tampilkan `errors[]`.
- Sukses → `/complete-profile`.
- Hapus: `localStorage` nama/email/logged_in.

**P-04 Complete Profile (`/complete-profile`, `profileView.vue`)**: FE-02
- Mount: prefill dari `authStore.user` (tanpa request).
- Field:

  | UI lama | Backend | Aturan |
  |---|---|---|
  | `fullName` | `name` | wajib, 2–100 |
  | `aboutMe` | `bio` | **wajib di form ini**, ≤ 1000 |
  | `profilePhoto` (upload base64) | `avatar_url` | **Diganti input URL** http/https ≤ 255, opsional; pratinjau `<img>` dari URL, fallback inisial |
  | `university`, `studyProgram`, `academicYear` | — | **Dihapus** (BE-GAP-01) |
  | `careerInterest` | — | **Dihapus.** Minat dikelola sebagai Target Karier di Skill Gap (FR-02 terpenuhi lewat `/skill-gap-analysis`). |

- Aksi Simpan: `authStore.updateProfile({name, bio, avatar_url})` → `PUT /profile`. Lalu `profilePromptDismissed = true`, dan ke `/my-profile` bila `returnTo=my-profile`, selain itu ke `/dashboard`. 400 → `errors[]`.
- Aksi Lewati (tombol Cancel lama): `profilePromptDismissed = true` → `/dashboard` (atau kembali ke `/my-profile`).
- Hapus: kode FileReader/canvas, semua `localStorage`.

**P-05 Dashboard (`/dashboard`)**: FE-08 (FE-01 hanya mengubah nama & logout)
- Mount (`Promise.allSettled`, tiap widget gagal secara independen):

  | Widget | Sumber | Field |
  |---|---|---|
  | Total Projects | `projectStore.fetchProjects()` | `projects.length`; 3 terbaru menurut `created_at` |
  | Active Skills | `skillStore.fetchProgress()` | `summary.total_active_skills`, `summary.average_score` (null → "—") |
  | Menunggu Review | `skillStore.fetchPendingAssessments()` | `pendingTotal` + CTA "Tinjau sekarang" → `/skill-profile` |
  | Kesiapan Karier | `careerStore.fetchGapSummary()` | `readiness_percentage` target terpilih (atau target pertama); tanpa target → CTA buat target |
  | Grafik skill | `progress.active_skills` | Top 5 menurut `score` |

- Hapus: array `stats/skills/projects` statis, `alert` untuk `/portfolio`, catatan "+1 From last week".

**P-06 My Profile (`/my-profile`)**: FE-02
- Mount: tanpa request; tampilkan `authStore.user` (name, email, bio, avatar_url, created_at).
- Aksi: "Edit profil" → `/complete-profile?returnTo=my-profile`; "Kelola target karier" → `/skill-gap-analysis`.
- Hapus: tampilan university/studyProgram/academicYear/careerInterest, `localStorage`.

**P-07 My Projects (`/projects`)**: FE-03
- Mount:
  - `fetchProjects()`, lalu `Promise.allSettled(projects.map(p => fetchAnalyses(p.id)))` untuk badge status ("Dianalisis n×" / "Belum dianalisis").
  - Shortcut N+1 ini dicatat dengan komentar `shortcut:`; upgrade lewat BE-GAP-04.
- Bila `route.query.draftTitle` ada → buka modal Tambah dengan prefill `title` dan `description` (dari P-12), lalu bersihkan query.
- Form Tambah/Edit:

  | UI lama | Backend | Aturan |
  |---|---|---|
  | `name` | `title` | wajib, 1–200 |
  | `description` | `description` | ≤ 4000 (batas analisis), penghitung karakter. Teks bantu: "Jelaskan peran, kontribusi, dan teknologi yang Anda gunakan — AI menilai dari deskripsi ini." |
  | `link` | `repository_url` | URL http/https ≤ 255, opsional |
  | — (baru) | `live_url`, `start_date`, `end_date` | URL; `<input type="date">` (`YYYY-MM-DD`); end ≥ start |
  | — (baru) | `evidences[]` | Editor baris, maks. 10: `title` ≤ 150, `evidence_type` ∈ {repository, demo, document, certificate, other}, `url` ≤ 500 |
  | `category`, `technologies`, `image`, `status` | — | **Dihapus** (BE-GAP-02). Status dihitung dari analyses. |

- Aksi:
  - Tambah → `createProject`.
  - Edit → `fetchProject(id)` (memuat evidences), lalu `updateProject(id, payload lengkap termasuk evidences)`.
  - Hapus → konfirmasi → `deleteProject`.
  - Analyze → `router.push({ name: 'AiSkillAnalyzer', query: { project: id } })`.
- Filter: pencarian teks di sisi klien (title + description) dan filter status analisis. Filter kategori dihapus.
- Hapus: `defaultProjects`, semua `localStorage`.

**P-08 AI Skill Analyzer (`/ai-skill-analyzer`)**: FE-04
- Mount:
  - `fetchProjects()` bila kosong. Pilih proyek dari `?project=` atau proyek pertama.
  - `fetchAnalyses(pid)`. Bila ada riwayat dan `lastAnalysis[pid]` kosong → `fetchAnalysis(pid, idTerbaru)`.
  - `skillStore.fetchPendingAssessments()`.
- Tampilan:
  1. Pemilih proyek dan status.
  2. Tombol Analyze + UX running (§3.5.1).
  3. Panel hasil: `summary`, `feedback`, `skills[]` (nama, kategori, level, skor, `reasoning`, `evidence`), `uncataloged_skills` sebagai info "tidak ada di katalog, tidak disimpan".
  4. **Antrian review proyek ini** (`AssessmentReviewCard`).
  5. Riwayat analisis (tanggal, `total_skills`, klik → `fetchAnalysis`).
- Pre-check klien: deskripsi kosong atau > 4000 karakter → tombol disabled dengan tautan "Lengkapi deskripsi" → `/projects`.
- Hapus: `setTimeout`, perakitan skill dari nama teknologi, `localStorage skillproof_projects/analysis_results`.

**P-09 Skill Profile (`/skill-profile`)**: FE-05
- Mount: `fetchUserSkills({status:'active'})` dan `fetchPendingAssessments()`.
- Tampilan:
  - Kartu skill aktif dikelompokkan per `category` (level badge, bar `score`; null → "—").
  - Bagian **"Menunggu tinjauan"** (`id="review"`), berisi seluruh antrian.
  - Kartu tautan "Minat pengembangan → Target Karier" ke `/skill-gap-analysis`.
- Aksi:
  - Tambah skill: `SkillCatalogPicker` (`GET /skills?search=`, debounce 300 ms) → level + skor + catatan → `addSkill`. 409 → "Skill sudah aktif — gunakan koreksi."
  - Koreksi: `updateSkill` (PATCH).
  - Nonaktifkan: konfirmasi → `removeSkill` (DELETE soft).
  - Detail: `fetchUserSkill(id)` → drawer riwayat assessment (source_type, project_title, review_status, notes, tanggal).
- Hapus: array skill statis, minat `localStorage skillproof_interests`.

**P-10 Skill Gap Analysis (`/skill-gap-analysis`)**: FE-06
- Mount: `fetchTargets()`, lalu `fetchGap(selectedTargetId)` bila ada. Ganti target → `fetchGap`.
- Tampilan bucket (istilah PRD):

  | `gap_status` | Label UI |
  |---|---|
  | `fulfilled` | Didukung bukti |
  | `under-qualified` | Bukti terbatas |
  | `missing` | Belum ada bukti |
  | `pending_review` | Menunggu tinjauan Anda (→ `/skill-profile#review`) |

  - Tiap skill: `target_requirement` vs `user_competency`, ditambah `notes` dari server.
  - Ringkasan: `readiness_percentage` ("Kesiapan terverifikasi") dan `projected_readiness_percentage` ("Estimasi — bukan bukti terverifikasi").
  - Disclaimer: "Belum ada bukti tidak berarti Anda tidak memiliki skill tersebut."
- Panel keputusan (alur PRD):
  - `under_qualified_count + missing_count > 0` → CTA "Rekomendasi proyek" (`/recommendations`) dan "Rekomendasi kursus" (`/courses`).
  - Selain itu → "Perbarui progres" (`/competency`) dan "Bangun portofolio" (`/portfolio`).
- Kelola target (modal):
  - Field: `title` 2–150, `description` ≤ 2000.
  - Baris `target_skills`: `SkillCatalogPicker` (exclude `skill_id` yang sudah dipilih), `expected_proficiency_level` (default intermediate), `expected_score` 0–100 atau kosong (→ `null`).
  - Aksi: `createTarget` / `updateTarget` (array lengkap) / `deleteTarget` (konfirmasi). 409 → "Judul target sudah dipakai."
- `summary.has_requirements === false` → empty state "Tambahkan kebutuhan skill".
- Hapus: `roles`, `roleData`, tombol analisis simulasi, `analysisCount`, `localStorage skillproof_career_goal`.

**P-11 Course Recommendations (`/courses`)**: FE-07
- Mount: `fetchTargets()` bila kosong, lalu `fetchRecommendations(selectedTargetId)`.
- Tampilan:
  - Pemilih target.
  - Chip `gap_skills` (skill_name + `gap_status`).
  - Kartu kursus: `title`, `platform`, `skill_name`, `level`, `description`, `estimated_duration`, tombol "Buka" (`url` hanya bila `isHttpUrl`, `target="_blank" rel="noopener noreferrer"`).
  - Filter klien: `skill_name`, `level`, teks.
  - Catatan kaki: "Dihasilkan AI dari skill gap Anda; platform dibatasi pada allowlist resmi."
- Hapus: rating, reviews, match %, hours, kategori, bookmark `skillproof_saved_courses`, `enroll()` + `alert`.

**P-12 Project Recommendations (`/recommendations`)**: FE-07
- Mount: sama dengan P-11 (cache yang sama).
- Kartu: `title`, `description`, `difficulty_level`, `target_skills[]`, `key_features[]`, `suggested_evidences[]`, `expected_outcome`.
- Aksi "Kerjakan proyek ini" → `router.push({ name: 'MyProjects', query: { draftTitle: p.title, draftDescription: p.description } })`. Ini menutup loop PRD: rekomendasi → kerjakan → tambah proyek → analisis ulang.
- Hapus: proyek statis, `localStorage skillproof_selected_projects`.

**P-13 Competency Progress (`/competency`)**: FE-08
- Mount: `skillStore.fetchProgress()`, `careerStore.fetchTargets()`, lalu `fetchTargetProgress(selectedTargetId)`.
- Tampilan:
  - Kartu statistik: `total_active_skills`, `average_score`, `skills_with_score_count`, `total_accepted_assessments`, bar `level_distribution`.
  - Matriks `active_skills`, filter level.
  - Linimasa `recent_accepted_assessments` (proyek → tautan `/projects`).
  - Panel progres target (`readiness_percentage`, `skills_progress[]` dengan `is_fulfilled`).
- Aksi: klik skill → `fetchSkillTimeline(skill_id)` → drawer `assessment_history` + `assessment_statistics`.
- Hapus: "72%", "+14%", "Cognitive Domain", "Supporting Projects" statis, linimasa fiktif.

**P-14 Portfolio Builder (`/portfolio`)**: FE-09 (+ panel sharing FE-10)
- Mount: `Promise.all([portfolio.fetchMine(), projects.fetchProjects(), skills.fetchUserSkills({status:'active'}), career.fetchTargets()])`. Bila `hasPortfolio` → isi form dari `portfolio`.
- Langkah:
  1. Pilih proyek (dari `projectStore`) + `custom_description` per proyek; `display_order` = urutan pilihan.
  2. Pilih skill **aktif saja** (level/skor tampil).
  3. Tentang: `title` 3–200, `summary` ≤ 4000, `custom_bio` ≤ 4000, `career_target_id` (opsional), `slug` (§3.5.4).
  4. Pratinjau, lalu Simpan.
- Aksi:
  - "Generate dengan AI" → `generateDraft(career_target_id ?? null)`.
  - Simpan → `save` (409 → "Slug sudah dipakai" / "Anda sudah memiliki portofolio" → `fetchMine()`).
  - Hapus portofolio → konfirmasi → `remove`.
- Panel Sharing (FE-10):
  - `fetchSharing()`; toggle `is_published`; field slug, `public_email`, `github_url`, `linkedin_url`, `website_url` → `updateSharing`.
  - URL publik + tombol salin + tautan "Lihat" (`/p/:slug`, tab baru).
- Hapus: proyek/kompetensi statis, `localStorage skillproof_portfolio_*`, "Interactive Web & PDF", field `interests`/`education` (BE-GAP-01), "Recruiter Telemetry" fiktif.

**P-15 Settings (`/settings`)**: FE-02 (+ toggle visibilitas FE-10)
- Bagian **Akun**: `name` → `authStore.updateProfile({ name })`; `email` read-only (tidak bisa diubah per kontrak #25).
- Bagian **Sesi**: Logout → `authStore.logout()`.
- Bagian **Visibilitas portofolio** (FE-10): bila `fetchMine()` → `hasPortfolio`, toggle `updateSharing({ is_published })`; bila tidak, tautan ke `/portfolio`.
- Hapus: ganti password, notifikasi, privasi discovery/telemetry, `track`, danger zone (BE-GAP-05), semua `localStorage`.

**P-16 Public Portfolio (`/p/:slug`, BARU)**: FE-10
- Mount: `portfolioStore.fetchPublic(route.params.slug)`.
- Tampilan:
  - `author` (name, avatar_url, bio), `title`, `summary`, `custom_bio`.
  - `contact`: tampilkan hanya field non-null, tautan hanya bila `isHttpUrl`, `mailto:` untuk `public_email`.
  - `career_target`.
  - `projects[]` (+ evidences, tanggal, repo/live).
  - `skills[]` (level, skor, `verified_at`).
  - `published_at`.
- 404 → pesan generik tunggal; 500/0 → "Gagal memuat portofolio, coba lagi."

**Cakupan endpoint (47 baris kontrak):**

| # | Endpoint | Konsumen (store.action, tiket) |
|---|---|---|
| 1–4 | auth register/login/logout/me | `auth.*` FE-01 |
| 5–9 | projects list/create/get/put/delete | `projects.*` FE-03 |
| 10 | POST analyze | `projects.analyzeProject` FE-04 |
| 11–12 | GET analyses, analyses/:aid | `projects.fetchAnalyses/fetchAnalysis` FE-03/FE-04 |
| 13 | GET /skills | `skills.searchCatalog` FE-05 |
| 14–18 | user-skills list/post/get/patch/delete | `skills.*` FE-05 |
| 19 | GET assessments | `skills.fetchPendingAssessments` FE-04 |
| 20 | GET assessments/:id | **Tidak dipakai.** List #19 sudah memuat semua field yang dibutuhkan kartu. |
| 21–22 | accept / reject | `skills.accept/rejectAssessment` FE-04 |
| 23 | GET /health | **Tidak dipakai UI** (diagnostik dev/Satpam) |
| 24 | GET /profile | **Tidak dipakai.** Data identik dengan `/auth/me` (D-3). |
| 25 | PUT /profile | `auth.updateProfile` FE-02 |
| 26–27, 29–30 | career-targets list/post/put/delete | `career.*` FE-06 |
| 28 | GET career-targets/:id | **Tidak dipakai.** List #26 sudah memuat `target_skills`. |
| 31 | gap-analysis per target | `career.fetchGap` FE-06 |
| 32 | gap-analysis semua target | `career.fetchGapSummary` FE-08 |
| 33 | recommendations gabungan | `career.fetchRecommendations` FE-07 |
| 34–35 | recommendations/courses, /projects | **Tidak dipakai.** Satu panggilan #33 lebih hemat kuota AI (D-10). |
| 36–37 | competency-progress, skills/:id | `skills.fetchProgress/fetchSkillTimeline` FE-08 |
| 38 | competency-progress/career-targets/:id | `career.fetchTargetProgress` FE-08 |
| 39 | portfolios/generate | `portfolio.generateDraft` FE-09 |
| 40–41, 43–44 | portfolios get/post/put/delete | `portfolio.*` FE-09 |
| 42 | GET portfolios/:id | **Tidak dipakai.** `GET /portfolios` sudah mengembalikan portofolio lengkap. |
| 45 | public/portfolios/:slug | `portfolio.fetchPublic` FE-10 |
| 46–47 | sharing get/patch | `portfolio.fetchSharing/updateSharing` FE-10 |

Total dipakai: **40**. Tidak dipakai: **7** (#20, #23, #24, #28, #34, #35, #42). Alias backend yang tidak dipakai: `PATCH /portfolios/:id` (= PUT) dan `PUT /portfolios/:id/sharing` (= PATCH).

### 3.7 Standar state UI & penanganan error

- Setiap view data punya 4 state eksplisit: **loading** (spinner/skeleton), **empty** (pesan + CTA langkah berikutnya), **error** (pesan `ApiError.message` + tombol "Coba lagi"), **success**.
- Mutasi: tombol disabled dengan label progres ("Menyimpan…") selama request. Error tampil inline di dekat form (`<p class="form-error" role="alert">`), ditambah `errors[]` sebagai list bila ada.
- Error API baru **tidak** memakai `alert()`. Validasi klien lama yang memakai `alert()` boleh tetap ada (tanpa refactor tambahan di luar lingkup).
- 403 (CORS/CSRF) **tidak** memicu redirect login. Tampilkan pesannya; biasanya penyebabnya origin salah (§3.8).

### 3.8 Aturan keamanan frontend

1. Token tidak pernah disimpan atau dibaca oleh JS. Autentikasi murni lewat cookie HttpOnly. Tidak ada akses ke `document.cookie`.
2. **Tidak ada `v-html`** di seluruh `frontend/src`. Semua teks dari user dan AI (description, summary, feedback, reasoning, notes, bio) dirender sebagai interpolasi teks.
3. URL eksternal (evidence, repository_url, live_url, url kursus AI, kontak publik) hanya dirender sebagai `<a>` bila `isHttpUrl(u)` (`/^https?:\/\//i`). Selalu pakai `target="_blank" rel="noopener noreferrer"`. Ini lapisan pertahanan tambahan meskipun backend sudah memvalidasi.
4. `redirect` setelah login hanya lewat `safeRedirect`, untuk mencegah open redirect (`//evil.com`, `https://…`).
5. `raw_response` dari endpoint analisis tidak pernah dirender.
6. **Origin harus konsisten:** buka aplikasi di `http://localhost:5173`. Cookie `SameSite=lax` tidak dikirim pada XHR dari `127.0.0.1:5173` ke `localhost:3000` karena dianggap cross-site. Bila memakai `127.0.0.1`, set `VITE_API_BASE_URL=http://127.0.0.1:3000/api` agar host-nya sama.
7. Production (`SameSite=None; Secure`) membutuhkan HTTPS di kedua sisi dan `FRONTEND_URL` yang tepat. Ini di luar lingkup rencana (§7).

---

## 4. Architectural & Implementation Decisions

| ID | Keputusan | Alternatif yang ditolak | Alasan / trade-off |
|---|---|---|---|
| D-1 | `API_CONTRACT.md` + kode backend adalah sumber kebenaran. ARCHITECTURE §8/§9 diabaikan untuk endpoint, envelope, dan timeout. | Mengikuti ARCHITECTURE | §8 usang (§1.2). Kontrak sudah diverifikasi terhadap export route handler. |
| D-2 | Lapisan: View → store action → `api.js`. **Tanpa folder `services/`.** View/komponen tidak mengimpor `api.js`. | `services/*.js` berisi ~40 wrapper satu baris | Wrapper satu baris menambah hop tanpa perilaku. Store action sudah menjadi lapisan service dan bisa diaudit dengan grep. |
| D-3 | 5 store: `auth`, `projects`, `skills`, `career`, `portfolio`. **`profileStore` tidak dibuat**; profil dimiliki `authStore.user`. **`careerStore` ditambahkan.** | `profileStore` terpisah seperti brief | `/auth/me` dan `/profile` mengembalikan baris `users` yang sama. Dua store berarti dua salinan yang harus disinkronkan. Target karier terpilih dan cache rekomendasi dipakai 5 view, jadi butuh store sendiri. |
| D-4 | Data read-only di-refetch saat mount (tanpa TTL/persist). **Satu-satunya cache: rekomendasi AI**, dikunci `skillStore.competencyVersion`. | Cache semua data / TTL | Data kecil per user; refetch selalu benar. Rekomendasi mahal (AI ~detik–menit + kuota). Version counter memisahkan skills dari career tanpa event bus. |
| D-5 | Logout dan 401 memakai **navigasi keras** (`window.location.assign`). | `router.push` + `$reset` tiap store | Reload menjamin tidak ada state user sebelumnya yang tertinggal di store mana pun, tanpa kode reset per store. Biaya: satu reload pada kejadian yang jarang. |
| D-6 | Bootstrap sesi = satu `GET /auth/me` (di-memoize), hanya untuk route `requiresAuth`/`guestOnly`. | Panggil `/auth/me` di `main.js` untuk semua route | Pengunjung portofolio publik (perekrut) tidak memicu request auth. |
| D-7 | Analisis AI = request sinkron panjang yang dimiliki store, timeout per-request 120 dtk, indikator global, 409 → polling riwayat. **Tanpa job queue backend.** | Backend 202 + job + polling | Backend sudah atomik dan sinkron; mengubahnya di luar lingkup integrasi. Bila latensi nyata rutin > 60 dtk → BE-GAP-06. |
| D-8 | Review accept/reject **tanpa optimistic update**; kunci per baris. | Optimistic + rollback | Server bisa menolak (400 sudah ditinjau). Latensi rendah (tanpa AI). Rollback menambah kode tanpa manfaat berarti. |
| D-9 | Field UI tanpa padanan backend **dihapus**, tidak dipindah ke `localStorage`. | Pertahankan di `localStorage` | Dua sumber kebenaran, data hilang antar perangkat, dan menyesatkan user. Daftar dicatat sebagai BE-GAP untuk Council. |
| D-10 | Rekomendasi hanya lewat endpoint gabungan #33. | #34 dan #35 terpisah per halaman | Satu panggilan AI melayani dua halaman lewat cache. Endpoint terpisah menggandakan biaya. |
| D-11 | Publikasi **hanya** lewat `PATCH …/sharing`. Body simpan portofolio tidak mengirim `is_published`. | Toggle publish di form utama | Satu jalur kendali privasi. Terverifikasi: update tanpa `is_published` mempertahankan nilai lama (`lib/validation.js:866-870`). |
| D-12 | URL publik disusun frontend: `/p/:slug`. | Pakai `sharing.public_url` | `public_url` berisi path API JSON, bukan halaman. |
| D-13 | Test frontend: `node --test` pada modul murni (`guard.js`, `apiError.js`). **Tanpa dependency baru.** | Vitest / Playwright | Node 22 punya runner bawaan dan auto-discovery `*.test.mjs`. Modul dijaga bebas dari `import.meta.env` dan `.vue` agar bisa diimpor Node. |
| D-14 | Redirect profil = *soft*: `bio` kosong → CompleteProfile, kecuali sudah simpan/lewati pada sesi ini (state memori). | Guard keras / flag permanen | Backend tidak punya konsep "profil lengkap". Guard keras bisa menjebak user. Prompt per sesi cukup sebagai dorongan. |

**ADR terpisah:** tidak dibuat. Semua keputusan di atas bisa dibalik per tiket. Bila Council ingin membekukan D-2/D-3/D-5 sebagai standar lintas fitur, Arsitek dapat memindahkannya ke `docs/adr/0001-frontend-state-and-api-layer.md`.

---

## 5. Phased Implementation Breakdown (Paket Tiket untuk Tukang)

### 5.0 Prasyarat (Owner/Council, sebelum FE-01)

1. **Commit baseline `frontend/`.** Saat ini `?? frontend/` (untracked). Tanpa baseline, Satpam tidak bisa mengaudit diff per tiket. Ini harus dilakukan Owner; agen dilarang commit.
2. Backend lokal siap: `.env` terisi, `npm run db:migrate && npm run db:seed`, `npm run dev` (port 3000), `AI_PROVIDER=mock` untuk QA tanpa biaya.
3. `cd frontend && npm install` (sekali).

**Aturan umum semua tiket FE:**
- Hanya file di allowlist yang boleh diubah. Mengimpor modul lain yang sudah ada diperbolehkan.
- Tidak ada dependency baru.
- Tidak ada perubahan styling atau refactor di luar elemen yang dihapus/diganti oleh tiket.
- Tidak ada perubahan di `backend/`.

### 5.1 Graf dependensi

```text
FE-01 ──► FE-02
  └─────► FE-03 ──► FE-04 ──► FE-05 ──► FE-06 ──► FE-07
                                          └─────► FE-08
          FE-03 + FE-05 + FE-06 ──► FE-09 ──► FE-10
Paralel aman: FE-02 ∥ FE-03 (allowlist terpisah). Pasangan lain berbagi file store/view → sekuensial.
```

### 5.2 Phase 1 — Foundation, Auth & Profile

**FE-01 — Client layer, session & auth**
- **Objective:** API client, normalizer error, guard, `authStore`, login/register nyata, logout nyata di semua sidebar.
- **Allowlist:**
  - `frontend/src/lib/api.js` (BARU), `frontend/src/lib/apiError.js` (BARU)
  - `frontend/src/router/guard.js` (BARU), `frontend/src/router/index.js`
  - `frontend/src/stores/auth.js` (BARU), `frontend/src/main.js`
  - `frontend/src/views/loginView.vue`, `frontend/src/views/registerView.vue`
  - `frontend/src/components/WorkspaceLayout.vue`, `frontend/src/views/dashboardView.vue`, `frontend/src/views/myProfileView.vue`, `frontend/src/views/myProjectView.vue`, `frontend/src/views/profileView.vue`. **Hanya** sumber `userName`/`displayName` → `authStore.user.name` dan isi `signOut()` → `authStore.logout()`.
  - `frontend/tests/guard.test.mjs` (BARU), `frontend/tests/apiError.test.mjs` (BARU)
  - `frontend/package.json` (hanya `scripts.test = "node --test"`), `frontend/.env.example` (BARU)
- **Catatan:** Aturan *profile completion* (cabang ketiga `resolveNavigation`) **belum** diaktifkan di FE-01. Fungsi diimplementasikan tanpa cabang itu, lalu FE-02 menambahkannya. Ini mencegah user terjebak di halaman profil yang masih dummy di antara dua tiket.
- **Acceptance Criteria:**
  1. Semua request memakai satu instance `api` dengan `withCredentials: true`; `baseURL` dari `VITE_API_BASE_URL` (fallback `http://localhost:3000/api`); `AI_TIMEOUT_MS = 120000` diekspor.
  2. Login sukses → cookie `auth_token` terpasang (DevTools → Application) → diarahkan ke `safeRedirect(query.redirect)` atau `/dashboard`. 401 → pesan server inline, tanpa reload atau loop redirect.
  3. Register 201 → `/complete-profile`. 409 → pesan email terdaftar. 400 → `errors[]` tampil.
  4. Tamu membuka route `requiresAuth` mana pun → `/login?redirect=<path>`; setelah login kembali ke path tersebut.
  5. User login membuka `/login` atau `/register` → `/dashboard`.
  6. Logout dari sidebar mana pun → `POST /auth/logout` → halaman `/login` ter-reload. Tombol Back ke `/dashboard` → diarahkan ke login.
  7. Reload di route terlindungi mempertahankan sesi (satu `GET /auth/me` 200 per page load).
  8. Cookie dihapus manual saat sesi berjalan → request berikutnya 401 → `/login?redirect=…`.
  9. Backend mati → login menampilkan pesan koneksi (status 0), tanpa error di console yang tak tertangani.
  10. Tidak ada lagi `skillproof_logged_in`, `skillproof_name`, `skillproof_email` di file allowlist.
  11. Route catch-all mengarah ke `/`. `/` tetap dapat diakses tamu.
- **Verifikasi:** `cd frontend && npm run build` · `cd frontend && npm test` · grep §6.2 · E2E langkah 1–3 dan 13 (§6.3).

**FE-02 — Complete Profile, My Profile, Settings (akun)**
- **Objective:** Profil nyata via `PUT /api/profile`, soft redirect profil, Settings minimal yang jujur.
- **Allowlist:** `frontend/src/views/profileView.vue`, `frontend/src/views/myProfileView.vue`, `frontend/src/views/settingsView.vue`, `frontend/src/stores/auth.js` (`updateProfile`, `profileIncomplete`, `profilePromptDismissed`), `frontend/src/router/guard.js` (cabang profile completion), `frontend/src/router/index.js` (meneruskan flag profil), `frontend/tests/guard.test.mjs`.
- **Acceptance Criteria:**
  1. Form Complete Profile terisi dari `authStore.user`; field mengikuti tabel P-04; university/prodi/angkatan/careerInterest/upload foto tidak lagi dirender.
  2. Simpan → `PUT /api/profile` 200 → `authStore.user` terbarui → nama baru langsung tampil di sidebar tanpa reload. 400 → `errors[]` inline. URL avatar non-http ditolak di klien.
  3. User dengan `bio` kosong diarahkan ke CompleteProfile pada navigasi terlindungi pertama. Setelah Simpan atau Lewati, tidak diarahkan lagi selama sesi itu.
  4. My Profile menampilkan data nyata; "Edit profil" kembali ke `/my-profile` setelah simpan.
  5. Settings: ubah nama berhasil; email read-only; logout berfungsi; bagian password/notifikasi/privasi/danger zone tidak ada.
  6. Tidak ada `localStorage` di file allowlist.
- **Verifikasi:** build · test · grep · E2E langkah 2.

### 5.3 Phase 2 — Projects & AI Analyzer

**FE-03 — Projects CRUD & evidences**
- **Allowlist:** `frontend/src/stores/projects.js` (BARU: fetch/create/update/delete, `fetchAnalyses`, `fetchAnalysis`), `frontend/src/lib/url.js` (BARU: `isHttpUrl`), `frontend/src/views/myProjectView.vue`.
- **Acceptance Criteria:**
  1. Daftar dari `GET /api/projects`. Empty state dengan CTA "Tambah proyek" bila kosong.
  2. Tambah proyek dengan ≥ 1 evidence → 201 → tampil di list tanpa reload. Validasi klien sesuai tabel P-07 (judul wajib, deskripsi ≤ 4000, URL http/https, end ≥ start, ≤ 10 evidence).
  3. Edit memuat evidences dari `GET /api/projects/:id`; menghapus satu evidence lalu simpan → `GET` ulang menunjukkan evidence tersebut hilang (semantik replace).
  4. Hapus dengan konfirmasi → 200 → hilang dari list.
  5. Badge status dari riwayat analisis; filter status dan pencarian teks berfungsi.
  6. `/projects?draftTitle=X&draftDescription=Y` membuka modal Tambah yang sudah terisi.
  7. Tombol Analyze menuju `/ai-skill-analyzer?project=<id>`.
  8. Tidak ada `defaultProjects` / `localStorage`. Link eksternal memakai `isHttpUrl` dan `rel="noopener noreferrer"`.
- **Verifikasi:** build · test · grep · E2E langkah 3.

**FE-04 — AI Analyzer, async UX & review queue**
- **Allowlist:** `frontend/src/stores/projects.js` (`analyzeProject`, polling, `notice`, bump di `deleteProject`), `frontend/src/stores/skills.js` (BARU: `pendingAssessments`, `acceptAssessment`, `rejectAssessment`, `competencyVersion`, `bumpCompetency`), `frontend/src/components/AssessmentReviewCard.vue` (BARU), `frontend/src/views/aiSkillAnalyzerView.vue`, `frontend/src/components/WorkspaceLayout.vue` (pil global + banner `notice`).
- **Acceptance Criteria:**
  1. Analyze → `POST /api/projects/:id/analyze` dengan timeout 120 dtk; tombol disabled, penghitung detik dan pesan bertahap tampil; double-click hanya menghasilkan 1 request.
  2. Pindah ke halaman lain saat analisis berjalan → pil global "AI menganalisis…" terlihat → saat selesai muncul banner yang mengarah ke analyzer proyek tersebut.
  3. Hasil menampilkan `summary`, `feedback`, `skills` (reasoning/evidence), dan `uncataloged_skills`. `raw_response` tidak dirender.
  4. Antrian review untuk proyek ini tampil dari `GET /api/user-skills/assessments?status=pending`. Accept (tanpa/dengan koreksi) dan Reject (dengan catatan) → kartu hilang; skill yang diterima muncul di `GET /api/user-skills?status=active`.
  5. Matriks error §3.5.1: deskripsi kosong → tombol disabled + tautan edit; 503 (provider tanpa key) → pesan server, tombol aktif kembali; 409 → polling hingga hasil tampil.
  6. Riwayat analisis tampil; klik entri lama → detail dimuat.
  7. Tidak ada `setTimeout` simulasi atau `localStorage`. Tidak ada `v-html`.
- **Verifikasi:** build · test · grep · E2E langkah 4–5 dan 12.

### 5.4 Phase 3 — Skills, Gap Analysis, Recommendations & Progress

**FE-05 — Skill Profile & manual skills**
- **Allowlist:** `frontend/src/stores/skills.js` (userSkills CRUD, `searchCatalog`, `fetchUserSkill`), `frontend/src/components/SkillCatalogPicker.vue` (BARU), `frontend/src/components/AssessmentReviewCard.vue` (hanya penyesuaian prop/tampilan bila diperlukan), `frontend/src/views/skillProfileView.vue`.
- **Acceptance Criteria:**
  1. Skill aktif dikelompokkan per kategori dari API; `score` null tampil "—".
  2. Bagian "Menunggu tinjauan" (`#review`) menampilkan seluruh antrian; accept/reject berfungsi seperti FE-04.
  3. Tambah skill via picker (debounce, `GET /api/skills?search=`) → 201. Duplikat skill aktif → pesan 409.
  4. Koreksi (PATCH) memperbarui kartu; Nonaktifkan (DELETE) menghapus kartu dari daftar aktif.
  5. Drawer detail menampilkan riwayat assessment dari `GET /api/user-skills/:id`.
  6. Minat statis dan `localStorage` dihapus; ada kartu tautan ke Target Karier.
- **Verifikasi:** build · test · grep · E2E langkah 6.

**FE-06 — Career targets & Skill Gap Analysis**
- **Allowlist:** `frontend/src/stores/career.js` (BARU: targets CRUD, `selectedTargetId`, `fetchGap`), `frontend/src/views/skillGapAnalysisView.vue`, `frontend/src/components/SkillCatalogPicker.vue` (prop exclude saja bila belum ada).
- **Acceptance Criteria:**
  1. Buat target dengan 2 skill → 201 → otomatis terpilih → gap dimuat.
  2. Empat bucket tampil dengan label PRD dan `notes` server. Bucket `pending_review` mengarah ke `/skill-profile#review`. Kedua persentase tampil dengan label "terverifikasi" vs "estimasi".
  3. Edit target (ganti daftar skill) → gap terhitung ulang. Hapus target → pilihan pindah ke target lain atau ke empty state.
  4. Target tanpa kriteria → empty state "Tambahkan kebutuhan skill". Judul duplikat → pesan 409.
  5. Panel keputusan mengikuti aturan P-10.
  6. `roles`/`roleData`/`localStorage` dihapus.
- **Verifikasi:** build · test · grep · E2E langkah 7.

**FE-07 — Course & Project Recommendations**
- **Allowlist:** `frontend/src/stores/career.js` (`recommendations`, `recLoading`, `fetchRecommendations`), `frontend/src/views/courseRecommendationsView.vue`, `frontend/src/views/projectRecommendationsView.vue`.
- **Acceptance Criteria:**
  1. Kunjungan pertama `/courses` → 1 request `GET …/recommendations` (timeout 120 dtk) dengan loading non-blocking. Pindah ke `/recommendations` → **0 request baru** (cache).
  2. Setelah accept/reject assessment atau perubahan target, kunjungan berikutnya → 1 request baru (cache basi).
  3. Tombol "Muat ulang (AI)" memaksa fetch dan disabled selama loading; klik ganda tidak menggandakan request.
  4. `goal_reached`, 400 tanpa kriteria, tanpa target, serta 429/502/503/504 menampilkan state masing-masing sesuai §3.5.3 dan §3.5.1.
  5. Kartu kursus hanya menampilkan field kontrak; tautan aman. "Kerjakan proyek ini" membuka `/projects` dengan modal terisi.
  6. Data statis, rating/match, bookmark, `enroll`/`alert`, dan `localStorage` dihapus.
- **Verifikasi:** build · test · grep · E2E langkah 8.

**FE-08 — Competency Progress & Dashboard**
- **Allowlist:** `frontend/src/stores/skills.js` (`fetchProgress`, `fetchSkillTimeline`), `frontend/src/stores/career.js` (`fetchGapSummary`, `fetchTargetProgress`), `frontend/src/views/competencyProgressView.vue`, `frontend/src/views/dashboardView.vue`.
- **Acceptance Criteria:**
  1. Statistik Competency sama dengan `GET /api/competency-progress` (cek Network). `average_score` null → "—".
  2. Klik skill → drawer linimasa kronologis (ASC) dengan statistik per status.
  3. Panel target menampilkan `readiness_percentage` + `skills_progress` untuk target terpilih; tanpa target → CTA.
  4. Dashboard: 4 widget dari 4 sumber §P-05. Mematikan satu endpoint (mis. memutus DB) tidak mengosongkan widget lain (`allSettled`).
  5. Semua angka fiktif dan `alert` dihapus.
- **Verifikasi:** build · test · grep · E2E langkah 9.

### 5.5 Phase 4 — Portfolio Builder & Public Sharing

**FE-09 — Portfolio Builder (generate & save)**
- **Allowlist:** `frontend/src/stores/portfolio.js` (BARU: `fetchMine`, `generateDraft`, `save`, `remove`), `frontend/src/views/portfolioBuilderView.vue`.
- **Acceptance Criteria:**
  1. Tanpa portofolio → wizard kosong. Dengan portofolio → form terisi dari `GET /api/portfolios`.
  2. Hanya skill berstatus aktif yang bisa dipilih; proyek dari API.
  3. Generate → `POST /api/portfolios/generate` (timeout 120 dtk) mengisi form dengan banner "Draf AI"; **tidak ada** POST/PUT sebelum Simpan. 422 → pesan + CTA.
  4. Simpan pertama → `POST` 201; simpan berikutnya → `PUT` 200; `is_published` tidak ada di body (cek Network). Slug invalid ditolak di klien; slug terpakai → pesan 409.
  5. Hapus portofolio → konfirmasi → kembali ke wizard kosong.
  6. Data statis, "Interactive Web & PDF", "Recruiter Telemetry", dan `localStorage` dihapus.
- **Verifikasi:** build · test · grep · E2E langkah 10.

**FE-10 — Sharing settings & Public Portfolio page**
- **Allowlist:** `frontend/src/stores/portfolio.js` (`fetchSharing`, `updateSharing`, `fetchPublic`), `frontend/src/views/publicPortfolioView.vue` (BARU), `frontend/src/router/index.js` (route `/p/:slug`), `frontend/src/views/portfolioBuilderView.vue` (panel Sharing), `frontend/src/views/settingsView.vue` (toggle visibilitas), `frontend/tests/guard.test.mjs` (kasus route publik).
- **Acceptance Criteria:**
  1. Panel Sharing memuat `GET …/sharing`. Toggle publish → `PATCH` 200; field kontak tersimpan; `null` mengosongkan.
  2. URL yang ditampilkan dan disalin = `http://localhost:5173/p/<slug>`, bukan `public_url` API.
  3. Jendela incognito (tanpa cookie) membuka `/p/<slug>` yang dipublikasikan → render penuh, **tanpa** request `/api/auth/me`.
  4. Setelah unpublish, slug yang sama dan slug acak menampilkan pesan 404 yang **identik**.
  5. Halaman publik hanya menampilkan skill aktif dan kontak non-null; email akun tidak pernah tampil (kecuali sebagai `public_email` yang diisi user).
  6. Settings: toggle visibilitas tersinkron dengan panel builder.
  7. Grep akhir §6.2: nol `localStorage`/`sessionStorage` di seluruh `frontend/src`.
- **Verifikasi:** build · test · grep · E2E langkah 10–11.

### 5.6 Kesenjangan backend (BE-GAP), untuk keputusan Council, tidak memblokir FE

| ID | Kebutuhan | Dampak bila tidak dikerjakan | Pekerjaan backend |
|---|---|---|---|
| BE-GAP-01 | Field akademik profil (universitas, prodi, angkatan) | UI profil hanya nama/bio/avatar | Migrasi kolom + rollback, perluasan validasi `PUT /api/profile` |
| BE-GAP-02 | `category` dan `technologies` proyek | Teknologi harus ditulis di deskripsi | Migrasi + validasi projects |
| BE-GAP-03 | Upload file avatar | Avatar hanya via URL | Endpoint upload + penyimpanan file (PRD §15 masih terbuka) |
| BE-GAP-04 | `analyses_count` / `last_analyzed_at` di `GET /api/projects` | N+1 request di halaman Projects (shortcut tercatat) | Subquery di list projects |
| BE-GAP-05 | Ganti password, hapus akun, preferensi notifikasi | Settings minimal | Endpoint baru |
| BE-GAP-06 | Analisis async (202 + status job) | UX bergantung pada request ≤ 120 dtk | Hanya bila latensi provider nyata rutin > 60 dtk |
| DOC-01 | Selaraskan ARCHITECTURE §8–9, jumlah endpoint, 422 di kontrak #39, makna `public_url` | Kebingungan agen berikutnya | Revisi dokumen oleh Council/Arsitek |

---

## 6. Testing & Acceptance Seams

### 6.1 Otomatis (setiap tiket)

```bash
cd frontend && npm run build     # vite build harus lulus tanpa error
cd frontend && npm test          # node --test (Node 22): menemukan tests/*.test.mjs otomatis
```

Kasus minimum `tests/guard.test.mjs`:
- Tamu ke route `requiresAuth` → `{name:'Login', query:{redirect: fullPath}}`.
- User login ke `guestOnly` → `safeRedirect(query.redirect)`.
- User login ke route terlindungi → `true`.
- Route publik (tanpa meta) → `true` untuk tamu maupun user login.
- (FE-02) `profileIncomplete && !dismissed` → CompleteProfile; `dismissed` → `true`; target CompleteProfile sendiri → `true` (tanpa loop).
- `safeRedirect`: menolak `'//evil.com'`, `'https://evil.com'`, `'/\\evil.com'`, `undefined`, `['/x']`; menerima `'/projects?x=1'`.

Kasus minimum `tests/apiError.test.mjs`:
- Tanpa response → status 0 + pesan jaringan.
- `code: 'ECONNABORTED'` → status 0 + pesan timeout.
- 400 dengan `errors[]` → array terjaga.
- 403 body `{error:'…'}` (format middleware) → `message` diambil dari `error`.
- 429 tanpa `message` → fallback map.
- Body string HTML → fallback per status.

### 6.2 Aturan grep (diperiksa Satpam, dijalankan dari root repo)

| Perintah | Harapan |
|---|---|
| `grep -rn "localStorage\|sessionStorage" frontend/src/<file allowlist>` | 0 baris (per tiket); 0 di seluruh `frontend/src` setelah FE-10 |
| `grep -rln "lib/api" frontend/src/views frontend/src/components` | 0 file (D-2) |
| `grep -rn "from 'axios'" frontend/src` | hanya `frontend/src/lib/api.js` |
| `grep -rn "withCredentials" frontend/src/lib/api.js` | 1 baris `withCredentials: true` |
| `grep -rn "v-html" frontend/src` | 0 baris |
| `grep -rn "raw_response" frontend/src/views frontend/src/components` | 0 baris |
| `grep -rn "import.meta\|\.vue'" frontend/src/router/guard.js frontend/src/lib/apiError.js` | 0 baris (modul murni, bisa diuji Node) |
| `git status -s` | Hanya file di allowlist tiket yang berubah (butuh baseline §5.0) |

### 6.3 E2E smoke (manual atau via browser automation Satpam)

Setup: backend `AI_PROVIDER=mock`, `npm run db:migrate && npm run db:seed`, `npm run dev`; frontend `npm run dev`; buka **`http://localhost:5173`**; DevTools → Network terbuka.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 1 | Buka `/dashboard` sebagai tamu | Redirect `/login?redirect=%2Fdashboard` |
| 2 | Register akun baru → isi Complete Profile (nama, bio) | 201 → `/complete-profile` → PUT 200 → `/dashboard`, nama di sidebar benar |
| 3 | Tambah proyek (deskripsi + 2 evidence) | POST 201, tampil di list; edit hapus 1 evidence → tersimpan |
| 4 | Analyze proyek, lalu pindah ke Dashboard sebelum selesai (aktifkan throttling "Slow 3G" agar terlihat) | Pil global tampil → banner selesai → klik → hasil + antrian review |
| 5 | Accept 1 skill (koreksi skor), Reject 1 skill | Kartu hilang; Skill Profile hanya menampilkan yang diterima |
| 6 | Tambah skill manual via katalog; tambah skill yang sama lagi | 201, lalu pesan 409 |
| 7 | Buat target karier dengan 1 skill aktif + 1 skill lain | Gap: 1 fulfilled/under-qualified + 1 missing |
| 8 | Buka `/courses`, lalu `/recommendations` | 1 request recommendations saja; tombol "Kerjakan proyek ini" → modal proyek terisi |
| 9 | Buka `/competency` dan `/dashboard` | Angka sama dengan response API; tanpa angka fiktif |
| 10 | Portfolio: Generate → Simpan → Publish → salin URL | Tanpa POST sebelum Simpan; URL `/p/<slug>` |
| 11 | Buka URL di incognito; unpublish; buka lagi; buka slug acak | Render penuh tanpa `/auth/me`; pesan 404 identik untuk keduanya |
| 12 | Set backend `AI_PROVIDER=gemini` tanpa `AI_API_KEY`, lalu Analyze | Pesan 503 dari server, UI pulih (tombol aktif kembali) |
| 13 | Logout → tombol Back | `/login` ter-reload; Back ke halaman terlindungi → kembali ke login |

### 6.4 Handoff

- Tukang menulis `docs/ai/handoffs/FE-0X-BUILD.md`: output riil `npm run build` dan `npm test`, hasil grep §6.2, daftar langkah E2E yang dijalankan, `git status -s`.
- Satpam menulis `docs/ai/handoffs/FE-0X-QA.md` dengan 2 sumbu audit (kepatuhan spesifikasi ini dan standar kode) serta rekomendasi `RECOMMEND_ACCEPTED`/`RECOMMEND_REVISION`/`RECOMMEND_BLOCKED`.

---

## 7. Out of Scope

- Perubahan apa pun pada `backend/` (termasuk semua BE-GAP di §5.6).
- Redesign visual, refactor sidebar duplikat (dashboard/myProfile/myProject/profile) ke `WorkspaceLayout`, dan penggantian `alert()` validasi lama.
- Dependency baru (Vitest, Playwright, i18n, toast library, state persistence plugin).
- Ekspor PDF portofolio, integrasi LinkedIn/GitHub, upload file (bukti maupun avatar).
- Deployment produksi: HTTPS, `SameSite=None`, domain, dan konfigurasi `FRONTEND_URL` produksi.
- Paginasi UI untuk > 100 skill/assessment (shortcut `limit=100`, dicatat dengan komentar `shortcut:`).
- Fitur "Accept all" massal untuk antrian review.
- Pengubahan teks marketing `landingView.vue`.
