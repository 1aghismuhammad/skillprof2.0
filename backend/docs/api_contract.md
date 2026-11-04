# SkillProof Backend — API Contract & Integration Guide

> **Versi Dokumentasi:** 1.0  
> **Status:** Aktual (Berdasarkan implementasi kode aktif per Tahap 1–4)  
> **Target Pengguna:** Pengembang Frontend (Vue.js / Vite / Mobile / Web Client)  
> **Format Pertukaran Data:** JSON (`Content-Type: application/json`)  
> **Base URL:** `http://localhost:3000` (atau sesuai konfigurasi backend)

---

## Daftar Isi

1. [Panduan Integrasi Frontend](#1-panduan-integrasi-frontend)
   - [Mekanisme Autentikasi](#mekanisme-autentikasi)
   - [Konfigurasi CORS & Proteksi CSRF](#konfigurasi-cors--proteksi-csrf)
   - [Struktur Respons Standar](#struktur-respons-standar)
   - [Daftar Kode Status HTTP](#daftar-kode-status-http)
   - [Siklus Hidup Status Kompetensi (State Machine)](#siklus-hidup-status-kompetensi-state-machine)
2. [Tabel Ringkasan Endpoint](#2-tabel-ringkasan-endpoint)
3. [Spesifikasi Endpoint](#3-spesifikasi-endpoint)
   - [A. Autentikasi (Authentication)](#a-autentikasi-authentication)
   - [B. Manajemen Proyek & Bukti (Projects & Evidence)](#b-manajemen-proyek--bukti-projects--evidence)
   - [C. Analisis Proyek AI (Project Analysis)](#c-analisis-proyek-ai-project-analysis)
   - [D. Katalog Master Skill (Master Skills)](#d-katalog-master-skill-master-skills)
   - [E. Profil Skill Pengguna (User Skills)](#e-profil-skill-pengguna-user-skills)
   - [F. Peninjauan Rekomendasi AI (AI Assessment Review)](#f-peninjauan-rekomendasi-ai-ai-assessment-review)
   - [G. Health & System Check](#g-health--system-check)
   - [H. Manajemen Profil Mahasiswa (Profile Management)](#h-manajemen-profil-mahasiswa-profile-management)
   - [I. Manajemen Target Karier (Career Target Management)](#i-manajemen-target-karier-career-target-management)
   - [J. Analisis Kesenjangan Kompetensi (Skill Gap Analysis)](#j-analisis-kesenjangan-kompetensi-skill-gap-analysis)
   - [K. Rekomendasi Kursus dan Proyek (Course & Project Recommendations)](#k-rekomendasi-kursus-dan-proyek-course--project-recommendations)
   - [L. Perkembangan Kompetensi (Competency Progress)](#l-perkembangan-kompetensi-competency-progress)
   - [M. Pembuat Portofolio & AI Portfolio Generator (Portfolio Builder)](#m-pembuat-portofolio--ai-portfolio-generator-portfolio-builder)
   - [N. Portofolio Publik & Pengaturan Privasi (Public Portfolio & Sharing Settings)](#n-portofolio-publik--pengaturan-privasi-public-portfolio--sharing-settings)

---

## 1. Panduan Integrasi Frontend

### Mekanisme Autentikasi

Backend SkillProof mendukung **dua metode autentikasi** yang terintegrasi:

1. **HttpOnly Cookie (`auth_token`) — Metode Utama Aplikasi Web Peramban**
   - Saat pemanggilan `POST /api/auth/register` atau `POST /api/auth/login` berhasil, backend secara otomatis menyematkan header `Set-Cookie` dengan atribut:
     - `Name`: `auth_token`
     - `HttpOnly`: `true` (tidak dapat diakses oleh JavaScript untuk mitigasi XSS)
     - `SameSite`: `lax` (development) / `none` (production cross-site)
     - `Secure`: `true` (hanya aktif di lingkungan production HTTPS)
     - `Path`: `/`
     - `Max-Age`: `604800` (7 hari)
   - **Frontend wajib menyertakan kredensial pada setiap request HTTP:**
     - **Axios:**
       ```javascript
       axios.defaults.withCredentials = true;
       // atau pada instance:
       const api = axios.create({
         baseURL: 'http://localhost:3000/api',
         withCredentials: true,
       });
       ```
     - **Fetch API:**
       ```javascript
       fetch('http://localhost:3000/api/projects', {
         credentials: 'include',
       });
       ```

2. **Bearer Token (`Authorization: Bearer <token>`) — Metode Alternatif / API Client / Mobile**
   - Backend juga mendukung pembacaan token JWT melalui header HTTP standar:
     ```http
     Authorization: Bearer <jwt_token_string>
     ```

---

### Konfigurasi CORS & Proteksi CSRF

1. **Origin yang Diizinkan:**
   - Secara default: `http://localhost:5173` (Vite) dan `http://127.0.0.1:5173`.
   - Dapat dikonfigurasi melalui variabel environment `FRONTEND_URL`.
2. **Proteksi CSRF pada State-Changing Methods:**
   - Untuk metode `POST`, `PUT`, `PATCH`, dan `DELETE`, peramban akan mengirimkan header `Origin` atau `Referer`.
   - Jika request berasal dari origin di luar whitelist, server akan merespons dengan **HTTP 403 Forbidden**.
   - Pastikan aplikasi frontend berjalan pada port yang telah didaftarkan (`http://localhost:5173`).

---

### Struktur Respons Standar

#### 1. Respons Sukses

Sebagian besar endpoint mengembalikan objek JSON dengan properti `status: "success"`:

```json
{
  "status": "success",
  "message": "Operasi berhasil diselesaikan.",
  "data": { ... }
}
```

*(Catatan: Endpoint autentikasi `/api/auth/login`, `/api/auth/register`, dan `/api/auth/me` mengembalikan objek `"user"` alih-alih `"data"`).*

#### 2. Respons Error

Semua error menghasilkan format JSON yang konsisten:

```json
{
  "status": "error",
  "message": "Pesan deskripsi kesalahan yang mudah dipahami pengguna.",
  "errors": [
    "Detail error spesifik 1 jika validasi gagal",
    "Detail error spesifik 2 jika validasi gagal"
  ]
}
```

---

### Daftar Kode Status HTTP

| Status Code | Makna | Kondisi Terjadinya |
|---|---|---|
| `200 OK` | Permintaan berhasil | Pembacaan data (GET), pembaruan (PUT/PATCH), atau penghapusan (DELETE). |
| `201 Created` | Sumber daya baru dibuat | Pembuatan akun, proyek baru, skill manual baru, atau analisis AI baru. |
| `400 Bad Request` | Masukan tidak valid | Kegagalan validasi payload JSON, tipe data salah, ID bukan angka positif. |
| `401 Unauthorized` | Autentikasi gagal / belum login | Cookie `auth_token` atau header Bearer tidak ada, rusak, atau kedaluwarsa. |
| `403 Forbidden` | Akses ditolak | Permintaan lintas origin tidak diizinkan oleh proteksi CORS/CSRF middleware. |
| `404 Not Found` | Data tidak ditemukan | ID sumber daya tidak ada di database, atau bukan milik pengguna aktif (isolasi hak akses). |
| `409 Conflict` | Konflik integritas data | Email sudah terdaftar, duplikasi skill aktif, atau analisis ganda dalam 2 menit. |
| `429 Too Many Requests` | Limit request tercapai | Batas frekuensi permintaan provider AI tercapai (*rate limit*). |
| `500 Internal Error` | Kesalahan internal server | Gangguan tak terduga pada server atau transaksi database. |
| `503 Service Unavailable` | Layanan luar tidak tersedia | Koneksi database terputus atau kunci `AI_API_KEY` belum terpasang. |
| `504 Gateway Timeout` | Batas waktu terlampaui | Provider AI membutuhkan waktu respons melebihi batas waktu (30 detik). |

---

### Siklus Hidup Status Kompetensi (State Machine)

SkillProof memisahkan profil kompetensi pengguna (`user_skills`) dari riwayat bukti penilaian (`user_skill_assessments`).

#### A. Status Profil Skill (`user_skills.status`)

1. **`needs_review`**: Skill baru ditemukan oleh inferensi AI dari proyek pengguna. Pada status ini, skill **belum diakui sebagai kompetensi aktif** (`proficiency_level` bernilai `null` dan `score` bernilai `null`).
2. **`active`**: Skill telah disetujui oleh pengguna (baik dari hasil persetujuan rekomendasi AI maupun input manual). Memiliki `proficiency_level` ('beginner', 'intermediate', 'advanced') dan `score` (0–100) yang sah.
3. **`rejected`**: Skill dinonaktifkan oleh pengguna (melalui `DELETE /api/user-skills/[id]`) atau seluruh rekomendasi AI untuk skill tersebut ditolak dan tidak ada assessment manual aktif.

#### B. Status Riwayat Penilaian (`user_skill_assessments.review_status`)

1. **`pending`**: Hasil inferensi AI baru yang menunggu peninjauan pengguna.
2. **`accepted`**: Penilaian yang telah disetujui (baik dari input manual langsung maupun hasil penerimaan AI).
3. **`rejected`**: Penilaian AI yang ditolak oleh pengguna.

#### C. Diagram Alur Status Kompetensi

```text
[Analisis Proyek AI]
       │
       ▼
user_skills: 'needs_review' (level: null, score: null)
user_skill_assessments: 'pending' (source_type: 'ai')
       │
       ├────────────────────────────────────────┐
       ▼                                        ▼
[Pengguna Menerima (Accept)]            [Pengguna Menolak (Reject)]
       │                                        │
user_skills: 'active'                   user_skills: 'rejected'
user_skill_assessments: 'accepted'      user_skill_assessments: 'rejected'

[Input Manual Pengguna]
       │
       ▼
user_skills: 'active' (langsung aktif)
user_skill_assessments: 'accepted' (source_type: 'manual')
```

---

## 2. Tabel Ringkasan Endpoint

| No | Modul | Method | Endpoint URL | Autentikasi | Deskripsi Singkat |
|---|---|---|---|---|---|
| 1 | Auth | `POST` | `/api/auth/register` | Publik | Mendaftarkan akun mahasiswa baru |
| 2 | Auth | `POST` | `/api/auth/login` | Publik | Otentikasi dan penerbitan sesi login |
| 3 | Auth | `POST` | `/api/auth/logout` | Publik | Menghapus sesi cookie autentikasi |
| 4 | Auth | `GET` | `/api/auth/me` | Wajib | Memeriksa data sesi pengguna aktif |
| 5 | Projects | `GET` | `/api/projects` | Wajib | Mengambil daftar proyek milik pengguna |
| 6 | Projects | `POST` | `/api/projects` | Wajib | Membuat proyek baru beserta bukti pendukung |
| 7 | Projects | `GET` | `/api/projects/[id]` | Wajib | Mengambil detail proyek dan bukti |
| 8 | Projects | `PUT` | `/api/projects/[id]` | Wajib | Memperbarui proyek dan mengganti bukti |
| 9 | Projects | `DELETE` | `/api/projects/[id]` | Wajib | Menghapus proyek beserta bukti pendukung |
| 10 | AI Analysis | `POST` | `/api/projects/[id]/analyze` | Wajib | Menjalankan analisis kompetensi proyek |
| 11 | AI Analysis | `GET` | `/api/projects/[id]/analyses` | Wajib | Mengambil riwayat sesi analisis proyek |
| 12 | AI Analysis | `GET` | `/api/projects/[id]/analyses/[analysisId]` | Wajib | Mengambil detail satu sesi analisis AI |
| 13 | Master Skills | `GET` | `/api/skills` | Publik | Mengambil katalog master keterampilan |
| 14 | User Skills | `GET` | `/api/user-skills` | Wajib | Mengambil daftar skill profil pengguna |
| 15 | User Skills | `POST` | `/api/user-skills` | Wajib | Menambahkan skill manual langsung aktif |
| 16 | User Skills | `GET` | `/api/user-skills/[id]` | Wajib | Mengambil detail skill & riwayat assessment |
| 17 | User Skills | `PATCH` | `/api/user-skills/[id]` | Wajib | Mengoreksi level/skor skill aktif |
| 18 | User Skills | `DELETE` | `/api/user-skills/[id]` | Wajib | Menghapus skill (soft delete ke status rejected) |
| 19 | Assessment | `GET` | `/api/user-skills/assessments` | Wajib | Mengambil daftar assessment yang perlu ditinjau |
| 20 | Assessment | `GET` | `/api/user-skills/assessments/[id]` | Wajib | Mengambil detail satu assessment AI |
| 21 | Assessment | `POST` | `/api/user-skills/assessments/[id]/accept` | Wajib | Menerima rekomendasi AI (dengan/tanpa koreksi) |
| 22 | Assessment | `POST` | `/api/user-skills/assessments/[id]/reject` | Wajib | Menolak rekomendasi AI |
| 23 | Health | `GET` | `/api/health` | Publik | Health check ketersediaan sistem & database |
| 24 | Profile | `GET` | `/api/profile` | Wajib | Mengambil profil mahasiswa yang sedang login |
| 25 | Profile | `PUT` | `/api/profile` | Wajib | Memperbarui nama, bio, atau avatar URL pengguna |
| 26 | Career Targets | `GET` | `/api/career-targets` | Wajib | Mengambil daftar target karier & kebutuhan skill |
| 27 | Career Targets | `POST` | `/api/career-targets` | Wajib | Membuat target karier baru & kebutuhan skill |
| 28 | Career Targets | `GET` | `/api/career-targets/[id]` | Wajib | Mengambil detail target karier & daftar skill |
| 29 | Career Targets | `PUT` | `/api/career-targets/[id]` | Wajib | Memperbarui target karier & mengganti skill |
| 30 | Career Targets | `DELETE` | `/api/career-targets/[id]` | Wajib | Menghapus target karier (cascade ke relasi skill) |
| 31 | Skill Gap | `GET` | `/api/career-targets/[id]/gap-analysis` | Wajib | Analisis kesenjangan kompetensi satu target karier |
| 32 | Skill Gap | `GET` | `/api/career-targets/gap-analysis` | Wajib | Ringkasan kesiapan seluruh target karier pengguna |
| 33 | Recommendations | `GET` | `/api/career-targets/[id]/recommendations` | Wajib | Rekomendasi gabungan kursus dan proyek portofolio AI |
| 34 | Recommendations | `GET` | `/api/career-targets/[id]/recommendations/courses` | Wajib | Rekomendasi materi kursus terstruktur untuk skill gap |
| 35 | Recommendations | `GET` | `/api/career-targets/[id]/recommendations/projects` | Wajib | Rekomendasi proyek portofolio AI untuk skill gap |
| 36 | Competency Progress | `GET` | `/api/competency-progress` | Wajib | Ringkasan progres kompetensi pengguna & statistik |
| 37 | Competency Progress | `GET` | `/api/competency-progress/skills/[id]` | Wajib | Linimasa kronologis & detail riwayat assessment per skill |
| 38 | Competency Progress | `GET` | `/api/competency-progress/career-targets/[id]` | Wajib | Progres kesiapan kompetensi terhadap target karier |
| 39 | Portfolio Builder | `POST` | `/api/portfolios/generate` | Wajib | Menghasilkan draf rekomendasi portofolio dengan AI (stateless) |
| 40 | Portfolio Builder | `GET` | `/api/portfolios` | Wajib | Mengambil portofolio aktif milik pengguna yang sedang login |
| 41 | Portfolio Builder | `POST` | `/api/portfolios` | Wajib | Menyimpan portofolio baru beserta relasi proyek dan skill |
| 42 | Portfolio Builder | `GET` | `/api/portfolios/[id]` | Wajib | Mengambil detail portofolio berdasarkan ID (milik pengguna) |
| 43 | Portfolio Builder | `PUT` | `/api/portfolios/[id]` | Wajib | Memperbarui portofolio dan memperbarui kurasi proyek & skill |
| 44 | Portfolio Builder | `DELETE` | `/api/portfolios/[id]` | Wajib | Menghapus portofolio pengguna (cascade ke relasi proyek & skill) |
| 45 | Public Portfolio | `GET` | `/api/public/portfolios/[slug]` | Publik | Mengambil data portofolio publik yang dipublikasikan (`is_published: 1`) |
| 46 | Portfolio Settings | `GET` | `/api/portfolios/[id]/sharing` | Wajib | Mengambil pengaturan berbagi dan privasi portofolio milik pengguna |
| 47 | Portfolio Settings | `PATCH` | `/api/portfolios/[id]/sharing` | Wajib | Memperbarui pengaturan berbagi (status publikasi, slug, kontak publik) |

---

## 3. Spesifikasi Endpoint

### A. Autentikasi (Authentication)

---

#### 1. POST `/api/auth/register`

- **Tujuan:** Mendaftarkan akun mahasiswa baru dan langsung membuat sesi login.
- **Autentikasi:** Tidak diperlukan (Publik).
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "name": "Ahmad Fauzi",
    "email": "ahmad.fauzi@example.com",
    "password": "PasswordRahasia123"
  }
  ```
  | Field | Tipe | Status | Aturan Validasi |
  |---|---|---|---|
  | `name` | string | Wajib | Panjang 2 hingga 100 karakter. |
  | `email` | string | Wajib | Format email valid, maksimal 150 karakter, otomatis diubah ke huruf kecil. |
  | `password` | string | Wajib | Minimal 8 karakter, maksimal 100 karakter. |

- **Response Sukses (`201 Created`):**
  - **Set-Cookie:** `auth_token=<jwt_token>; HttpOnly; SameSite=lax; Path=/; Max-Age=604800`
  ```json
  {
    "status": "success",
    "message": "Registrasi berhasil.",
    "user": {
      "id": 7,
      "name": "Ahmad Fauzi",
      "email": "ahmad.fauzi@example.com"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Payload JSON tidak valid / Nama/Email/Password tidak memenuhi kriteria validasi.
  - `409 Conflict`: Alamat email sudah terdaftar.
  - `500 Internal Server Error`: Terjadi kegagalan server database saat pembuatan akun.

---

#### 2. POST `/api/auth/login`

- **Tujuan:** Memverifikasi kredensial pengguna dan menerbitkan cookie sesi autentikasi.
- **Autentikasi:** Tidak diperlukan (Publik).
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "email": "ahmad.fauzi@example.com",
    "password": "PasswordRahasia123"
  }
  ```
  | Field | Tipe | Status | Aturan Validasi |
  |---|---|---|---|
  | `email` | string | Wajib | Email pengguna terdaftar. |
  | `password` | string | Wajib | Kata sandi pengguna. |

- **Response Sukses (`200 OK`):**
  - **Set-Cookie:** `auth_token=<jwt_token>; HttpOnly; SameSite=lax; Path=/; Max-Age=604800`
  ```json
  {
    "status": "success",
    "message": "Login berhasil.",
    "user": {
      "id": 7,
      "name": "Ahmad Fauzi",
      "email": "ahmad.fauzi@example.com",
      "bio": null,
      "avatar_url": null
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Email atau kata sandi tidak disertakan.
  - `401 Unauthorized`: `"Email atau kata sandi tidak valid."` (Pesan generik untuk mencegah kebocoran keberadaan akun).
  - `500 Internal Server Error`: Kesalahan server saat autentikasi.

---

#### 3. POST `/api/auth/logout`

- **Tujuan:** Menghapus sesi autentikasi pengguna dengan mencabut cookie `auth_token`.
- **Autentikasi:** Tidak diperlukan.
- **Request Body:** Tidak ada.
- **Response Sukses (`200 OK`):**
  - **Set-Cookie:** `auth_token=; HttpOnly; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`
  ```json
  {
    "status": "success",
    "message": "Logout berhasil."
  }
  ```

---

#### 4. GET `/api/auth/me`

- **Tujuan:** Mengambil data profil mutakhir pengguna yang saat ini sedang login.
- **Autentikasi:** Wajib (Cookie `auth_token` atau Header `Authorization: Bearer <token>`).
- **Query Parameter:** Tidak ada.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "user": {
      "id": 7,
      "name": "Ahmad Fauzi",
      "email": "ahmad.fauzi@example.com",
      "bio": "Mahasiswa Teknik Informatika peminat web development",
      "avatar_url": null,
      "created_at": "2026-11-04T05:00:00.000Z",
      "updated_at": "2026-11-04T05:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: `"Akses tidak sah. Silakan login terlebih dahulu."` (Token tidak ada atau tidak valid).
  - `401 Unauthorized`: `"Pengguna tidak ditemukan."` (Token valid namun baris user telah dihapus di DB; cookie otomatis dihapus).
  - `500 Internal Server Error`: Kesalahan server saat memeriksa sesi.

---

### B. Manajemen Proyek & Bukti (Projects & Evidence)

---

#### 5. GET `/api/projects`

- **Tujuan:** Menampilkan seluruh daftar proyek milik pengguna yang sedang login.
- **Autentikasi:** Wajib.
- **Aturan Kepemilikan:** Hanya mengembalikan proyek di mana `user_id == current_user.id`.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 12,
        "user_id": 7,
        "title": "Aplikasi E-Commerce SkillProof",
        "description": "Membangun sistem katalog belanja online dengan Next.js dan MySQL.",
        "repository_url": "https://github.com/example/ecommerce",
        "live_url": "https://ecommerce.example.com",
        "start_date": "2026-02-01",
        "end_date": "2026-05-15",
        "created_at": "2026-11-04T05:10:00.000Z",
        "updated_at": "2026-11-04T05:10:00.000Z"
      }
    ]
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Pengguna belum login.
  - `500 Internal Server Error`: Kesalahan pengambilan data proyek.

---

#### 6. POST `/api/projects`

- **Tujuan:** Membuat proyek baru beserta daftar bukti pendukung (*evidences*).
- **Autentikasi:** Wajib.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "title": "Aplikasi E-Commerce SkillProof",
    "description": "Membangun sistem katalog belanja online dengan Next.js dan MySQL.",
    "repository_url": "https://github.com/example/ecommerce",
    "live_url": "https://ecommerce.example.com",
    "start_date": "2026-02-01",
    "end_date": "2026-05-15",
    "evidences": [
      {
        "title": "Repositori GitHub",
        "evidence_type": "repository",
        "url": "https://github.com/example/ecommerce"
      },
      {
        "title": "Demo Aplikasi",
        "evidence_type": "demo",
        "url": "https://ecommerce.example.com"
      }
    ]
  }
  ```
  | Field | Tipe | Status | Aturan Validasi |
  |---|---|---|---|
  | `title` | string | Wajib | 1 hingga 200 karakter. |
  | `description` | string | Opsional | Teks deskripsi (default `""`). |
  | `repository_url` | string/null | Opsional | URL valid (`http://` atau `https://`), maksimal 255 karakter. |
  | `live_url` | string/null | Opsional | URL valid (`http://` atau `https://`), maksimal 255 karakter. |
  | `start_date` | string/null | Opsional | Format tanggal `YYYY-MM-DD`. |
  | `end_date` | string/null | Opsional | Format tanggal `YYYY-MM-DD` (tidak boleh lebih awal dari `start_date`). |
  | `evidences` | array | Opsional | Daftar bukti proyek. Tiap item: `title` (maks 150), `url` (maks 500), `evidence_type` (`repository`, `demo`, `document`, `certificate`, `other`). |

- **Response Sukses (`201 Created`):**
  ```json
  {
    "status": "success",
    "message": "Proyek berhasil dibuat.",
    "data": {
      "id": 12,
      "user_id": 7,
      "title": "Aplikasi E-Commerce SkillProof",
      "description": "Membangun sistem katalog belanja online dengan Next.js dan MySQL.",
      "repository_url": "https://github.com/example/ecommerce",
      "live_url": "https://ecommerce.example.com",
      "start_date": "2026-02-01",
      "end_date": "2026-05-15",
      "created_at": "2026-11-04T05:10:00.000Z",
      "updated_at": "2026-11-04T05:10:00.000Z",
      "evidences": [
        {
          "id": 20,
          "project_id": 12,
          "title": "Repositori GitHub",
          "evidence_type": "repository",
          "url": "https://github.com/example/ecommerce"
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Validasi data proyek gagal (disertai daftar detail `errors`).
  - `401 Unauthorized`: Belum login.
  - `500 Internal Server Error`: Kesalahan server saat menyimpan proyek.

---

#### 7. GET `/api/projects/[id]`

- **Tujuan:** Menampilkan detail lengkap satu proyek milik pengguna beserta daftar bukti pendukungnya.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Proyek.
- **Aturan Kepemilikan:** Jika proyek ada tetapi bukan milik pengguna yang sedang login, server merespons **404 Not Found** (isolasi data antar-pengguna).
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 12,
      "user_id": 7,
      "title": "Aplikasi E-Commerce SkillProof",
      "description": "Membangun sistem katalog belanja online dengan Next.js dan MySQL.",
      "repository_url": "https://github.com/example/ecommerce",
      "live_url": "https://ecommerce.example.com",
      "start_date": "2026-02-01",
      "end_date": "2026-05-15",
      "created_at": "2026-11-04T05:10:00.000Z",
      "updated_at": "2026-11-04T05:10:00.000Z",
      "evidences": [
        {
          "id": 20,
          "project_id": 12,
          "title": "Repositori GitHub",
          "evidence_type": "repository",
          "url": "https://github.com/example/ecommerce",
          "created_at": "2026-11-04T05:10:00.000Z"
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID proyek tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: `"Proyek tidak ditemukan."`

---

#### 8. PUT `/api/projects/[id]`

- **Tujuan:** Memperbarui data proyek milik pengguna.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Proyek.
- **Request Body:** Parsial atau penuh field proyek (`title`, `description`, `repository_url`, `live_url`, `start_date`, `end_date`, `evidences`).
  *(Penting: Jika array `evidences` disertakan, server akan mengganti seluruh daftar bukti lama dengan daftar bukti baru).*
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Proyek berhasil diperbarui.",
    "data": { ... }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Format tanggal salah atau tanggal selesai lebih awal dari tanggal mulai.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Proyek tidak ditemukan atau bukan milik pengguna.

---

#### 9. DELETE `/api/projects/[id]`

- **Tujuan:** Menghapus proyek milik pengguna. Bukti pendukung di tabel `project_evidences` akan otomatis terhapus secara cascading.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Proyek.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Proyek berhasil dihapus."
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Proyek tidak ditemukan atau bukan milik Anda.

---

### C. Analisis Proyek AI (Project Analysis)

---

#### 10. POST `/api/projects/[id]/analyze`

- **Tujuan:** Menjalankan evaluasi AI atas substansi teknis proyek untuk mendeteksi kompetensi, memberikan umpan balik, dan otomatis memasukkan rekomendasi ke profil kompetensi pengguna.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Proyek.
- **Request Body:** Kosong (`{}`).
- **Syarat Validasi Proyek:**
  - Deskripsi proyek tidak boleh kosong dan maksimal 4000 karakter.
  - Tautan bukti proyek harus berformat URL valid.
  - Tidak sedang menjalankan analisis serentak untuk proyek yang sama (*concurrency guard via database user lock*). Jika analisis untuk proyek tersebut masih berjalan, sistem mengembalikan status `409 Conflict`.
- **Efek Samping Database (Atomik 1 Transaksi):**
  1. Membuat entri sesi di `ai_analyses` (`status = 'completed'`).
  2. Menyimpan rincian skill AI di `ai_analysis_skills`.
  3. Memasukkan skill baru ke `user_skills` (`status = 'needs_review'`, level dan score `NULL`). Jika skill sudah aktif, nilai aktif tidak ditimpa.
  4. Membuat entri penilaian baru di `user_skill_assessments` (`source_type = 'ai'`, `review_status = 'pending'`, reasoning disimpan di `notes`).
- **Response Sukses (`201 Created`):**
  ```json
  {
    "status": "success",
    "message": "Analisis kompetensi proyek berhasil diselesaikan.",
    "data": {
      "id": 15,
      "project_id": 12,
      "summary": "Proyek ini mengimplementasikan web e-commerce berbasis REST API dengan pengelolaan database relasional.",
      "feedback": "Disarankan untuk menambahkan unit testing otomatis untuk menguji alur checkout.",
      "status": "completed",
      "skills": [
        {
          "skill_id": 1,
          "skill_name": "JavaScript",
          "category": "Frontend",
          "proficiency_level": "intermediate",
          "score": 75,
          "reasoning": "Logika bisnis dan manipulasi DOM diimplementasikan menggunakan JavaScript modern.",
          "evidence": "Tercantum pada repositori proyek.",
          "analysis_skill_id": 31,
          "user_skill_id": 8,
          "user_skill_status": "needs_review",
          "assessment_id": 42,
          "review_status": "pending"
        }
      ],
      "uncataloged_skills": [],
      "raw_response": { ... },
      "created_at": "2026-11-04T05:30:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Deskripsi proyek kosong atau URL bukti tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Proyek tidak ditemukan atau bukan milik pengguna.
  - `409 Conflict`: `"Analisis untuk proyek ini sedang berjalan. Harap tunggu beberapa saat."`
  - `429 Too Many Requests`: Kuota frekuensi provider AI terlampaui (*rate limit*).
  - `503 Service Unavailable`: Layanan AI belum dikonfigurasi (`AI_API_KEY` tidak tersedia).
  - `504 Gateway Timeout`: Permintaan ke provider AI melampaui batas waktu (30 detik).

---

#### 11. GET `/api/projects/[id]/analyses`

- **Tujuan:** Mengambil riwayat seluruh sesi analisis AI yang pernah dijalankan untuk proyek tertentu milik pengguna.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Proyek.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 15,
        "project_id": 12,
        "summary": "Proyek ini mengimplementasikan web e-commerce...",
        "feedback": "Disarankan untuk menambahkan unit testing...",
        "status": "completed",
        "total_skills": 2,
        "created_at": "2026-11-04T05:30:00.000Z"
      }
    ]
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID proyek tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Proyek tidak ditemukan.

---

#### 12. GET `/api/projects/[id]/analyses/[analysisId]`

- **Tujuan:** Mengambil detail lengkap satu sesi analisis AI beserta daftar skill dan penalaran teknis AI.
- **Autentikasi:** Wajib.
- **Path Parameters:**
  - `id` (integer positif) — ID Proyek.
  - `analysisId` (integer positif) — ID Sesi Analisis.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 15,
      "project_id": 12,
      "summary": "Proyek ini mengimplementasikan web e-commerce...",
      "feedback": "Disarankan untuk menambahkan unit testing...",
      "status": "completed",
      "created_at": "2026-11-04T05:30:00.000Z",
      "skills": [
        {
          "id": 31,
          "skill_id": 1,
          "skill_name": "JavaScript",
          "category": "Frontend",
          "proficiency_level": "intermediate",
          "score": 75,
          "reasoning": "Logika bisnis dan manipulasi DOM diimplementasikan...",
          "created_at": "2026-11-04T05:30:00.000Z"
        }
      ],
      "raw_response": { ... }
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID parameter tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Detail analisis tidak ditemukan atau bukan milik Anda.

---

### D. Katalog Master Skill (Master Skills)

---

#### 13. GET `/api/skills`

- **Tujuan:** Mengambil daftar katalog master kompetensi resmi SkillProof dengan dukungan pencarian nama, filter kategori, dan paginasi.
- **Autentikasi:** Tidak diperlukan (Publik).
- **Query Parameters:**
  | Parameter | Tipe | Default | Keterangan |
  |---|---|---|---|
  | `page` | integer | `1` | Nomor halaman (bilangan bulat positif). |
  | `limit` | integer | `20` | Jumlah item per halaman (1 hingga 100). |
  | `search` atau `q` | string | `""` | Kata kunci pencarian nama skill (maks 100 karakter). |
  | `category` | string | `""` | Filter kategori spesifik, misal `Frontend`, `Backend`, `Database`. |

- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 1,
        "name": "JavaScript",
        "category": "Frontend",
        "created_at": "2026-10-27T15:00:00.000Z"
      },
      {
        "id": 4,
        "name": "Node.js",
        "category": "Backend",
        "created_at": "2026-10-27T15:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 10,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Parameter query tidak valid (misal `limit` > 100 atau `page` <= 0).

---

### E. Profil Skill Pengguna (User Skills)

---

#### 14. GET `/api/user-skills`

- **Tujuan:** Mengambil daftar skill milik profil pengguna aktif.
- **Autentikasi:** Wajib.
- **Query Parameters:**
  | Parameter | Tipe | Default | Nilai yang Diizinkan | Keterangan |
  |---|---|---|---|---|
  | `status` | string | `'active'` | `'active'`, `'needs_review'`, `'rejected'`, `'all'` | Filter status kompetensi pengguna. |
  | `category` | string | `""` | Nama kategori (maks 50) | Filter kategori master skill. |
  | `search` atau `q` | string | `""` | Teks pencarian (maks 100) | Pencarian nama skill. |
  | `page` | integer | `1` | Bilangan bulat positif | Nomor halaman. |
  | `limit` | integer | `20` | `1` - `100` | Jumlah data per halaman. |

- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 8,
        "user_id": 7,
        "skill_id": 1,
        "skill_name": "JavaScript",
        "category": "Frontend",
        "proficiency_level": "intermediate",
        "score": 80,
        "status": "active",
        "created_at": "2026-11-04T05:30:00.000Z",
        "updated_at": "2026-11-04T05:35:00.000Z",
        "total_assessments": 2
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Parameter query tidak valid.
  - `401 Unauthorized`: Belum login.

---

#### 15. POST `/api/user-skills`

- **Tujuan:** Menambahkan skill ke profil pengguna secara manual.
- **Autentikasi:** Wajib.
- **Aturan Bisnis:**
  - Skill langsung berstatus `active`.
  - Otomatis mencatat riwayat penilaian di `user_skill_assessments` dengan `source_type: 'manual'` dan `review_status: 'accepted'`.
  - Jika skill sudah ada dan aktif, server menolak duplikasi dengan status `409 Conflict`.
  - Jika skill sebelumnya berstatus `needs_review` atau `rejected`, skill diaktifkan kembali.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "skill_id": 1,
    "proficiency_level": "intermediate",
    "score": 80,
    "notes": "Pengalaman membangun aplikasi web pribadi selama 1 tahun."
  }
  ```
  | Field | Tipe | Status | Aturan Validasi |
  |---|---|---|---|
  | `skill_id` | integer | Wajib | ID skill resmi yang ada di tabel master `skills`. |
  | `proficiency_level` | string | Wajib | Harus salah satu dari: `'beginner'`, `'intermediate'`, `'advanced'`. |
  | `score` | integer | Wajib | Bilangan bulat antara `0` hingga `100`. |
  | `notes` | string | Opsional | Catatan pengguna (maks 1000 karakter). |

- **Response Sukses (`201 Created`):**
  ```json
  {
    "status": "success",
    "message": "Skill berhasil ditambahkan ke profil pengguna.",
    "data": {
      "id": 8,
      "user_id": 7,
      "skill_id": 1,
      "skill_name": "JavaScript",
      "category": "Frontend",
      "proficiency_level": "intermediate",
      "score": 80,
      "status": "active",
      "assessment": {
        "id": 45,
        "source_type": "manual",
        "proficiency_level": "intermediate",
        "score": 80,
        "notes": "Pengalaman membangun aplikasi web pribadi selama 1 tahun.",
        "review_status": "accepted"
      }
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Validasi gagal (skor di luar 0–100, level salah, atau field wajib kurang).
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Skill tidak ditemukan dalam katalog master.
  - `409 Conflict`: `"Skill ini sudah ada dalam profil aktif Anda. Gunakan fitur koreksi skill untuk memperbarui level atau skor."`

---

#### 16. GET `/api/user-skills/[id]`

- **Tujuan:** Mengambil detail satu skill di profil pengguna beserta riwayat lengkap assessment (AI dan manual).
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID `user_skills`.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 8,
      "user_id": 7,
      "skill_id": 1,
      "skill_name": "JavaScript",
      "category": "Frontend",
      "proficiency_level": "intermediate",
      "score": 80,
      "status": "active",
      "created_at": "2026-11-04T05:30:00.000Z",
      "updated_at": "2026-11-04T05:35:00.000Z",
      "assessments": [
        {
          "id": 45,
          "source_type": "manual",
          "analysis_skill_id": null,
          "proficiency_level": "intermediate",
          "score": 80,
          "notes": "Pengalaman membangun aplikasi...",
          "review_status": "accepted",
          "created_at": "2026-11-04T05:35:00.000Z",
          "project_id": null,
          "project_title": null,
          "ai_reasoning": null
        },
        {
          "id": 42,
          "source_type": "ai",
          "analysis_skill_id": 31,
          "proficiency_level": "intermediate",
          "score": 75,
          "notes": "Logika bisnis dan manipulasi DOM...",
          "review_status": "pending",
          "created_at": "2026-11-04T05:30:00.000Z",
          "project_id": 12,
          "project_title": "Aplikasi E-Commerce SkillProof",
          "ai_reasoning": "Logika bisnis dan manipulasi DOM..."
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID skill tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Skill tidak ditemukan atau bukan milik Anda.

---

#### 17. PATCH `/api/user-skills/[id]`

- **Tujuan:** Mengoreksi level dan/atau skor untuk skill berstatus **aktif**.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID `user_skills`.
- **Aturan Bisnis:**
  - Hanya boleh memodifikasi skill yang berstatus `active`.
  - Tidak mengganggu atau menimpa assessment AI pending.
  - Secara otomatis menambahkan entri riwayat assessment manual baru (`review_status: 'accepted'`).
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "proficiency_level": "advanced",
    "score": 90,
    "notes": "Peningkatan skor setelah menyelesaikan sertifikasi profesional."
  }
  ```
  | Field | Tipe | Status | Aturan Validasi |
  |---|---|---|---|
  | `proficiency_level` | string | Opsional | `'beginner'`, `'intermediate'`, atau `'advanced'`. |
  | `score` | integer | Opsional | `0` hingga `100`. |
  | `notes` | string | Opsional | Catatan koreksi (maks 1000 karakter). |
  *(Minimal salah satu dari `proficiency_level`, `score`, atau `notes` harus disertakan).*

- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Skill berhasil diperbarui.",
    "data": {
      "id": 8,
      "user_id": 7,
      "skill_id": 1,
      "skill_name": "JavaScript",
      "category": "Frontend",
      "proficiency_level": "advanced",
      "score": 90,
      "status": "active",
      "assessment": {
        "id": 48,
        "source_type": "manual",
        "proficiency_level": "advanced",
        "score": 90,
        "notes": "Peningkatan skor setelah menyelesaikan sertifikasi profesional.",
        "review_status": "accepted"
      }
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Skill tidak berstatus aktif atau parameter koreksi tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Skill tidak ditemukan atau bukan milik pengguna.

---

#### 18. DELETE `/api/user-skills/[id]`

- **Tujuan:** Menghapus skill dari profil pengguna secara *soft delete*.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID `user_skills`.
- **Aturan Konsistensi Riwayat:**
  - Endpoint ini **tidak melakukan hard delete** agar seluruh data audit penilaian AI dan manual tidak hilang.
  - Mengubah status `user_skills` menjadi `'rejected'`.
  - Skill berstatus `'rejected'` tidak akan muncul pada daftar kompetensi aktif pengguna.
  - Jika skill sudah berstatus `'rejected'`, server merespons dengan HTTP 400.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Skill berhasil dinonaktifkan dari profil pengguna."
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID tidak valid atau skill sudah berstatus non-aktif.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Skill tidak ditemukan atau bukan milik pengguna.

---

### F. Peninjauan Rekomendasi AI (AI Assessment Review)

---

#### 19. GET `/api/user-skills/assessments`

- **Tujuan:** Menampilkan daftar penilaian kompetensi yang perlu ditinjau (*review*) oleh pengguna aktif.
- **Autentikasi:** Wajib.
- **Query Parameters:**
  | Parameter | Tipe | Default | Nilai yang Diizinkan | Keterangan |
  |---|---|---|---|---|
  | `status` | string | `'pending'` | `'pending'`, `'accepted'`, `'rejected'`, `'all'` | Status peninjauan assessment. |
  | `source_type` | string | `'all'` | `'all'`, `'ai'`, `'manual'` | Sumber penilaian. |
  | `page` | integer | `1` | Bilangan bulat positif | Nomor halaman. |
  | `limit` | integer | `20` | `1` - `100` | Jumlah data per halaman. |

- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 42,
        "user_skill_id": 8,
        "source_type": "ai",
        "analysis_skill_id": 31,
        "proficiency_level": "intermediate",
        "score": 75,
        "notes": "Logika bisnis dan manipulasi DOM diimplementasikan menggunakan JavaScript modern.",
        "review_status": "pending",
        "created_at": "2026-11-04T05:30:00.000Z",
        "skill_id": 1,
        "skill_name": "JavaScript",
        "skill_category": "Frontend",
        "user_skill_status": "needs_review",
        "current_active_level": null,
        "current_active_score": null,
        "project_id": 12,
        "project_title": "Aplikasi E-Commerce SkillProof",
        "ai_reasoning": "Logika bisnis dan manipulasi DOM diimplementasikan menggunakan JavaScript modern."
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Parameter query tidak valid.
  - `401 Unauthorized`: Belum login.

---

#### 20. GET `/api/user-skills/assessments/[id]`

- **Tujuan:** Mengambil detail satu penilaian kompetensi beserta konteks proyek dan penalaran AI.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Assessment.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 42,
      "user_skill_id": 8,
      "source_type": "ai",
      "analysis_skill_id": 31,
      "proficiency_level": "intermediate",
      "score": 75,
      "notes": "Logika bisnis dan manipulasi DOM diimplementasikan menggunakan JavaScript modern.",
      "review_status": "pending",
      "created_at": "2026-11-04T05:30:00.000Z",
      "skill_id": 1,
      "skill_name": "JavaScript",
      "skill_category": "Frontend",
      "user_skill_status": "needs_review",
      "current_active_level": null,
      "current_active_score": null,
      "project_id": 12,
      "project_title": "Aplikasi E-Commerce SkillProof",
      "ai_reasoning": "Logika bisnis dan manipulasi DOM diimplementasikan menggunakan JavaScript modern.",
      "analysis_id": 15,
      "analyzed_at": "2026-11-04T05:30:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID assessment tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Assessment tidak ditemukan atau bukan milik pengguna.

---

#### 21. POST `/api/user-skills/assessments/[id]/accept`

- **Tujuan:** Menyetujui rekomendasi penilaian AI.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Assessment.
- **Aturan Bisnis:**
  - Hanya dapat dijalankan untuk assessment yang berstatus `'pending'`.
  - Jika body kosong, sistem menggunakan nilai rekomendasi AI (`proficiency_level` & `score` asli dari AI).
  - Pengguna dapat menyertakan koreksi `proficiency_level` dan/atau `score` di body jika tidak setuju dengan nilai AI.
  - Secara transaksional mengubah:
    - `user_skill_assessments.review_status` -> `'accepted'`
    - `user_skills.status` -> `'active'`
    - `user_skills.proficiency_level` & `score` -> diperbarui dengan nilai yang disetujui.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:** (Opsional, kosongkan jika menerima apa adanya)
  ```json
  {
    "proficiency_level": "intermediate",
    "score": 80,
    "notes": "Disetujui dengan koreksi nilai skor ke 80."
  }
  ```
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Assessment AI berhasil diterima dan disimpan ke profil aktif.",
    "data": {
      "assessment_id": 42,
      "user_skill_id": 8,
      "skill_id": 1,
      "skill_name": "JavaScript",
      "category": "Frontend",
      "proficiency_level": "intermediate",
      "score": 80,
      "review_status": "accepted",
      "user_skill_status": "active",
      "notes": "Disetujui dengan koreksi nilai skor ke 80."
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Assessment sudah pernah ditinjau sebelumnya (sudah `accepted` atau `rejected`), atau nilai koreksi tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Assessment tidak ditemukan atau bukan milik pengguna.

---

#### 22. POST `/api/user-skills/assessments/[id]/reject`

- **Tujuan:** Menolak rekomendasi penilaian AI.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Assessment.
- **Aturan Bisnis:**
  - Hanya dapat dijalankan untuk assessment berstatus `'pending'`.
  - Mengubah `user_skill_assessments.review_status` menjadi `'rejected'`.
  - **Aturan Penyesuaian Status Profil (Rule 7):**
    - Jika tidak ada assessment lain yang berstatus `'accepted'` dan tidak ada lagi yang tersisa `'pending'`, status `user_skills` otomatis diubah menjadi `'rejected'` (dan level & skor di-`null`-kan) agar tidak tampil sebagai kompetensi aktif.
    - Jika pengguna telah memiliki penilaian `'accepted'` sebelumnya (misal dari input manual atau analisis proyek lain), status `user_skills` **tetap aktif** dengan skor aktif yang lama.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:** (Opsional)
  ```json
  {
    "notes": "Proyek ini hanya tutorial tiruan, belum mencerminkan kompetensi mandiri."
  }
  ```
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Assessment berhasil ditolak.",
    "data": {
      "assessment_id": 42,
      "user_skill_id": 8,
      "skill_id": 1,
      "skill_name": "JavaScript",
      "review_status": "rejected",
      "user_skill_status": "rejected",
      "notes": "Ditolak oleh pengguna saat peninjauan. [Alasan penolakan: Proyek ini hanya tutorial tiruan...]"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Assessment sudah pernah ditinjau sebelumnya.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Assessment tidak ditemukan atau bukan milik pengguna.

---

### G. Health & System Check

---

#### 23. GET `/api/health`

- **Tujuan:** Memeriksa ketersediaan layanan backend dan konektivitas ke database relasional MariaDB.
- **Autentikasi:** Publik (tanpa token / cookie).
- **Request Body:** Tidak ada.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-04T06:48:15.123Z",
    "database": {
      "status": "connected"
    }
  }
  ```
- **Error Responses (`503 Service Unavailable`):**
  - Mengembalikan status 503 jika koneksi database terputus atau pool MySQL gagal melakukan `SELECT 1`.
  ```json
  {
    "status": "unhealthy",
    "timestamp": "2026-11-04T06:48:15.123Z",
    "database": {
      "status": "disconnected",
      "error": "Database connection failed"
    }
  }
  ```

---

### H. Manajemen Profil Mahasiswa (Profile Management)

---

#### 24. GET `/api/profile`

- **Tujuan:** Mengambil data profil lengkap mahasiswa yang sedang login.
- **Autentikasi:** Wajib (cookie `auth_token` atau header Bearer).
- **Request Body:** Tidak ada.
- **Aturan Keamanan:**
  - `password_hash` atau data sensitif kredensial tidak pernah dikembalikan ke client.
  - Data profil diambil dari pengguna yang terverifikasi melalui token sesi.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 1,
      "name": "Mahasiswa Penguji",
      "email": "student@skillproof.edu",
      "bio": "Tertarik pada rekayasa perangkat lunak dan arsitektur backend.",
      "avatar_url": "https://images.example.com/avatar.png",
      "created_at": "2026-10-27T11:59:12.000Z",
      "updated_at": "2026-11-04T10:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Token tidak ada, rusak, atau sesi telah kedaluwarsa.

---

#### 25. PUT `/api/profile`

- **Tujuan:** Memperbarui atribut profil mahasiswa (nama, bio, dan/atau avatar URL).
- **Autentikasi:** Wajib (cookie `auth_token` atau header Bearer).
- **Request Headers:** `Content-Type: application/json`
- **Aturan Validasi Input:**
  - `name` (wajib): string, panjang antara 2 hingga 100 karakter setelah di-*trim*.
  - `bio` (opsional): string atau `null`, maksimal 1.000 karakter. Jika dikirim `null` atau string kosong `""`, nilai bio akan dikosongkan (`null`).
  - `avatar_url` (opsional): string atau `null`, maksimal 255 karakter. Wajib berupa URL absolut valid dengan protokol `http:` atau `https:` (divalidasi menggunakan URL parser). Jika dikirim `null` atau `""`, URL avatar akan dikosongkan (`null`).
  - `email`: **Tidak dapat diubah melalui endpoint ini** untuk menjaga integritas kredensial dan alur autentikasi akun. Jika field `email` disertakan dalam request body, nilainya akan diabaikan dan email akun tidak akan berubah.
  - Field yang tidak dikirim (`undefined`) tidak akan menghapus nilai yang sudah ada di database.
- **Request Body:**
  ```json
  {
    "name": "Mahasiswa Terupdate",
    "bio": "Pengembang fullstack berorientasi AI dan distributed system.",
    "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb"
  }
  ```
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Profil berhasil diperbarui.",
    "data": {
      "id": 1,
      "name": "Mahasiswa Terupdate",
      "email": "student@skillproof.edu",
      "bio": "Pengembang fullstack berorientasi AI dan distributed system.",
      "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
      "created_at": "2026-10-27T11:59:12.000Z",
      "updated_at": "2026-11-04T10:15:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Payload JSON tidak valid, nama kurang dari 2 atau lebih dari 100 karakter, atau protokol URL avatar bukan HTTP/HTTPS.
  - `401 Unauthorized`: Belum login.

---

### I. Manajemen Target Karier (Career Target Management)

---

#### 26. GET `/api/career-targets`

- **Tujuan:** Mengambil seluruh target karier milik mahasiswa yang sedang login beserta kebutuhan kompetensi (`target_skills`) dan jumlah skill (`skills_count`).
- **Autentikasi:** Wajib.
- **Aturan Isolasi:** Hanya menampilkan target karier milik pengguna yang terautentikasi (`user_id = authenticated.id`).
- **Request Body:** Tidak ada.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 1,
        "title": "Junior Backend Developer",
        "description": "Fokus pada arsitektur RESTful API dan database relasional.",
        "skills_count": 3,
        "target_skills": [
          {
            "id": 10,
            "skill_id": 4,
            "skill_name": "Node.js",
            "category": "Backend",
            "expected_proficiency_level": "intermediate",
            "expected_score": 75
          },
          {
            "id": 11,
            "skill_id": 6,
            "skill_name": "REST API",
            "category": "Backend",
            "expected_proficiency_level": "advanced",
            "expected_score": 85
          },
          {
            "id": 12,
            "skill_id": 7,
            "skill_name": "MySQL",
            "category": "Database",
            "expected_proficiency_level": "intermediate",
            "expected_score": 70
          }
        ],
        "created_at": "2026-11-04T10:00:00.000Z",
        "updated_at": "2026-11-04T10:00:00.000Z"
      }
    ]
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Belum login.

---

#### 27. POST `/api/career-targets`

- **Tujuan:** Membuat target karier baru beserta kebutuhan kompetensi awalnya dalam **1 transaksi database atomik**.
- **Autentikasi:** Wajib.
- **Request Headers:** `Content-Type: application/json`
- **Aturan Validasi Input:**
  - `title` (wajib): string, 2–150 karakter. Judul harus unik untuk setiap pengguna (`uq_career_targets_user_title`).
  - `description` (opsional): string atau `null`, maksimal 2.000 karakter.
  - `target_skills` (opsional): array objek skill yang dibutuhkan.
    - `skill_id` (wajib): integer positif, wajib terdaftar di katalog master `skills`.
    - Tidak boleh ada `skill_id` duplikat dalam satu request body.
    - `expected_proficiency_level` (opsional): salah satu dari `'beginner'`, `'intermediate'`, `'advanced'` (default: `'intermediate'`).
    - `expected_score` (opsional): integer antara `0` hingga `100`, atau `null`.
- **Perilaku Transaksi:**
  - Menyimpan baris target di `career_targets` dan seluruh item skill di `career_target_skills` dalam satu transaksi. Jika salah satu skill gagal disimpan, seluruh operasi dibatalkan (*full rollback*).
- **Request Body:**
  ```json
  {
    "title": "Junior Backend Developer",
    "description": "Fokus pada arsitektur RESTful API dan database relasional.",
    "target_skills": [
      {
        "skill_id": 4,
        "expected_proficiency_level": "intermediate",
        "expected_score": 75
      },
      {
        "skill_id": 6,
        "expected_proficiency_level": "advanced",
        "expected_score": 85
      }
    ]
  }
  ```
- **Response Sukses (`201 Created`):**
  ```json
  {
    "status": "success",
    "message": "Target karier berhasil dibuat.",
    "data": {
      "id": 1,
      "title": "Junior Backend Developer",
      "description": "Fokus pada arsitektur RESTful API dan database relasional.",
      "skills_count": 2,
      "target_skills": [
        {
          "id": 1,
          "skill_id": 4,
          "skill_name": "Node.js",
          "category": "Backend",
          "expected_proficiency_level": "intermediate",
          "expected_score": 75
        },
        {
          "id": 2,
          "skill_id": 6,
          "skill_name": "REST API",
          "category": "Backend",
          "expected_proficiency_level": "advanced",
          "expected_score": 85
        }
      ],
      "created_at": "2026-11-04T10:00:00.000Z",
      "updated_at": "2026-11-04T10:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Judul kosong/tidak valid, `skill_id` tidak ada di master `skills`, `skill_id` duplikat dalam request, level kemahiran tidak valid, atau expected score di luar 0–100.
  - `401 Unauthorized`: Belum login.
  - `409 Conflict`: Target karier dengan judul tersebut sudah ada pada akun pengguna.

---

#### 28. GET `/api/career-targets/[id]`

- **Tujuan:** Mengambil detail satu target karier beserta rincian kompetensi yang dibutuhkan.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Hak Akses & Isolasi Data:**
  - Target karier harus milik pengguna yang login (`WHERE id = ? AND user_id = ?`).
  - Jika ID tidak ditemukan atau merupakan milik pengguna lain, server mengembalikan status `404 Not Found`.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 1,
      "title": "Junior Backend Developer",
      "description": "Fokus pada arsitektur RESTful API dan database relasional.",
      "skills_count": 2,
      "target_skills": [
        {
          "id": 1,
          "skill_id": 4,
          "skill_name": "Node.js",
          "category": "Backend",
          "expected_proficiency_level": "intermediate",
          "expected_score": 75
        },
        {
          "id": 2,
          "skill_id": 6,
          "skill_name": "REST API",
          "category": "Backend",
          "expected_proficiency_level": "advanced",
          "expected_score": 85
        }
      ],
      "created_at": "2026-11-04T10:00:00.000Z",
      "updated_at": "2026-11-04T10:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID bukan integer positif.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Target karier tidak ditemukan atau bukan milik pengguna.

---

#### 29. PUT `/api/career-targets/[id]`

- **Tujuan:** Memperbarui data target karier dan mengelola daftar kebutuhan skill secara atomik.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Perilaku Penggantian `target_skills`:**
  - **Jika `target_skills` tidak dikirimkan (`undefined`):** Daftar skill yang sudah tersimpan dipertahankan tanpa perubahan.
  - **Jika `target_skills` dikirimkan berupa array kosong (`[]`):** Seluruh relasi skill pada target ini dihapus.
  - **Jika `target_skills` dikirimkan berisi array data:** Seluruh skill lama pada target ini diganti (*replace*) secara atomik dengan daftar skill baru dalam satu transaksi.
- **Request Body:**
  ```json
  {
    "title": "Senior Backend Architect",
    "description": "Fokus pada arsitektur microservices dan distributed caching.",
    "target_skills": [
      {
        "skill_id": 4,
        "expected_proficiency_level": "advanced",
        "expected_score": 90
      },
      {
        "skill_id": 9,
        "expected_proficiency_level": "intermediate",
        "expected_score": 80
      }
    ]
  }
  ```
- **Response Sukses (`200 OK`):** Mengembalikan data target karier mutakhir beserta daftar skill terbarunya.
- **Error Responses:**
  - `400 Bad Request`: ID tidak valid, masukan skill tidak valid, atau `skill_id` tidak terdaftar di master `skills`.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Target karier tidak ditemukan atau bukan milik pengguna.
  - `409 Conflict`: Judul baru yang diinginkan sudah digunakan oleh target karier lain milik pengguna.

---

#### 30. DELETE `/api/career-targets/[id]`

- **Tujuan:** Menghapus satu target karier.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Aturan Integritas Relasional:**
  - Menghapus target karier otomatis menghapus relasi di tabel `career_target_skills` melalui mekanisme `ON DELETE CASCADE`.
  - **Katalog master `skills` TIDAK PERNAH terhapus atau berubah**.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Target karier berhasil dihapus."
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID bukan integer positif.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Target karier tidak ditemukan atau bukan milik pengguna.

---

### J. Analisis Kesenjangan Kompetensi (Skill Gap Analysis)

---

#### 31. GET `/api/career-targets/[id]/gap-analysis`

- **Tujuan:** Menghitung dan menyajikan analisis kesenjangan kompetensi (*skill gap*) secara dinamis dan *real-time* untuk satu target karier tertentu milik mahasiswa.
- **Autentikasi:** Wajib (cookie `auth_token` atau header Bearer).
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Sifat Operasi:** **Murni Read-Only** (tidak ada penulisan atau perubahan data pada database).
- **Aturan Kepemilikan & Hak Akses:**
  - Target karier harus milik pengguna yang sedang terautentikasi (`WHERE id = ? AND user_id = ?`).
  - Target milik pengguna lain atau ID yang tidak ada mengembalikan respons `404 Not Found`.
- **Aturan Evaluasi 4 Status Gap:**
  1. **`fulfilled`**: Pengguna memiliki kompetensi berstatus `'active'` pada `user_skills` yang memenuhi atau melampaui level ordinal target (`beginner`=1, `intermediate`=2, `advanced`=3) DAN skor pengguna $\ge$ `expected_score` (jika `expected_score` bernilai `null`, kelulusan hanya ditentukan oleh level kemahiran).
  2. **`under-qualified`**: Pengguna memiliki kompetensi berstatus `'active'`, namun tingkat kemahiran atau skornya masih di bawah kriteria target karier.
  3. **`pending_review`**: Pengguna belum memiliki kompetensi aktif untuk skill tersebut, namun terdapat rekomendasi AI dari proyek yang berstatus `'pending'` pada `user_skill_assessments`. Jika terdapat lebih dari satu assessment pending, sistem memilih satu yang paling baru berdasarkan `created_at DESC, id DESC`. Rekomendasi AI pending **TIDAK PERNAH** dianggap sebagai kompetensi aktif.
  4. **`missing`**: Pengguna belum memiliki kompetensi aktif maupun assessment pending (termasuk jika skill berstatus `'rejected'`).
- **Aturan Skill Aktif Bersama Pending Assessment:**
  - Jika pengguna memiliki skill aktif dan juga memiliki rekomendasi AI baru yang berstatus pending, **status utama tetap ditentukan oleh skill aktif** (`fulfilled` atau `under-qualified`). Data assessment pending disertakan sebagai atribut informatif `pending_assessment` tanpa mengubah status evaluasi utama.
- **Rumus Persentase Kesiapan:**
  - **`readiness_percentage`** (Kesiapan Terverifikasi Aktual):  
    $$\frac{N_{\text{fulfilled}}}{N_{\text{total}}} \times 100\%$$
  - **`projected_readiness_percentage`** (Kesiapan Terproyeksi / Estimasi):  
    $$\frac{N_{\text{fulfilled}} + (0.5 \times N_{\text{under}})}{N_{\text{total}}} \times 100\%$$  
    *(Catatan: Projected readiness merupakan estimasi kemajuan progresif mahasiswa, bukan bukti kompetensi yang terverifikasi industri).*
  - **Kasus Target Tanpa Requirement ($N_{\text{total}} = 0$):**  
    Kedua persentase bernilai `0.0`, `has_requirements: false`, dan `skills: []`.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "career_target": {
        "id": 1,
        "title": "Junior Backend Developer",
        "description": "Fokus pada arsitektur RESTful API dan basis data relasional.",
        "created_at": "2026-11-04T10:00:00.000Z",
        "updated_at": "2026-11-04T10:00:00.000Z"
      },
      "summary": {
        "total_skills": 4,
        "fulfilled_count": 2,
        "under_qualified_count": 1,
        "pending_review_count": 1,
        "missing_count": 0,
        "readiness_percentage": 50.0,
        "projected_readiness_percentage": 62.5,
        "has_requirements": true,
        "message": "Analisis kesenjangan kompetensi berhasil dihitung."
      },
      "skills": [
        {
          "skill_id": 4,
          "skill_name": "Node.js",
          "category": "Backend",
          "target_requirement": {
            "expected_proficiency_level": "intermediate",
            "expected_score": 75
          },
          "user_competency": {
            "user_skill_id": 3,
            "status": "active",
            "proficiency_level": "intermediate",
            "score": 80,
            "updated_at": "2026-11-04T10:15:00.000Z"
          },
          "gap_status": "fulfilled",
          "notes": "Kompetensi aktif memenuhi kriteria target karier."
        },
        {
          "skill_id": 6,
          "skill_name": "REST API",
          "category": "Backend",
          "target_requirement": {
            "expected_proficiency_level": "advanced",
            "expected_score": 85
          },
          "user_competency": {
            "user_skill_id": 4,
            "status": "active",
            "proficiency_level": "beginner",
            "score": 60,
            "updated_at": "2026-11-04T10:15:00.000Z"
          },
          "gap_status": "under-qualified",
          "notes": "Tingkat kemahiran pengguna (beginner) masih di bawah target (advanced)."
        },
        {
          "skill_id": 7,
          "skill_name": "MySQL",
          "category": "Database",
          "target_requirement": {
            "expected_proficiency_level": "intermediate",
            "expected_score": 70
          },
          "user_competency": {
            "user_skill_id": null,
            "status": "needs_review",
            "proficiency_level": null,
            "score": null,
            "pending_assessment": {
              "assessment_id": 12,
              "source_type": "ai",
              "proficiency_level": "intermediate",
              "score": 75,
              "notes": "Terdeteksi dari proyek implementasi basis data",
              "created_at": "2026-11-04T10:20:00.000Z",
              "total_pending": 1
            }
          },
          "gap_status": "pending_review",
          "notes": "Terdapat rekomendasi AI yang menunggu peninjauan pengguna."
        },
        {
          "skill_id": 9,
          "skill_name": "Docker",
          "category": "DevOps",
          "target_requirement": {
            "expected_proficiency_level": "beginner",
            "expected_score": 60
          },
          "user_competency": null,
          "gap_status": "missing",
          "notes": "Belum ada bukti proyek atau kompetensi terkait skill ini."
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID bukan integer positif.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Target karier tidak ditemukan atau bukan milik pengguna.

---

#### 32. GET `/api/career-targets/gap-analysis`

- **Tujuan:** Mengambil ringkasan analisis kesenjangan kompetensi untuk **seluruh** target karier milik mahasiswa yang sedang login.
- **Autentikasi:** Wajib.
- **Sifat Operasi:** Murni Read-Only.
- **Resolusi Routing:** Rute ini merupakan segmen statis eksplisit pada `/api/career-targets/gap-analysis` dan diprioritaskan di atas rute dinamis `[id]` oleh Next.js App Router.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": [
      {
        "career_target": {
          "id": 1,
          "title": "Junior Backend Developer",
          "description": "Fokus pada arsitektur RESTful API dan basis data relasional.",
          "created_at": "2026-11-04T10:00:00.000Z",
          "updated_at": "2026-11-04T10:00:00.000Z"
        },
        "summary": {
          "total_skills": 4,
          "fulfilled_count": 2,
          "under_qualified_count": 1,
          "pending_review_count": 1,
          "missing_count": 0,
          "readiness_percentage": 50.0,
          "projected_readiness_percentage": 62.5,
          "has_requirements": true,
          "message": "Analisis kesenjangan kompetensi berhasil dihitung."
        },
        "skills": [ ... ]
      }
    ]
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Belum login.

---

### K. Rekomendasi Kursus dan Proyek (Course & Project Recommendations)

Fitur rekomendasi pada SkillProof memanfaatkan hasil evaluasi **Skill Gap Analysis** aktual dan model AI secara dinamis tanpa penulisan ke database (murni *read-only*).

#### Aturan Bisnis & Integritas Rekomendasi:
1. **Fokus Kesenjangan (Gap-Focused):**
   - Rekomendasi kursus dan proyek portofolio difokuskan **HANYA** pada kompetensi yang berstatus `under-qualified` atau `missing`.
   - Skill yang sudah terpenuhi (`fulfilled`) **TIDAK PERNAH** direkomendasikan ulang.
   - Skill yang masih berstatus `pending_review` bukan kompetensi aktif yang diakui, namun juga bukan kesenjangan definitif utama yang memerlukan kursus baru hingga pengguna meninjau hasil asesmen tersebut.
2. **Aturan "Goal Reached" (Target Telah Terpenuhi):**
   - Jika seluruh kriteria kompetensi pada target karier telah berstatus `fulfilled` (100% kesiapan), sistem **TIDAK MEMANGGIL** provider AI sama sekali.
   - Mengembalikan respons HTTP 200 dengan `status: "goal_reached"`, pesan apresiasi, serta array `courses: []` dan `projects: []`.
3. **Aturan "No Requirements" (Target Tanpa Kriteria):**
   - Jika target karier belum memiliki kriteria kompetensi ($N=0$), sistem **TIDAK MEMANGGIL** provider AI.
   - Mengembalikan respons HTTP 400 dengan pesan error: `"Target karier belum memiliki kriteria kompetensi."`.
4. **Allowlist Platform Resmi:**
   - Platform kursus divalidasi secara ketat dan wajib termasuk dalam daftar resmi berikut:
     `Coursera`, `edX`, `Udemy`, `Dicoding`, `freeCodeCamp`, `The Odin Project`, `MDN Web Docs`, `Docker Docs`, `PostgreSQL Docs`, `Official Documentation`, `AWS Skill Builder`, `Google Cloud Skills Boost`.
   - Platform di luar allowlist akan ditolak oleh sistem validasi.
5. **Kebijakan Tautan URL (Safe URL Policy):**
   - Menggunakan URL terverifikasi atau fallback ke portal beranda resmi platform (misal `https://www.coursera.org`, `https://www.freecodecamp.org`, `https://developer.mozilla.org`) untuk menghindari *broken link* atau halusinasi AI.
6. **Sifat Operasi:** Murni *Read-Only* (tidak menulis rekomendasi ke database, tidak menambah baris baru, dan tidak mengubah status kompetensi pengguna).

---

#### 33. GET `/api/career-targets/[id]/recommendations`

- **Tujuan:** Menghasilkan rekomendasi gabungan materi kursus terstruktur dan ide proyek portofolio AI untuk menutup kesenjangan kompetensi pengguna menuju target karier terkait.
- **Autentikasi:** Wajib (cookie `auth_token` atau header Bearer).
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Response Sukses (`200 OK` - Rekomendasi Dihasilkan):**
  ```json
  {
    "status": "success",
    "data": {
      "career_target": {
        "id": 1,
        "title": "Senior Frontend Specialist",
        "description": "Target karier frontend dengan fokus React dan arsitektur modular."
      },
      "gap_summary": {
        "total_skills": 4,
        "fulfilled_count": 1,
        "under_qualified_count": 1,
        "pending_review_count": 1,
        "missing_count": 1,
        "readiness_percentage": 25.0
      },
      "gap_skills": [
        {
          "skill_id": 2,
          "skill_name": "React",
          "category": "Frontend",
          "expected_level": "advanced",
          "expected_score": 85,
          "current_level": "intermediate",
          "current_score": 70,
          "gap_status": "under-qualified"
        },
        {
          "skill_id": 9,
          "skill_name": "Docker",
          "category": "DevOps",
          "expected_level": "beginner",
          "expected_score": 60,
          "current_level": null,
          "current_score": null,
          "gap_status": "missing"
        }
      ],
      "courses": [
        {
          "title": "Mastering Advanced React and Concurrent Patterns",
          "platform": "Coursera",
          "skill_name": "React",
          "level": "advanced",
          "description": "Mendalami concurrent features, hooks custom kompleks, dan optimasi render React.",
          "url": "https://www.coursera.org",
          "estimated_duration": "6 minggu"
        },
        {
          "title": "Docker for Web Developers from Scratch",
          "platform": "freeCodeCamp",
          "skill_name": "Docker",
          "level": "beginner",
          "description": "Dasar containerization, pembuatan Dockerfile, dan docker-compose untuk lingkungan web.",
          "url": "https://www.freecodecamp.org",
          "estimated_duration": "15 jam"
        }
      ],
      "projects": [
        {
          "title": "Enterprise High-Performance Dashboard & Containerized Microservices",
          "description": "Membangun aplikasi web dashboard interaktif dengan arsitektur React mutakhir dan deployment Docker terisolasi.",
          "difficulty_level": "advanced",
          "target_skills": ["React", "Docker"],
          "key_features": [
            "State management terpusat dengan optimasi rendering reaktif",
            "Container multi-stage build untuk efisiensi bundle image",
            "Monitoring performa web vitals secara real-time"
          ],
          "suggested_evidences": [
            "Repositori GitHub publik dengan clean code dan dokumentasi arsitektur",
            "Dockerfile dan konfigurasi docker-compose siap pakai",
            "Demo aplikasi live yang dapat diakses publik"
          ],
          "expected_outcome": "Penguasaan arsitektur frontend tingkat lanjut dan deployment kontainer modern."
        }
      ]
    }
  }
  ```

- **Response Sukses (`200 OK` - Kondisi Goal Reached / Seluruh Kompetensi Terpenuhi):**
  ```json
  {
    "status": "success",
    "data": {
      "career_target": {
        "id": 1,
        "title": "JavaScript Core Master",
        "description": "Target khusus penguasaan JavaScript."
      },
      "gap_summary": {
        "total_skills": 1,
        "fulfilled_count": 1,
        "under_qualified_count": 0,
        "pending_review_count": 0,
        "missing_count": 0,
        "readiness_percentage": 100.0
      },
      "status": "goal_reached",
      "message": "Selamat! Seluruh kriteria kompetensi untuk target karier ini telah terpenuhi.",
      "gap_skills": [],
      "courses": [],
      "projects": []
    }
  }
  ```

- **Error Responses:**
  - `400 Bad Request`: ID target karier bukan integer positif, ATAU target karier belum memiliki kriteria kompetensi (`"Target karier belum memiliki kriteria kompetensi."`).
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Target karier tidak ditemukan atau bukan milik pengguna yang sedang terautentikasi.
  - `429 Too Many Requests`: Provider AI mencapai batas kuota (*rate limit*).
  - `502 Bad Gateway`: Respons provider AI gagal divalidasi atau bukan format JSON yang diharapkan.
  - `503 Service Unavailable`: Kunci API provider AI (`AI_API_KEY`) belum terpasang pada konfigurasi server.
  - `504 Gateway Timeout`: Permintaan ke layanan AI melampaui batas waktu (*timeout* 30 detik).
  - `500 Internal Server Error`: Terjadi kesalahan pada server saat memproses rekomendasi.

---

#### 34. GET `/api/career-targets/[id]/recommendations/courses`

- **Tujuan:** Menghasilkan rekomendasi materi kursus terstruktur khusus untuk menutup kesenjangan kompetensi pengguna.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Struktur Respons:** Format identik dengan endpoint `#33`, namun hanya menyertakan array `courses` tanpa atribut `projects`.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "career_target": { "id": 1, "title": "Senior Frontend Specialist", ... },
      "gap_summary": { ... },
      "gap_skills": [ ... ],
      "courses": [
        {
          "title": "Mastering Advanced React and Concurrent Patterns",
          "platform": "Coursera",
          "skill_name": "React",
          "level": "advanced",
          "description": "Mendalami concurrent features dan optimasi render React.",
          "url": "https://www.coursera.org",
          "estimated_duration": "6 minggu"
        }
      ]
    }
  }
  ```
- **Error Responses:** Mengikuti kode error standar (`400`, `401`, `404`, `429`, `502`, `503`, `504`, `500`).

---

#### 35. GET `/api/career-targets/[id]/recommendations/projects`

- **Tujuan:** Menghasilkan ide proyek portofolio AI praktis dan realistis khusus untuk menutup kesenjangan kompetensi pengguna.
- **Autentikasi:** Wajib.
- **Path Parameter:** `id` (integer positif) — ID Target Karier.
- **Struktur Respons:** Format identik dengan endpoint `#33`, namun hanya menyertakan array `projects` tanpa atribut `courses`.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "career_target": { "id": 1, "title": "Senior Frontend Specialist", ... },
      "gap_summary": { ... },
      "gap_skills": [ ... ],
      "projects": [
        {
          "title": "Enterprise High-Performance Dashboard & Containerized Microservices",
          "description": "Membangun aplikasi web dashboard interaktif dengan arsitektur React mutakhir dan deployment Docker terisolasi.",
          "difficulty_level": "advanced",
          "target_skills": ["React", "Docker"],
          "key_features": [ ... ],
          "suggested_evidences": [ ... ],
          "expected_outcome": "Penguasaan arsitektur frontend tingkat lanjut dan deployment kontainer modern."
        }
      ]
    }
  }
  ```
- **Error Responses:** Mengikuti kode error standar (`400`, `401`, `404`, `429`, `502`, `503`, `504`, `500`).

---

### L. Perkembangan Kompetensi (Competency Progress)

Modul Perkembangan Kompetensi menyediakan API analitik *read-only* untuk memantau akumulasi keahlian mahasiswa, distribusi tingkat kemahiran (*proficiency level*), rata-rata skor performa, linimasa kronologis penilaian (*assessment timeline*), dan evaluasi progres kesiapan terhadap target karier.

---

#### 36. GET `/api/competency-progress`

- **Tujuan:** Menampilkan ringkasan menyeluruh perkembangan kompetensi pengguna yang sedang login.
- **Autentikasi:** Wajib (`auth_token` Cookie atau `Authorization: Bearer <token>`).
- **Query Parameter:** Tidak ada.
- **Karakteristik Data:**
  - Hanya memperhitungkan skill dengan status `active` pada `user_skills`.
  - Hanya memperhitungkan riwayat penilaian dengan `review_status = 'accepted'` pada `user_skill_assessments`.
  - `average_score`: Rata-rata terhitung hanya pada skill aktif yang memiliki nilai skor numerik (`score != null`). Jika belum ada skill dengan skor, bernilai `null`.
  - `recent_accepted_assessments`: Maksimal 5 riwayat penilaian berstatus *accepted* terbaru (terurut `created_at DESC, id DESC`), lengkap dengan tautan proyek jika bersumber dari AI.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "summary": {
        "total_active_skills": 3,
        "level_distribution": {
          "beginner": 1,
          "intermediate": 1,
          "advanced": 1
        },
        "average_score": 85.0,
        "skills_with_score_count": 2,
        "total_accepted_assessments": 4
      },
      "active_skills": [
        {
          "skill_id": 1,
          "skill_name": "JavaScript",
          "category": "Frontend",
          "proficiency_level": "intermediate",
          "score": 80,
          "updated_at": "2026-03-01T10:00:00.000Z"
        },
        {
          "skill_id": 2,
          "skill_name": "React",
          "category": "Frontend",
          "proficiency_level": "advanced",
          "score": 90,
          "updated_at": "2026-03-02T11:00:00.000Z"
        },
        {
          "skill_id": 4,
          "skill_name": "Node.js",
          "category": "Backend",
          "proficiency_level": "beginner",
          "score": null,
          "updated_at": "2026-03-03T12:00:00.000Z"
        }
      ],
      "recent_accepted_assessments": [
        {
          "assessment_id": 12,
          "skill_id": 1,
          "skill_name": "JavaScript",
          "skill_category": "Frontend",
          "source_type": "ai",
          "proficiency_level": "intermediate",
          "score": 80,
          "notes": "Divalidasi dari evaluasi AI proyek",
          "project": {
            "id": 5,
            "title": "Aplikasi Toko Online Fullstack"
          },
          "created_at": "2026-03-02T10:00:00.000Z"
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Kredensial autentikasi tidak valid atau belum login.
  - `500 Internal Server Error`: Kesalahan server internal saat mengambil data ringkasan.

---

#### 37. GET `/api/competency-progress/skills/[id]`

- **Tujuan:** Menampilkan detail status kompetensi terkini dan linimasa kronologis seluruh riwayat penilaian (*assessment history*) untuk satu skill tertentu.
- **Autentikasi:** Wajib.
- **Path Parameter:**
  - `id` (integer positif) — Mendukung `skills.id` (ID master skill katalog) maupun `user_skills.id` (ID relasi skill pengguna).
- **Aturan Kepemilikan & Validasi:**
  - `400 Bad Request` jika ID bukan bilangan bulat positif.
  - `404 Not Found` jika skill tidak terdaftar dalam profil pengguna atau milik pengguna lain.
- **Karakteristik Data:**
  - `assessment_history` disajikan dalam urutan kronologis deterministik (`created_at ASC, id ASC`).
  - Menyertakan `assessment_statistics` yang memuat jumlah total assessment serta rincian per status (`accepted`, `pending`, `rejected`).
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "skill": {
        "id": 1,
        "name": "JavaScript",
        "category": "Frontend"
      },
      "current_state": {
        "user_skill_id": 10,
        "status": "active",
        "proficiency_level": "intermediate",
        "score": 80,
        "updated_at": "2026-03-02T10:00:00.000Z"
      },
      "assessment_statistics": {
        "total_assessments": 2,
        "accepted_count": 2,
        "pending_count": 0,
        "rejected_count": 0
      },
      "assessment_history": [
        {
          "assessment_id": 1,
          "source_type": "manual",
          "review_status": "accepted",
          "proficiency_level": "beginner",
          "score": 60,
          "notes": "Manual self-assessment awal",
          "project": null,
          "created_at": "2026-01-01T10:00:00.000Z"
        },
        {
          "assessment_id": 12,
          "source_type": "ai",
          "review_status": "accepted",
          "proficiency_level": "intermediate",
          "score": 80,
          "notes": "Divalidasi dari evaluasi AI proyek",
          "project": {
            "id": 5,
            "title": "Aplikasi Toko Online Fullstack"
          },
          "created_at": "2026-03-02T10:00:00.000Z"
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID skill tidak valid (bukan integer positif).
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Skill tidak ditemukan pada profil pengguna.
  - `500 Internal Server Error`: Kesalahan server internal saat mengambil linimasa skill.

---

#### 38. GET `/api/competency-progress/career-targets/[id]`

- **Tujuan:** Menampilkan evaluasi komprehensif perkembangan kompetensi mahasiswa terhadap kebutuhan target karier tertentu.
- **Autentikasi:** Wajib.
- **Path Parameter:**
  - `id` (integer positif) — ID Target Karier.
- **Karakteristik Data:**
  - Menggunakan algoritma evaluasi yang konsisten 100% dengan modul *Skill Gap Analysis*.
  - `has_requirements`: `false` jika target belum memiliki daftar kompetensi ($N=0$), dengan persentase kesiapan `0.0%`.
  - `skills_progress`: Daftar seluruh kriteria kompetensi target karier dilengkapi status pemenuhan (`is_fulfilled: true/false`), status gap (`fulfilled`, `under-qualified`, `pending_review`, `missing`), dan data kompetensi aktif pengguna saat ini.
- **Response Sukses (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "career_target": {
        "id": 1,
        "title": "Senior Web Architect",
        "description": "Target karier utama",
        "created_at": "2026-02-01T08:00:00.000Z",
        "updated_at": "2026-02-01T08:00:00.000Z"
      },
      "has_requirements": true,
      "readiness_percentage": 25.0,
      "projected_readiness_percentage": 37.5,
      "summary": {
        "total_skills": 4,
        "fulfilled_count": 1,
        "under_qualified_count": 1,
        "pending_review_count": 1,
        "missing_count": 1,
        "readiness_percentage": 25.0,
        "projected_readiness_percentage": 37.5,
        "has_requirements": true,
        "message": "Analisis kesenjangan kompetensi berhasil dihitung."
      },
      "skills_progress": [
        {
          "skill_id": 1,
          "skill_name": "JavaScript",
          "category": "Frontend",
          "target_requirement": {
            "expected_proficiency_level": "intermediate",
            "expected_score": 75
          },
          "current_proficiency": {
            "status": "active",
            "proficiency_level": "intermediate",
            "score": 80,
            "updated_at": "2026-03-02T10:00:00.000Z"
          },
          "gap_status": "fulfilled",
          "is_fulfilled": true,
          "notes": "Kompetensi aktif memenuhi kriteria target karier."
        },
        {
          "skill_id": 2,
          "skill_name": "React",
          "category": "Frontend",
          "target_requirement": {
            "expected_proficiency_level": "advanced",
            "expected_score": 95
          },
          "current_proficiency": {
            "status": "active",
            "proficiency_level": "advanced",
            "score": 90,
            "updated_at": "2026-03-02T11:00:00.000Z"
          },
          "gap_status": "under-qualified",
          "is_fulfilled": false,
          "notes": "Skor kompetensi pengguna (90) masih di bawah target (95)."
        },
        {
          "skill_id": 5,
          "skill_name": "Next.js",
          "category": "Frontend",
          "target_requirement": {
            "expected_proficiency_level": "intermediate",
            "expected_score": 70
          },
          "current_proficiency": {
            "status": "needs_review",
            "proficiency_level": null,
            "score": null,
            "updated_at": "2026-03-02T12:00:00.000Z"
          },
          "gap_status": "pending_review",
          "is_fulfilled": false,
          "notes": "Terdapat rekomendasi AI yang menunggu peninjauan pengguna."
        },
        {
          "skill_id": 7,
          "skill_name": "MySQL",
          "category": "Database",
          "target_requirement": {
            "expected_proficiency_level": "intermediate",
            "expected_score": 80
          },
          "current_proficiency": {
            "status": "missing",
            "proficiency_level": null,
            "score": null,
            "updated_at": null
          },
          "gap_status": "missing",
          "is_fulfilled": false,
          "notes": "Belum ada bukti proyek atau kompetensi terkait skill ini."
        }
      ]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: ID target karier tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Target karier tidak ditemukan atau milik pengguna lain.
  - `500 Internal Server Error`: Kesalahan server internal saat menghitung progres target karier.

---

### M. Pembuat Portofolio & AI Portfolio Generator (Portfolio Builder)

Modul ini memfasilitasi pembuatan, kurasi, dan pengelolaan portofolio digital mahasiswa. Portofolio dapat digenerasi draf awalnya menggunakan AI berdasarkan proyek nyata dan skill aktif pengguna, kemudian disunting dan disimpan secara persisten.

Setiap pengguna hanya dapat memiliki **maksimal 1 portofolio** (ditegakkan via batasan integritas basis data `UNIQUE (user_id)`). Portofolio yang baru dibuat secara default bersifat privat (`is_published: false`). Seluruh kompetensi yang dikurasi ke portofolio menggunakan **data dinamis (live)** dari tabel `user_skills` yang berstatus `active` (tidak menyimpan snapshot score statis).

---

#### 39. POST `/api/portfolios/generate`

- **Tujuan:** Menghasilkan draf rekomendasi portofolio secara otomatis menggunakan inferensi AI (*stateless*, tidak menulis ke basis data). AI menyintesis judul portofolio, ringkasan profesional, saran bio singkat, slug unik yang direkomendasikan, serta mengurasi proyek dan skill yang paling relevan.
- **Autentikasi:** Wajib (`auth_token` cookie atau `Authorization: Bearer <token>`).
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "career_target_id": 1
  }
  ```
  *Catatan:* `career_target_id` bersifat opsional (dapat berupa `null` atau dihilangkan). Jika disertakan, sistem memverifikasi bahwa target karier tersebut adalah milik pengguna yang sedang login.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Draf portofolio berhasil digenerasi oleh AI.",
    "data": {
      "title": "Full-Stack Web Architect & JavaScript Specialist",
      "summary": "Mahasiswa berdedikasi dengan rekam jejak nyata dalam pengembangan sistem web modern...",
      "custom_bio": "Fokus pada pengembangan aplikasi web berkinerja tinggi dengan kode bersih dan keamanan teruji.",
      "suggested_slug": "ahmad-fauzi-portfolio",
      "career_target_id": 1,
      "career_target_title": "Full-Stack Web Developer",
      "selected_projects": [
        {
          "project_id": 1,
          "title": "Sistem Informasi Manajemen Magang",
          "repository_url": "https://github.com/ahmad/sim-magang",
          "live_url": "https://magang.ahmad.dev",
          "custom_description": "Merancang arsitektur backend REST API dan struktur data MySQL dengan performa tinggi serta dokumentasi lengkap.",
          "display_order": 1,
          "evidences": [
            {
              "id": 1,
              "title": "Dokumentasi API Swagger",
              "evidence_type": "documentation",
              "url": "https://docs.ahmad.dev/api"
            }
          ]
        }
      ],
      "selected_skills": [
        {
          "skill_id": 1,
          "name": "JavaScript",
          "category": "Frontend",
          "proficiency_level": "intermediate",
          "score": 85,
          "display_order": 1
        },
        {
          "skill_id": 2,
          "name": "MySQL",
          "category": "Database",
          "proficiency_level": "intermediate",
          "score": 80,
          "display_order": 2
        }
      ],
      "available_projects_count": 3,
      "available_skills_count": 2
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `career_target_id` bukan angka bulat positif atau tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: `career_target_id` yang dicantumkan tidak ditemukan atau bukan milik pengguna.
  - `429 Too Many Requests`: Batas kuota request AI tercapai.
  - `503 Service Unavailable`: Layanan AI belum dikonfigurasi (`AI_API_KEY` tidak tersedia).
  - `504 Gateway Timeout`: Permintaan inferensi ke AI melampaui batas waktu (timeout).

---

#### 40. GET `/api/portfolios`

- **Tujuan:** Mengambil data portofolio aktif milik pengguna yang sedang login beserta seluruh proyek terkurasi dan skill yang diverifikasi secara dinamis.
- **Autentikasi:** Wajib.
- **Success Response — Pengguna Belum Memiliki Portofolio (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": null,
    "has_portfolio": false
  }
  ```
- **Success Response — Pengguna Sudah Memiliki Portofolio (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 1,
      "user_id": 1,
      "title": "Full-Stack Web Architect",
      "slug": "ahmad-fauzi-portfolio",
      "summary": "Pengembang web spesialis JavaScript dan arsitektur database modern.",
      "custom_bio": "Fokus pada performa sistem dan arsitektur kode bersih.",
      "career_target_id": 1,
      "career_target_title": "Full-Stack Web Developer",
      "is_published": false,
      "created_at": "2026-03-01T10:00:00.000Z",
      "updated_at": "2026-03-01T10:00:00.000Z",
      "projects": [
        {
          "id": 1,
          "project_id": 1,
          "title": "Sistem Informasi Manajemen Magang",
          "original_description": "Aplikasi portal magang terintegrasi.",
          "custom_description": "Merancang arsitektur backend REST API dan struktur data MySQL.",
          "repository_url": "https://github.com/ahmad/sim-magang",
          "live_url": "https://magang.ahmad.dev",
          "display_order": 1,
          "evidences": [
            {
              "id": 1,
              "title": "Dokumentasi API Swagger",
              "evidence_type": "documentation",
              "url": "https://docs.ahmad.dev/api"
            }
          ]
        }
      ],
      "skills": [
        {
          "id": 1,
          "skill_id": 1,
          "name": "JavaScript",
          "category": "Frontend",
          "proficiency_level": "intermediate",
          "score": 85,
          "display_order": 1
        }
      ]
    },
    "has_portfolio": true
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Belum login.
  - `500 Internal Server Error`: Kesalahan server internal saat mengambil data portofolio.

---

#### 41. POST `/api/portfolios`

- **Tujuan:** Menyimpan data portofolio baru milik pengguna beserta proyek kurasi dan daftar skill aktif yang dipilih secara atomik dalam satu transaksi database.
- **Autentikasi:** Wajib.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "title": "Full-Stack Web Architect",
    "slug": "ahmad-fauzi-portfolio",
    "summary": "Pengembang web spesialis JavaScript dan arsitektur database modern.",
    "custom_bio": "Fokus pada performa sistem dan arsitektur kode bersih.",
    "career_target_id": 1,
    "is_published": false,
    "projects": [
      {
        "project_id": 1,
        "custom_description": "Merancang arsitektur backend REST API dan skema MySQL.",
        "display_order": 1
      }
    ],
    "skills": [
      {
        "skill_id": 1,
        "display_order": 1
      }
    ]
  }
  ```
- **Aturan Validasi Input:**
  - `title`: Wajib, teks 3–200 karakter.
  - `slug`: Wajib, pola `^[a-z0-9]+(?:-[a-z0-9]+)*$` (3–60 karakter huruf kecil dan tanda hubung tunggal, tidak diawali/diakhiri tanda hubung). Dilarang menggunakan kata kunci cadangan (*reserved slugs* seperti `api`, `admin`, `settings`, dll.).
  - `summary`: Opsional, maksimal 4000 karakter.
  - `custom_bio`: Opsional, maksimal 4000 karakter.
  - `is_published`: Opsional boolean, default `false`.
  - `career_target_id`: Opsional angka bulat positif atau `null`. Wajib diverifikasi milik pengguna.
  - `projects`: Opsional array objek `{ project_id, custom_description, display_order }`. Setiap `project_id` wajib diverifikasi merupakan proyek nyata milik pengguna.
  - `skills`: Opsional array objek `{ skill_id, display_order }`. Setiap `skill_id` wajib diverifikasi berstatus `active` pada `user_skills` pengguna.
- **Success Response (`201 Created`):**
  ```json
  {
    "status": "success",
    "message": "Portofolio berhasil disimpan.",
    "data": {
      "id": 1,
      "user_id": 1,
      "title": "Full-Stack Web Architect",
      "slug": "ahmad-fauzi-portfolio",
      "summary": "Pengembang web spesialis JavaScript dan arsitektur database modern.",
      "custom_bio": "Fokus pada performa sistem dan arsitektur kode bersih.",
      "career_target_id": 1,
      "is_published": false,
      "created_at": "2026-03-01T10:00:00.000Z",
      "updated_at": "2026-03-01T10:00:00.000Z",
      "projects": [...],
      "skills": [...]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Validasi payload gagal (judul terlalu pendek/panjang, format slug salah, proyek/skill bukan milik pengguna atau skill belum berstatus active).
  - `401 Unauthorized`: Belum login.
  - `409 Conflict`: Pengguna sudah memiliki portofolio sebelumnya (1 portofolio per user), atau slug sudah digunakan oleh portofolio lain.
  - `500 Internal Server Error`: Kesalahan transaksi saat menyimpan portofolio.

---

#### 42. GET `/api/portfolios/[id]`

- **Tujuan:** Mengambil detail lengkap portofolio berdasarkan ID portofolio milik pengguna yang terautentikasi.
- **Autentikasi:** Wajib.
- **Parameter URL:** `id` (integer positif, ID portofolio).
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "id": 1,
      "user_id": 1,
      "title": "Full-Stack Web Architect",
      "slug": "ahmad-fauzi-portfolio",
      "summary": "...",
      "custom_bio": "...",
      "career_target_id": 1,
      "career_target_title": "Full-Stack Web Developer",
      "is_published": false,
      "created_at": "...",
      "updated_at": "...",
      "projects": [...],
      "skills": [...]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Parameter `id` bukan angka positif.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Portofolio tidak ditemukan atau bukan milik pengguna yang sedang login (isolasi hak akses antar pengguna).

---

#### 43. PUT `/api/portfolios/[id]`

- **Tujuan:** Memperbarui data portofolio dan secara atomik mengganti kurasi daftar proyek (`portfolio_projects`) serta skill (`portfolio_skills`). Proyek lama dan kompetensi `user_skills` asli tidak diubah/dihapus.
- **Autentikasi:** Wajib.
- **Parameter URL:** `id` (integer positif, ID portofolio).
- **Request Headers:** `Content-Type: application/json`
- **Request Body:** Format dan aturan validasi sama persis dengan `POST /api/portfolios`.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Portofolio berhasil diperbarui.",
    "data": {
      "id": 1,
      "user_id": 1,
      "title": "Senior Frontend Specialist",
      "slug": "ahmad-fauzi-frontend",
      "summary": "Pembaruan ringkasan profesional...",
      "custom_bio": "Pembaruan bio...",
      "career_target_id": 2,
      "is_published": false,
      "created_at": "...",
      "updated_at": "...",
      "projects": [...],
      "skills": [...]
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Format input atau validasi payload gagal.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Portofolio tidak ditemukan atau bukan milik pengguna aktif.
  - `409 Conflict`: Slug baru yang diajukan sudah digunakan oleh pengguna lain.
  - `500 Internal Server Error`: Kesalahan server saat memperbarui portofolio.

---

#### 44. DELETE `/api/portfolios/[id]`

- **Tujuan:** Menghapus portofolio milik pengguna. Menghapus data relasi pada `portfolio_projects` dan `portfolio_skills` secara cascade, tetapi **tidak menghapus** proyek asli pada tabel `projects` maupun kompetensi pada tabel `user_skills`.
- **Autentikasi:** Wajib.
- **Parameter URL:** `id` (integer positif, ID portofolio).
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Portofolio berhasil dihapus."
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Parameter `id` tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Portofolio tidak ditemukan atau bukan milik pengguna aktif.
  - `500 Internal Server Error`: Gagal menghapus portofolio dari basis data.

---

### N. Portofolio Publik & Pengaturan Privasi (Public Portfolio & Sharing Settings)

Modul ini mengelola tampilan publik portofolio mahasiswa serta konfigurasi privasi dan tautan publikasi (*sharing settings*). Melalui modul ini, mahasiswa dapat membagikan portofolio kompetensi dan proyek nyata mereka kepada pihak eksternal (perekrut, dosen, atau publik) melalui tautan URL yang bersih dan aman.

Prinsip Keamanan & Privasi Mutlak:
1. **Zero-Leakage Private Portfolios:** Portofolio yang belum dipublikasikan (`is_published: 0`) dan slug yang tidak terdaftar di sistem sama-sama menghasilkan respons HTTP `404 Not Found` dengan pesan generic yang identik, mencegah pihak luar mengetahui keberadaan slug privat (*probing resistance*).
2. **Perlindungan Akun Pengguna:** Email akun mahasiswa (`users.email`), ID internal (`user_id`), dan kredensial autentikasi **tidak pernah** dikirimkan ke endpoint publik.
3. **Email Kontak Eksplisit:** Email kontak publik (`public_email`) bersifat terpisah dari email akun login dan hanya akan muncul di respons publik jika mahasiswa mengisinya secara sadar dan eksplisit.
4. **Validasi Live Status Kompetensi:** Hanya kompetensi yang berstatus `active` pada `user_skills` yang disertakan dalam portofolio publik. Rekomendasi AI yang masih berstatus `needs_review` atau `rejected` tidak akan pernah ditampilkan.

---

#### 45. GET `/api/public/portfolios/[slug]`

- **Tujuan:** Mengambil data portofolio publik berdasarkan URL slug yang telah dipublikasikan (`is_published: 1`).
- **Autentikasi:** Tidak diperlukan (Publik).
- **Parameter URL:** `slug` (string slug portofolio, misal `ahmad-fauzi-portfolio`).
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "title": "Full-Stack Web Architect",
      "slug": "ahmad-fauzi-portfolio",
      "summary": "Pengembang web spesialis JavaScript dan arsitektur database modern.",
      "custom_bio": "Fokus pada performa sistem dan arsitektur kode bersih.",
      "author": {
        "name": "Ahmad Fauzi",
        "avatar_url": "https://avatars.example.com/ahmad.png",
        "bio": "Fokus pada performa sistem dan arsitektur kode bersih."
      },
      "contact": {
        "public_email": "contact@ahmad.dev",
        "github_url": "https://github.com/ahmad-fauzi",
        "linkedin_url": "https://linkedin.com/in/ahmad-fauzi",
        "website_url": "https://ahmad.dev"
      },
      "career_target": {
        "title": "Full-Stack Web Developer",
        "description": "Target karier pengembangan aplikasi web modern"
      },
      "projects": [
        {
          "id": 1,
          "title": "Sistem Informasi Manajemen Magang",
          "description": "Merancang arsitektur backend REST API dan struktur data MySQL.",
          "repository_url": "https://github.com/ahmad/sim-magang",
          "live_url": "https://magang.ahmad.dev",
          "start_date": "2025-01-01",
          "end_date": "2025-06-01",
          "is_featured": true,
          "display_order": 1,
          "evidences": [
            {
              "title": "Dokumentasi API Swagger",
              "evidence_type": "documentation",
              "url": "https://docs.ahmad.dev/api"
            }
          ]
        }
      ],
      "skills": [
        {
          "id": 1,
          "name": "JavaScript",
          "category": "Frontend",
          "proficiency_level": "intermediate",
          "score": 85,
          "is_featured": true,
          "display_order": 1,
          "verified_at": "2026-03-01T10:00:00.000Z"
        }
      ],
      "published_at": "2026-03-01T12:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `404 Not Found`: Portofolio publik tidak ditemukan (berlaku sama untuk slug yang belum pernah dibuat atau portofolio yang disetel privat `is_published: 0`).
  - `500 Internal Server Error`: Kesalahan server saat memuat data portofolio publik.

---

#### 46. GET `/api/portfolios/[id]/sharing`

- **Tujuan:** Mengambil konfigurasi status publikasi, slug, dan informasi kontak publik dari portofolio milik pengguna aktif.
- **Autentikasi:** Wajib (`auth_token` cookie atau `Authorization: Bearer <token>`).
- **Parameter URL:** `id` (integer positif, ID portofolio milik pengguna).
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "portfolio_id": 1,
      "slug": "ahmad-fauzi-portfolio",
      "is_published": true,
      "public_email": "contact@ahmad.dev",
      "github_url": "https://github.com/ahmad-fauzi",
      "linkedin_url": "https://linkedin.com/in/ahmad-fauzi",
      "website_url": "https://ahmad.dev",
      "public_url": "/api/public/portfolios/ahmad-fauzi-portfolio",
      "updated_at": "2026-03-01T12:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Parameter `id` tidak valid.
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Portofolio tidak ditemukan atau bukan milik pengguna aktif.
  - `500 Internal Server Error`: Terjadi kesalahan pada server saat memuat pengaturan berbagi.

---

#### 47. PATCH `/api/portfolios/[id]/sharing`

- **Tujuan:** Memperbarui konfigurasi privasi portofolio seperti mengaktifkan/menonaktifkan publikasi (`is_published`), mengganti slug URL, atau memperbarui tautan kontak publik tanpa mengubah kurasi proyek atau skill.
- **Autentikasi:** Wajib.
- **Parameter URL:** `id` (integer positif, ID portofolio milik pengguna).
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "is_published": true,
    "slug": "ahmad-fauzi-official",
    "public_email": "halo@ahmad.dev",
    "github_url": "https://github.com/ahmadfauzi",
    "linkedin_url": "https://linkedin.com/in/ahmadfauzi",
    "website_url": "https://ahmadfauzi.dev"
  }
  ```
- **Aturan Validasi Input:**
  - Seluruh field bersifat opsional, namun minimal salah satu field harus disertakan.
  - `is_published`: boolean (`true` untuk mempublikasikan, `false` untuk menyetel privat).
  - `slug`: string dengan format pola `^[a-z0-9]+(?:-[a-z0-9]+)*$` (3 hingga 60 karakter, huruf kecil, angka, dan tanda hubung tunggal). Dilarang menggunakan reserved words. Wajib unik di seluruh sistem.
  - `public_email`: alamat email valid (maksimal 150 karakter) atau `null` untuk mengosongkan/menghapus email publik.
  - `github_url`, `linkedin_url`, `website_url`: tautan URL HTTP/HTTPS valid (maksimal 255 karakter) atau `null` untuk mengosongkan.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Pengaturan berbagi portofolio berhasil diperbarui.",
    "data": {
      "portfolio_id": 1,
      "slug": "ahmad-fauzi-official",
      "is_published": true,
      "public_email": "halo@ahmad.dev",
      "github_url": "https://github.com/ahmadfauzi",
      "linkedin_url": "https://linkedin.com/in/ahmadfauzi",
      "website_url": "https://ahmadfauzi.dev",
      "public_url": "/api/public/portfolios/ahmad-fauzi-official",
      "updated_at": "2026-03-01T12:05:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Validasi gagal (format slug tidak valid, reserved word, URL tidak valid, email tidak valid, atau payload kosong).
  - `401 Unauthorized`: Belum login.
  - `404 Not Found`: Portofolio tidak ditemukan atau bukan milik pengguna yang sedang login.
  - `409 Conflict`: Slug yang diajukan sudah digunakan oleh portofolio pengguna lain.
  - `500 Internal Server Error`: Kesalahan server saat memperbarui pengaturan berbagi.








