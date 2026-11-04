import pool from '@/lib/db';
import { calculateCareerTargetGap } from '@/lib/gap-analysis';
import { getAIProvider } from '@/lib/ai/provider';
import { validateUrl } from '@/lib/validation';

/**
 * Daftar platform kursus dan dokumentasi teknis yang diizinkan (Allowlist)
 */
export const ALLOWED_PLATFORMS = [
  'Coursera',
  'edX',
  'Udemy',
  'Dicoding',
  'freeCodeCamp',
  'The Odin Project',
  'MDN Web Docs',
  'Docker Docs',
  'PostgreSQL Docs',
  'Official Documentation',
  'AWS Skill Builder',
  'Google Cloud Skills Boost',
];

/**
 * URL basis / portal standar untuk platform yang diizinkan
 */
export const PLATFORM_BASE_URLS = {
  'Coursera': 'https://www.coursera.org',
  'edX': 'https://www.edx.org',
  'Udemy': 'https://www.udemy.com',
  'Dicoding': 'https://www.dicoding.com',
  'freeCodeCamp': 'https://www.freecodecamp.org',
  'The Odin Project': 'https://www.theodinproject.com',
  'MDN Web Docs': 'https://developer.mozilla.org',
  'Docker Docs': 'https://docs.docker.com',
  'PostgreSQL Docs': 'https://www.postgresql.org/docs',
  'Official Documentation': 'https://developer.mozilla.org',
  'AWS Skill Builder': 'https://explore.skillbuilder.aws',
  'Google Cloud Skills Boost': 'https://www.cloudskillsboost.google',
};

export const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];

/**
 * Mencari nama platform resmi dari allowlist berdasarkan input string
 */
export function findCanonicalPlatform(platformInput) {
  if (!platformInput || typeof platformInput !== 'string') return null;
  const clean = platformInput.trim().toLowerCase();

  for (const p of ALLOWED_PLATFORMS) {
    if (p.toLowerCase() === clean) {
      return p;
    }
  }

  // Pencocokan fleksibel jika terdapat variasi penamaan umum
  if (clean.includes('coursera')) return 'Coursera';
  if (clean.includes('edx')) return 'edX';
  if (clean.includes('udemy')) return 'Udemy';
  if (clean.includes('dicoding')) return 'Dicoding';
  if (clean.includes('freecodecamp')) return 'freeCodeCamp';
  if (clean.includes('odin')) return 'The Odin Project';
  if (clean.includes('mdn') || clean.includes('mozilla')) return 'MDN Web Docs';
  if (clean.includes('docker')) return 'Docker Docs';
  if (clean.includes('postgres')) return 'PostgreSQL Docs';
  if (clean.includes('aws')) return 'AWS Skill Builder';
  if (clean.includes('google cloud') || clean.includes('skills boost')) return 'Google Cloud Skills Boost';
  if (clean.includes('official') || clean.includes('dokumentasi')) return 'Official Documentation';

  return null;
}

/**
 * Mencocokkan nama skill rekomendasi dengan daftar skill gap yang diminta
 */
export function findCanonicalSkill(skillInput, gapSkillNames) {
  if (!skillInput || typeof skillInput !== 'string') return null;
  const clean = skillInput.trim().toLowerCase();

  for (const name of gapSkillNames) {
    if (name.toLowerCase() === clean) {
      return name;
    }
  }

  return null;
}

/**
 * Memvalidasi dan membersihkan URL kursus dengan fallback ke landing page platform
 */
export function resolveCourseUrl(rawUrl, canonicalPlatform) {
  if (rawUrl && typeof rawUrl === 'string' && validateUrl(rawUrl.trim(), 500)) {
    return rawUrl.trim();
  }
  return PLATFORM_BASE_URLS[canonicalPlatform] || 'https://developer.mozilla.org';
}

/**
 * Membangun system prompt dan user prompt untuk rekomendasi kursus dan proyek
 */
export function buildRecommendationPrompts(careerTarget, gapSkills, fulfilledSkills, type = 'all') {
  const safeTargetTitle = (careerTarget.title || '').slice(0, 200);
  const safeTargetDesc = (careerTarget.description || '').slice(0, 1000);

  const gapSkillDetails = gapSkills
    .map((s, idx) => {
      const curLevel = s.user_competency?.proficiency_level
        ? `level '${s.user_competency.proficiency_level}'`
        : 'belum ada bukti aktif';
      const curScore =
        s.user_competency?.score !== null && s.user_competency?.score !== undefined
          ? `skor ${s.user_competency.score}`
          : 'skor -';
      const expScore =
        s.target_requirement.expected_score !== null
          ? `skor ${s.target_requirement.expected_score}`
          : 'skor fleksibel';

      return `${idx + 1}. ${s.skill_name} (${s.category})
   - Status Kesenjangan: ${s.gap_status}
   - Kriteria Target: level '${s.target_requirement.expected_proficiency_level}', ${expScore}
   - Kondisi Pengguna Saat Ini: ${curLevel}, ${curScore}`;
    })
    .join('\n');

  const fulfilledList = fulfilledSkills.length > 0
    ? fulfilledSkills.map((s) => s.skill_name).join(', ')
    : '(Belum ada)';

  const platformListStr = ALLOWED_PLATFORMS.join(', ');

  const systemPrompt = `Anda adalah SkillProof Learning & Project Advisor, penasihat kurikulum dan portofolio teknis yang objektif, realistis, dan presisi.

TUGAS ANDA:
Menghasilkan rekomendasi materi pembelajaran (kursus) dan ide proyek portofolio yang terarah untuk menutup kesenjangan kompetensi pengguna menuju target kariernya.

ATURAN INTEGRITAS DAN VALIDASI KETAT:
1. Target Kesenjangan: Berikan rekomendasi HANYA untuk kompetensi yang terdaftar pada DAFTAR KESENJANGAN (GAP SKILLS). JANGAN merekomendasikan skill di luar daftar tersebut atau skill yang sudah terpenuhi (fulfilled).
2. Platform Kursus: Anda HANYA diperbolehkan menggunakan platform dari daftar resmi berikut:
   [${platformListStr}]
   Setiap platform di luar daftar di atas akan ditolak oleh sistem.
3. Tingkat Kemahiran (level / difficulty_level): WAJIB bernilai salah satu dari: 'beginner', 'intermediate', atau 'advanced'.
4. Tautan URL: Berikan URL yang valid dan realistis, atau gunakan URL beranda resmi platform terkait (misalnya https://www.coursera.org, https://www.freecodecamp.org, https://developer.mozilla.org).
5. Proyek Portofolio: Rancang proyek yang realistis untuk dikerjakan mahasiswa/pengembang, mencakup fitur konkret, bukti pendukung yang dapat diaudit (misal GitHub repository, unit tests, live demo), dan hasil kompetensi terukur.
6. Format Output: Anda HARUS merespons HANYA dalam format JSON valid tanpa format markdown (seperti \`\`\`json) atau teks pengantar.

FORMAT STRUKTUR JSON YANG DIHARAPKAN:
${type === 'courses' ? `{
  "courses": [
    {
      "title": "Nama Kursus Terstruktur",
      "platform": "Salah satu dari allowlist platform",
      "skill_name": "Nama skill dari daftar gap",
      "level": "beginner | intermediate | advanced",
      "description": "Deskripsi materi dan relevansi terhadap gap (maks 500 karakter)",
      "url": "https://...",
      "estimated_duration": "Estimasi waktu (misal: 4-6 minggu)"
    }
  ]
}` : type === 'projects' ? `{
  "projects": [
    {
      "title": "Judul Proyek Portofolio",
      "description": "Deskripsi proyek dan permasalahan yang diselesaikan (maks 1000 karakter)",
      "difficulty_level": "beginner | intermediate | advanced",
      "target_skills": ["SkillA", "SkillB"],
      "key_features": ["Fitur 1", "Fitur 2", "Fitur 3"],
      "suggested_evidences": ["Repositori GitHub publik", "Live Demo terdeploy", "Dokumentasi API"],
      "expected_outcome": "Kemampuan praktis konkret yang dicapai setelah proyek selesai"
    }
  ]
}` : `{
  "courses": [
    {
      "title": "Nama Kursus Terstruktur",
      "platform": "Salah satu dari allowlist platform",
      "skill_name": "Nama skill dari daftar gap",
      "level": "beginner | intermediate | advanced",
      "description": "Deskripsi materi dan relevansi terhadap gap (maks 500 karakter)",
      "url": "https://...",
      "estimated_duration": "Estimasi waktu (misal: 4-6 minggu)"
    }
  ],
  "projects": [
    {
      "title": "Judul Proyek Portofolio",
      "description": "Deskripsi proyek dan permasalahan yang diselesaikan (maks 1000 karakter)",
      "difficulty_level": "beginner | intermediate | advanced",
      "target_skills": ["SkillA", "SkillB"],
      "key_features": ["Fitur 1", "Fitur 2", "Fitur 3"],
      "suggested_evidences": ["Repositori GitHub publik", "Live Demo terdeploy", "Dokumentasi API"],
      "expected_outcome": "Kemampuan praktis konkret yang dicapai setelah proyek selesai"
    }
  ]
}`}`;

  const prompt = `Lakukan analisis rekomendasi pembelajaran dan proyek portofolio:

TARGET KARIER PENGGUNA:
Judul: ${safeTargetTitle}
Deskripsi: ${safeTargetDesc || '(Tidak ada deskripsi rinci)'}

SKILL YANG SUDAH TERPENUHI (FULFILLED - JANGAN DIREKOMENDASIKAN ULANG):
${fulfilledList}

DAFTAR KESENJANGAN KOMPETENSI (GAP SKILLS - FOKUS REKOMENDASI):
${gapSkillDetails}

Silakan susun rekomendasi ${type === 'courses' ? 'kursus' : type === 'projects' ? 'proyek' : 'kursus dan proyek'} dalam format JSON sesuai ketentuan ketat di atas.`;

  return { systemPrompt, prompt };
}

/**
 * Memvalidasi dan membersihkan keluaran JSON dari AI Provider
 */
export function validateAndSanitizeRecommendations(rawJsonText, gapSkillNames, type = 'all') {
  let parsed;
  try {
    const cleanedText = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    parsed = JSON.parse(cleanedText);
  } catch {
    const err = new Error('Respons provider AI bukan format JSON yang valid.');
    err.status = 502;
    throw err;
  }

  if (!parsed || typeof parsed !== 'object') {
    const err = new Error('Struktur respons provider AI tidak valid.');
    err.status = 502;
    throw err;
  }

  const result = {};

  // Validasi Kursus
  if (type === 'all' || type === 'courses') {
    const rawCourses = Array.isArray(parsed.courses) ? parsed.courses : [];
    const sanitizedCourses = [];

    for (const c of rawCourses) {
      if (!c || typeof c !== 'object') continue;

      const title = typeof c.title === 'string' ? c.title.trim().slice(0, 200) : '';
      if (!title) continue;

      const canonicalPlatform = findCanonicalPlatform(c.platform);
      if (!canonicalPlatform) {
        // Platform di luar allowlist ditolak
        continue;
      }

      const canonicalSkill = findCanonicalSkill(c.skill_name, gapSkillNames);
      if (!canonicalSkill) {
        // Skill tidak dikenal atau bukan merupakan gap yang diminta
        continue;
      }

      let level = typeof c.level === 'string' ? c.level.trim().toLowerCase() : '';
      if (!VALID_LEVELS.includes(level)) {
        continue; // Level tidak sesuai standar
      }

      const description = typeof c.description === 'string' ? c.description.trim().slice(0, 1000) : '';
      const url = resolveCourseUrl(c.url, canonicalPlatform);
      const estimatedDuration =
        typeof c.estimated_duration === 'string' && c.estimated_duration.trim()
          ? c.estimated_duration.trim().slice(0, 100)
          : '4-6 minggu';

      sanitizedCourses.push({
        title,
        platform: canonicalPlatform,
        skill_name: canonicalSkill,
        level,
        description,
        url,
        estimated_duration: estimatedDuration,
      });
    }

    if (sanitizedCourses.length === 0) {
      const err = new Error('Respons provider AI tidak memuat rekomendasi kursus yang valid.');
      err.status = 502;
      throw err;
    }

    result.courses = sanitizedCourses;
  }

  // Validasi Proyek
  if (type === 'all' || type === 'projects') {
    const rawProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
    const sanitizedProjects = [];

    for (const p of rawProjects) {
      if (!p || typeof p !== 'object') continue;

      const title = typeof p.title === 'string' ? p.title.trim().slice(0, 200) : '';
      if (!title) continue;

      const description = typeof p.description === 'string' ? p.description.trim().slice(0, 2000) : '';
      let difficultyLevel =
        typeof p.difficulty_level === 'string' ? p.difficulty_level.trim().toLowerCase() : '';
      if (!VALID_LEVELS.includes(difficultyLevel)) {
        difficultyLevel = 'intermediate';
      }

      // Filter target_skills agar hanya berisi skill yang memang merupakan gap target
      const rawTargetSkills = Array.isArray(p.target_skills) ? p.target_skills : [];
      const matchedSkills = [];
      for (const sk of rawTargetSkills) {
        const canonical = findCanonicalSkill(sk, gapSkillNames);
        if (canonical && !matchedSkills.includes(canonical)) {
          matchedSkills.push(canonical);
        }
      }

      if (matchedSkills.length === 0) {
        // Proyek yang tidak menargetkan satupun skill gap valid ditolak
        continue;
      }

      const keyFeatures = (Array.isArray(p.key_features) ? p.key_features : [])
        .map((f) => (typeof f === 'string' ? f.trim().slice(0, 200) : ''))
        .filter(Boolean);

      const suggestedEvidences = (Array.isArray(p.suggested_evidences) ? p.suggested_evidences : [])
        .map((e) => (typeof e === 'string' ? e.trim().slice(0, 200) : ''))
        .filter(Boolean);

      const expectedOutcome =
        typeof p.expected_outcome === 'string' ? p.expected_outcome.trim().slice(0, 1000) : '';

      sanitizedProjects.push({
        title,
        description,
        difficulty_level: difficultyLevel,
        target_skills: matchedSkills,
        key_features:
          keyFeatures.length > 0
            ? keyFeatures
            : ['Implementasi arsitektur modular', 'Pengujian unit terintegrasi'],
        suggested_evidences:
          suggestedEvidences.length > 0
            ? suggestedEvidences
            : ['Repositori GitHub dengan dokumentasi', 'Demo aplikasi langsung'],
        expected_outcome:
          expectedOutcome || 'Peningkatan kemahiran teknis praktis sesuai target kompetensi.',
      });
    }

    if (sanitizedProjects.length === 0) {
      const err = new Error('Respons provider AI tidak memuat rekomendasi proyek yang valid.');
      err.status = 502;
      throw err;
    }

    result.projects = sanitizedProjects;
  }

  return result;
}

/**
 * Menghasilkan rekomendasi kursus dan/atau proyek berdasarkan analisis kesenjangan kompetensi.
 * Operasi ini murni READ-ONLY (tanpa penulisan ke database).
 *
 * @param {number} targetId - ID target karier
 * @param {number} userId - ID pengguna yang terautentikasi
 * @param {object} [options]
 * @param {'all'|'courses'|'projects'} [options.type='all'] - Jenis rekomendasi yang diminta
 * @param {object} [options.customProvider=null] - Override AI Provider untuk pengujian
 * @param {object} [options.db=pool] - Pool/koneksi database
 * @returns {Promise<object|null>} Data rekomendasi atau null jika target tidak ditemukan / bukan pemilik
 */
export async function generateCareerTargetRecommendations(
  targetId,
  userId,
  { type = 'all', customProvider = null, db = pool } = {}
) {
  // 1. Dapatkan hasil evaluasi kesenjangan kompetensi aktual
  const gapResult = await calculateCareerTargetGap(targetId, userId, db);

  if (!gapResult) {
    return null; // Target tidak ditemukan atau bukan milik pengguna
  }

  // 2. Periksa apakah target karier memiliki kriteria kompetensi (Rule of No Requirements)
  if (!gapResult.summary.has_requirements || gapResult.summary.total_skills === 0) {
    const err = new Error('Target karier belum memiliki kriteria kompetensi.');
    err.status = 400;
    err.code = 'NO_REQUIREMENTS';
    throw err;
  }

  // 3. Periksa kondisi seluruh kompetensi sudah terpenuhi (Rule of Goal Reached)
  if (gapResult.summary.fulfilled_count === gapResult.summary.total_skills) {
    const responsePayload = {
      career_target: {
        id: gapResult.career_target.id,
        title: gapResult.career_target.title,
        description: gapResult.career_target.description,
      },
      gap_summary: {
        total_skills: gapResult.summary.total_skills,
        fulfilled_count: gapResult.summary.fulfilled_count,
        under_qualified_count: 0,
        pending_review_count: 0,
        missing_count: 0,
        readiness_percentage: gapResult.summary.readiness_percentage,
      },
      status: 'goal_reached',
      message: 'Selamat! Seluruh kriteria kompetensi untuk target karier ini telah terpenuhi.',
      gap_skills: [],
    };

    if (type === 'all' || type === 'courses') {
      responsePayload.courses = [];
    }
    if (type === 'all' || type === 'projects') {
      responsePayload.projects = [];
    }

    return responsePayload;
  }

  // 4. Filter skill gap yang menjadi sasaran rekomendasi: under-qualified atau missing
  const gapSkills = gapResult.skills.filter(
    (s) => s.gap_status === 'under-qualified' || s.gap_status === 'missing'
  );
  const fulfilledSkills = gapResult.skills.filter((s) => s.gap_status === 'fulfilled');

  // Jika tidak ada under-qualified atau missing tetapi ada pending_review
  if (gapSkills.length === 0) {
    const responsePayload = {
      career_target: {
        id: gapResult.career_target.id,
        title: gapResult.career_target.title,
        description: gapResult.career_target.description,
      },
      gap_summary: {
        total_skills: gapResult.summary.total_skills,
        fulfilled_count: gapResult.summary.fulfilled_count,
        under_qualified_count: gapResult.summary.under_qualified_count,
        pending_review_count: gapResult.summary.pending_review_count,
        missing_count: gapResult.summary.missing_count,
        readiness_percentage: gapResult.summary.readiness_percentage,
      },
      status: 'pending_review_only',
      message:
        'Seluruh kompetensi yang belum terpenuhi saat ini masih menunggu peninjauan hasil asesmen AI. Harap tinjau asesmen tersebut terlebih dahulu.',
      gap_skills: [],
    };

    if (type === 'all' || type === 'courses') {
      responsePayload.courses = [];
    }
    if (type === 'all' || type === 'projects') {
      responsePayload.projects = [];
    }

    return responsePayload;
  }

  // 5. Susun prompt dan panggil provider AI
  const { systemPrompt, prompt } = buildRecommendationPrompts(
    gapResult.career_target,
    gapSkills,
    fulfilledSkills,
    type
  );

  const provider = getAIProvider(customProvider);
  const rawResponseText = await provider.analyzeProject({ prompt, systemPrompt });

  // 6. Validasi ketat keluaran AI
  const gapSkillNames = gapSkills.map((s) => s.skill_name);
  const validatedOutput = validateAndSanitizeRecommendations(rawResponseText, gapSkillNames, type);

  // 7. Bentuk payload akhir yang informatif dan aman
  const responseData = {
    career_target: {
      id: gapResult.career_target.id,
      title: gapResult.career_target.title,
      description: gapResult.career_target.description,
    },
    gap_summary: {
      total_skills: gapResult.summary.total_skills,
      fulfilled_count: gapResult.summary.fulfilled_count,
      under_qualified_count: gapResult.summary.under_qualified_count,
      pending_review_count: gapResult.summary.pending_review_count,
      missing_count: gapResult.summary.missing_count,
      readiness_percentage: gapResult.summary.readiness_percentage,
    },
    gap_skills: gapSkills.map((s) => ({
      skill_id: s.skill_id,
      skill_name: s.skill_name,
      category: s.category,
      expected_level: s.target_requirement.expected_proficiency_level,
      expected_score: s.target_requirement.expected_score,
      current_level: s.user_competency?.proficiency_level || null,
      current_score: s.user_competency?.score ?? null,
      gap_status: s.gap_status,
    })),
  };

  if (type === 'all' || type === 'courses') {
    responseData.courses = validatedOutput.courses || [];
  }
  if (type === 'all' || type === 'projects') {
    responseData.projects = validatedOutput.projects || [];
  }

  return responseData;
}

