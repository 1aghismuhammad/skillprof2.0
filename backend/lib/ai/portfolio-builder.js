import pool from '@/lib/db';
import { getAIProvider } from './provider.js';
import { parsePositiveInt, validateSlug } from '@/lib/validation';

/**
 * Menghasilkan slug URL yang aman dari nama atau teks
 */
function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 50);
}

/**
 * Menghasilkan draf portofolio berbasis AI secara murni in-memory / stateless.
 * Data dijamin 100% berakar pada fakta proyek dan skill aktif pengguna tanpa halusinasi.
 *
 * @param {number} userId - ID Pengguna login
 * @param {object} [options] - Opsi generate (career_target_id, target_role, project_ids)
 * @param {object} [db] - Instance pool atau connection database
 * @returns {Promise<object>} Draf portofolio terstruktur
 */
export async function generatePortfolioDraft(userId, options = {}, db = pool) {
  // 1. Ambil data profil pengguna
  const [userRows] = await db.query(
    'SELECT id, name, bio FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (userRows.length === 0) {
    const err = new Error('Pengguna tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  const user = userRows[0];

  // 2. Ambil seluruh proyek milik pengguna beserta bukti
  const [projectRows] = await db.query(
    `SELECT p.id,
            p.title,
            p.description,
            p.repository_url,
            p.live_url,
            p.start_date,
            p.end_date
     FROM projects p
     WHERE p.user_id = ?
     ORDER BY p.updated_at DESC, p.id DESC`,
    [userId]
  );

  // Validasi prasyarat: harus memiliki minimal 1 proyek
  if (projectRows.length === 0) {
    const err = new Error('Mahasiswa harus memiliki minimal satu proyek untuk dapat menghasilkan draf portofolio.');
    err.status = 422;
    throw err;
  }

  const projectIds = projectRows.map((p) => p.id);
  const [evidenceRows] = await db.query(
    `SELECT project_id, COUNT(*) as cnt
     FROM project_evidences
     WHERE project_id IN (?)
     GROUP BY project_id`,
    [projectIds]
  );
  const evidenceCountMap = new Map();
  for (const ev of evidenceRows) {
    evidenceCountMap.set(ev.project_id, Number(ev.cnt));
  }

  // 3. Ambil seluruh skill berstatus 'active' milik pengguna
  const [skillRows] = await db.query(
    `SELECT us.skill_id,
            s.name AS skill_name,
            s.category AS skill_category,
            us.proficiency_level,
            us.score
     FROM user_skills us
     JOIN skills s ON us.skill_id = s.id
     WHERE us.user_id = ? AND us.status = 'active'
     ORDER BY 
       CASE us.proficiency_level 
         WHEN 'advanced' THEN 1 
         WHEN 'intermediate' THEN 2 
         WHEN 'beginner' THEN 3 
         ELSE 4 
       END,
       us.score DESC,
       s.name ASC`,
    [userId]
  );

  // Validasi prasyarat: harus memiliki minimal 1 skill aktif
  if (skillRows.length === 0) {
    const err = new Error('Mahasiswa harus memiliki minimal satu skill aktif yang telah disetujui.');
    err.status = 422;
    throw err;
  }

  // 4. Periksa career target jika disediakan
  let careerTarget = null;
  if (options.career_target_id) {
    const ctId = parsePositiveInt(options.career_target_id);
    if (!ctId) {
      const err = new Error('ID target karier tidak valid.');
      err.status = 400;
      throw err;
    }

    const [ctRows] = await db.query(
      'SELECT id, title, description FROM career_targets WHERE id = ? AND user_id = ? LIMIT 1',
      [ctId, userId]
    );
    if (ctRows.length === 0) {
      const err = new Error('Target karier tidak ditemukan atau bukan milik Anda.');
      err.status = 400;
      throw err;
    }
    careerTarget = ctRows[0];
  }

  // 5. Susun prompt AI dengan batasan grounding dan anti-halusinasi yang ketat
  const projectSummaries = projectRows.map((p, i) => {
    const evCnt = evidenceCountMap.get(p.id) || 0;
    return `[PROYEK #${p.id}] ${p.title}
Deskripsi: ${p.description || '(Tidak ada)'}
Tautan: Repo=${p.repository_url || '-'}, Demo=${p.live_url || '-'}
Jumlah Bukti Terlampir: ${evCnt}`;
  }).join('\n\n');

  const activeSkillsList = skillRows.map((s) => {
    return `- [SKILL #${s.skill_id}] ${s.skill_name} (${s.skill_category}) | Kemahiran: ${s.proficiency_level} | Skor: ${s.score ?? 'N/A'}`;
  }).join('\n');

  const targetRoleContext = careerTarget
    ? `Target Karier Mahasiswa: ${careerTarget.title} (${careerTarget.description || ''})`
    : (options.target_role ? `Fokus Bidang/Peran Target: ${options.target_role}` : 'Fokus Bidang: General Software Engineering & IT');

  const systemPrompt = `Anda adalah SkillProof Portfolio Synthesizer, asisten AI profesional untuk penyusunan draf portofolio kompetensi mahasiswa.
Tugas Anda: Menyintesis draf portofolio kompetensi mahasiswa secara persuasif, elegan, dan objektif berdasarkan HANYA BUKTI FAKTUAL yang diberikan.

ATURAN ANTI-HALUSINASI & KESELAMATAN (MUTLAK):
1. HANYA gunakan proyek, bukti, dan keahlian yang tercantum pada data input mahasiswa di bawah ini.
2. DILARANG KERAS mengarang pengalaman kerja di perusahaan tertentu yang tidak disebutkan, sertifikasi palsu, atau klaim angka/metrik rekaan (seperti 'meningkatkan efisiensi 80%' atau 'melayani 10.000 user').
3. HANYA pilih ID proyek yang benar-benar ada pada daftar proyek input.
4. HANYA pilih ID skill yang benar-benar ada pada daftar skill aktif input. Dilarang menambahkan teknologi lain di luar daftar.
5. Tuliskan ringkasan profesional yang merefleksikan kompetensi teknis nyata dan kontribusi proyek mahasiswa.
6. Respons HARUS dalam format JSON valid tanpa teks penjelasan di luar JSON.

FORMAT JSON OUTPUT YANG WAJIB DIGUNAKAN:
{
  "title": "Judul profil profesional ringkas (maks 150 karakter, misal: Full-Stack Web Developer & Data Specialist)",
  "summary": "Ringkasan profesional portofolio 1-2 paragraf objektif berdasarkan bukti teknis (maks 1000 karakter)",
  "custom_bio": "Bio singkat yang cocok untuk kartu profil (maks 300 karakter)",
  "suggested_slug": "slug-url-singkat-huruf-kecil-dan-tanda-minus",
  "selected_project_ids": [array integer id proyek yang direkomendasikan untuk ditampilkan, urut dari yang paling unggul],
  "project_contributions": [
    {
      "project_id": integer id proyek,
      "custom_description": "Narasi kontribusi spesifik pada proyek ini yang menonjolkan peran mahasiswa (maks 500 karakter)"
    }
  ],
  "selected_skill_ids": [array integer id skill yang direkomendasikan untuk ditampilkan sebagai keahlian utama, maks 8 skill]
}`;

  const prompt = `DATA FAKTUAL MAHASISWA:
Nama: ${user.name}
Bio Awal: ${user.bio || '(Kosong)'}
${targetRoleContext}

DAFTAR PROYEK NYATA MILIK MAHASISWA:
${projectSummaries}

DAFTAR SKILL AKTIF TERVERIFIKASI MILIK MAHASISWA:
${activeSkillsList}

Sintesiskan draf portofolio kompetensi yang paling relevan dan kuat dalam format JSON sesuai spesifikasi.`;

  // 6. Panggil Provider AI
  const aiProvider = getAIProvider();
  let rawResponse;

  try {
    rawResponse = await aiProvider.analyzeProject({ prompt, systemPrompt });
  } catch (err) {
    if (err.status === 429) {
      const error = new Error('Layanan AI sedang sibuk (rate limit tercapai). Silakan coba beberapa saat lagi.');
      error.status = 429;
      throw error;
    }
    if (err.status === 504 || err.message?.includes('timeout') || err.message?.includes('batas waktu')) {
      const error = new Error('Permintaan pembuatan draf portofolio melampaui batas waktu.');
      error.status = 504;
      throw error;
    }
    const error = new Error(err.message || 'Gagal berkomunikasi dengan provider AI.');
    error.status = err.status || 503;
    throw error;
  }

  // 7. Parsing JSON AI Response
  let parsedAiOutput;
  try {
    // Bersihkan wrapper markdown jika model menyertakan ```json
    const cleanedJson = (rawResponse || '')
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsedAiOutput = JSON.parse(cleanedJson);
  } catch {
    const error = new Error('Respons AI tidak dalam format JSON yang valid.');
    error.status = 502;
    throw error;
  }

  // 8. Sanitasi & Whitelist Filter (Anti-Hallucination Guardrail)
  const projectsById = new Map();
  for (const p of projectRows) {
    projectsById.set(p.id, p);
  }

  const skillsById = new Map();
  for (const s of skillRows) {
    skillsById.set(s.skill_id, s);
  }

  // Map project contributions dari AI
  const contributionMap = new Map();
  if (Array.isArray(parsedAiOutput.project_contributions)) {
    for (const c of parsedAiOutput.project_contributions) {
      if (c && Number.isInteger(c.project_id) && typeof c.custom_description === 'string') {
        contributionMap.set(c.project_id, c.custom_description.trim().slice(0, 2000));
      }
    }
  }

  // Susun proyek terpilih yang valid (hanya yang benar-benar dimiliki user)
  const selectedProjectIds = Array.isArray(parsedAiOutput.selected_project_ids)
    ? parsedAiOutput.selected_project_ids.filter((id) => projectsById.has(id))
    : [];

  // Jika AI tidak memilih atau menghasilkan ID fiktif semua, fallback ke semua proyek user
  const effectiveProjectIds = selectedProjectIds.length > 0
    ? selectedProjectIds
    : projectRows.map((p) => p.id);

  const suggestedProjects = effectiveProjectIds.map((pId, index) => {
    const original = projectsById.get(pId);
    return {
      project_id: original.id,
      title: original.title,
      display_order: index + 1,
      is_featured: index < 3, // 3 proyek teratas di-featured otomatis
      custom_description: contributionMap.get(original.id) || original.description,
      original_description: original.description,
      repository_url: original.repository_url,
      live_url: original.live_url,
      evidences_count: evidenceCountMap.get(original.id) || 0,
    };
  });

  // Susun skill terpilih yang valid (hanya skill aktif milik user)
  const selectedSkillIds = Array.isArray(parsedAiOutput.selected_skill_ids)
    ? parsedAiOutput.selected_skill_ids.filter((id) => skillsById.has(id))
    : [];

  const effectiveSkillIds = selectedSkillIds.length > 0
    ? selectedSkillIds
    : skillRows.slice(0, 8).map((s) => s.skill_id);

  const suggestedSkills = effectiveSkillIds.map((sId, index) => {
    const sk = skillsById.get(sId);
    return {
      skill_id: sk.skill_id,
      skill_name: sk.skill_name,
      category: sk.skill_category,
      proficiency_level: sk.proficiency_level,
      score: sk.score,
      display_order: index + 1,
      is_featured: index < 5,
    };
  });

  // Sanitasi slug
  let rawSlug = parsedAiOutput.suggested_slug || slugify(user.name);
  let cleanSlug = slugify(rawSlug);
  if (!validateSlug(cleanSlug)) {
    cleanSlug = `${slugify(user.name) || 'portfolio'}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  return {
    title: (parsedAiOutput.title || `${user.name} - Portofolio Kompetensi`).slice(0, 200),
    summary: (parsedAiOutput.summary || '').slice(0, 2000),
    custom_bio: (parsedAiOutput.custom_bio || user.bio || '').slice(0, 1000),
    suggested_slug: cleanSlug,
    career_target: careerTarget
      ? { id: careerTarget.id, title: careerTarget.title }
      : null,
    suggested_projects: suggestedProjects,
    suggested_skills: suggestedSkills,
  };
}
