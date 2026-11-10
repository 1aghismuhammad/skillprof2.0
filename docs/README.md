# SkillProof Documentation Hub

Selamat datang di pusat dokumentasi resmi **SkillProof — AI-Powered Student Skill Mapping & Portfolio Platform**.

---

## Struktur Direktori Dokumentasi

```text
docs/
├── product/                         # Spesifikasi Kebutuhan Produk
│   └── PRD.md                       # Product Requirements Document (PRD) versi kanonikal
│
├── architecture/                    # Arsitektur & Desain Sistem
│   └── ARCHITECTURE.md              # Dokumen Arsitektur Teknis, Diagram, dan Alur Komunikasi
│
├── api/                             # Kontrak & Spesifikasi Endpoint
│   └── API_CONTRACT.md              # Kontrak API Lengkap (2.600+ baris) untuk integrasi Frontend
│
├── ai/                              # Tata Kelola, Pipeline & Keamanan AI
│   ├── WORKFLOW.md                  # Alur Kerja Multi-Agent (Council, Arsitek, Tukang, Satpam)
│   ├── TUKANG-INSTRUCTIONS.md       # SOP Operasional Builder / Tukang
│   ├── SATPAM-INSTRUCTIONS.md       # SOP Operasional Quality Assurance / Satpam
│   ├── PROMPT_SPECIFICATIONS.md     # Spesifikasi Teknis Prompt AI & Format JSON
│   ├── AI_SAFETY_AND_GUARDRAILS.md  # Standar Keamanan AI, Anti-Hallucination & Anti-Injection
│   ├── templates/                   # Template Tiket dan Laporan Handoff
│   │   ├── TICKET.md                # Template Standar Penugasan Kerja
│   │   └── HANDOFF.md               # Template Laporan Penyerahan Berbasis Bukti
│   └── handoffs/                    # Arsip Laporan Handoff Eksekusi Nyata
│
└── tickets/                         # Arsip Tiket Kerja Aktif & Selesai
```

---

## Panduan Cepat Berdasarkan Kebutuhan

1. **Untuk Pengembang Frontend (Vue.js / Client Dev)**:
   - Baca: [`docs/api/API_CONTRACT.md`](api/API_CONTRACT.md) untuk mempelajari seluruh rute, payload, cookie autentikasi, dan respons JSON standar.
2. **Untuk Memahami Visi & Alur Bisnis Produk**:
   - Baca: [`docs/product/PRD.md`](product/PRD.md) untuk fitur MVP, use cases mahasiswa, dan acceptance criteria.
3. **Untuk Memahami Desain Sistem & Database**:
   - Baca: [`docs/architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) untuk diagram komponen, alur data, dan tumpukan teknologi.
4. **Untuk Menjalankan Workflow AI / Multi-Agent**:
   - Baca: [`CLAUDE.md`](../CLAUDE.md) dan [`docs/ai/WORKFLOW.md`](ai/WORKFLOW.md).
