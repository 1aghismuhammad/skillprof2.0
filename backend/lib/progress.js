import pool from '@/lib/db';
import { calculateCareerTargetGap } from '@/lib/gap-analysis';

/**
 * Mengambil ringkasan progres kompetensi pengguna yang sedang terautentikasi.
 * Operasi ini murni READ-ONLY tanpa modifikasi data.
 *
 * @param {number} userId - ID pengguna
 * @param {object} [db] - Instance pool atau connection database
 * @returns {Promise<object>} Ringkasan progres kompetensi
 */
export async function getUserCompetencyProgressSummary(userId, db = pool) {
  // 1. Ambil seluruh skill aktif milik pengguna
  const [activeSkills] = await db.query(
    `SELECT us.id,
            us.skill_id,
            s.name AS skill_name,
            s.category AS skill_category,
            us.proficiency_level,
            us.score,
            us.updated_at
     FROM user_skills us
     JOIN skills s ON us.skill_id = s.id
     WHERE us.user_id = ? AND us.status = 'active'
     ORDER BY us.updated_at DESC, s.name ASC`,
    [userId]
  );

  const totalActiveSkills = activeSkills.length;

  // 2. Hitung distribusi tingkat kemahiran dan rata-rata skor
  const levelDistribution = {
    beginner: 0,
    intermediate: 0,
    advanced: 0,
  };

  let scoreSum = 0;
  let scoreCount = 0;

  for (const sk of activeSkills) {
    if (sk.proficiency_level && levelDistribution[sk.proficiency_level] !== undefined) {
      levelDistribution[sk.proficiency_level]++;
    }
    if (sk.score !== null && sk.score !== undefined) {
      scoreSum += Number(sk.score);
      scoreCount++;
    }
  }

  const averageScore = scoreCount > 0
    ? Math.round((scoreSum / scoreCount) * 10) / 10
    : null;

  // 3. Hitung total assessment yang berstatus 'accepted'
  const [acceptedCountRows] = await db.query(
    `SELECT COUNT(usa.id) AS total_accepted
     FROM user_skill_assessments usa
     JOIN user_skills us ON usa.user_skill_id = us.id
     WHERE us.user_id = ? AND usa.review_status = 'accepted'`,
    [userId]
  );
  const totalAcceptedAssessments = Number(acceptedCountRows[0]?.total_accepted || 0);

  // 4. Ambil ringkasan riwayat assessment terbaru yang berstatus accepted
  const [recentAssessments] = await db.query(
    `SELECT usa.id AS assessment_id,
            usa.user_skill_id,
            us.skill_id,
            s.name AS skill_name,
            s.category AS skill_category,
            usa.source_type,
            usa.proficiency_level,
            usa.score,
            usa.notes,
            usa.created_at,
            p.id AS project_id,
            p.title AS project_title
     FROM user_skill_assessments usa
     JOIN user_skills us ON usa.user_skill_id = us.id
     JOIN skills s ON us.skill_id = s.id
     LEFT JOIN ai_analysis_skills aas ON usa.analysis_skill_id = aas.id
     LEFT JOIN ai_analyses aa ON aas.analysis_id = aa.id
     LEFT JOIN projects p ON aa.project_id = p.id
     WHERE us.user_id = ? AND usa.review_status = 'accepted'
     ORDER BY usa.created_at DESC, usa.id DESC
     LIMIT 5`,
    [userId]
  );

  const formattedRecent = recentAssessments.map((a) => ({
    assessment_id: a.assessment_id,
    skill_id: a.skill_id,
    skill_name: a.skill_name,
    skill_category: a.skill_category,
    source_type: a.source_type,
    proficiency_level: a.proficiency_level,
    score: a.score,
    notes: a.notes,
    project: a.project_id ? { id: a.project_id, title: a.project_title } : null,
    created_at: a.created_at,
  }));

  return {
    summary: {
      total_active_skills: totalActiveSkills,
      level_distribution: levelDistribution,
      average_score: averageScore,
      skills_with_score_count: scoreCount,
      total_accepted_assessments: totalAcceptedAssessments,
    },
    active_skills: activeSkills.map((sk) => ({
      skill_id: sk.skill_id,
      skill_name: sk.skill_name,
      category: sk.skill_category,
      proficiency_level: sk.proficiency_level,
      score: sk.score,
      updated_at: sk.updated_at,
    })),
    recent_accepted_assessments: formattedRecent,
  };
}

/**
 * Mengambil detail perkembangan dan linimasa assessment untuk satu skill tertentu.
 * Pengguna hanya dapat mengakses skill yang ada di profil miliknya.
 *
 * @param {number} identifier - Master skill ID atau user_skills ID
 * @param {number} userId - ID pengguna
 * @param {object} [db] - Instance pool atau connection database
 * @returns {Promise<object|null>} Detail histori skill atau null jika tidak ditemukan / bukan milik user
 */
export async function getSkillProgressDetail(identifier, userId, db = pool) {
  // 1. Verifikasi kepemilikan skill pada profil pengguna
  // Mendukung identifier sebagai master skills.id maupun user_skills.id
  const [userSkillRows] = await db.query(
    `SELECT us.id AS user_skill_id,
            us.user_id,
            us.skill_id,
            us.proficiency_level,
            us.score,
            us.status,
            us.created_at,
            us.updated_at,
            s.id AS master_skill_id,
            s.name AS skill_name,
            s.category AS skill_category
     FROM user_skills us
     JOIN skills s ON us.skill_id = s.id
     WHERE us.user_id = ? AND (us.skill_id = ? OR us.id = ?)
     LIMIT 1`,
    [userId, identifier, identifier]
  );

  if (userSkillRows.length === 0) {
    return null; // Skill tidak ada pada profil pengguna atau bukan milik pengguna
  }

  const userSkill = userSkillRows[0];

  // 2. Ambil seluruh riwayat assessment untuk skill ini terurut kronologis secara deterministik
  const [assessmentRows] = await db.query(
    `SELECT usa.id AS assessment_id,
            usa.source_type,
            usa.review_status,
            usa.proficiency_level,
            usa.score,
            usa.notes,
            usa.created_at,
            p.id AS project_id,
            p.title AS project_title
     FROM user_skill_assessments usa
     LEFT JOIN ai_analysis_skills aas ON usa.analysis_skill_id = aas.id
     LEFT JOIN ai_analyses aa ON aas.analysis_id = aa.id
     LEFT JOIN projects p ON aa.project_id = p.id
     WHERE usa.user_skill_id = ?
     ORDER BY usa.created_at ASC, usa.id ASC`,
    [userSkill.user_skill_id]
  );

  const formattedAssessments = assessmentRows.map((a) => ({
    assessment_id: a.assessment_id,
    source_type: a.source_type,
    review_status: a.review_status,
    proficiency_level: a.proficiency_level,
    score: a.score,
    notes: a.notes,
    project: a.project_id ? { id: a.project_id, title: a.project_title } : null,
    created_at: a.created_at,
  }));

  // Hitung jumlah assessment per status
  let acceptedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const a of assessmentRows) {
    if (a.review_status === 'accepted') acceptedCount++;
    else if (a.review_status === 'pending') pendingCount++;
    else if (a.review_status === 'rejected') rejectedCount++;
  }

  return {
    skill: {
      id: userSkill.master_skill_id,
      name: userSkill.skill_name,
      category: userSkill.skill_category,
    },
    current_state: {
      user_skill_id: userSkill.user_skill_id,
      status: userSkill.status,
      proficiency_level: userSkill.proficiency_level,
      score: userSkill.score,
      updated_at: userSkill.updated_at,
    },
    assessment_statistics: {
      total_assessments: assessmentRows.length,
      accepted_count: acceptedCount,
      pending_count: pendingCount,
      rejected_count: rejectedCount,
    },
    assessment_history: formattedAssessments,
  };
}

/**
 * Mengambil evaluasi progres kompetensi terhadap target karier tertentu.
 * Menggunakan algoritma konsisten dari calculateCareerTargetGap.
 *
 * @param {number} targetId - ID target karier
 * @param {number} userId - ID pengguna
 * @param {object} [db] - Instance pool atau connection database
 * @returns {Promise<object|null>} Progres kesiapan target karier atau null jika tidak ditemukan
 */
export async function getCareerTargetCompetencyProgress(targetId, userId, db = pool) {
  // Panggil algoritma konsisten yang sudah diaudit dan diuji pada Tahap 9 & 10
  const gapResult = await calculateCareerTargetGap(targetId, userId, db);

  if (!gapResult) {
    return null; // Target karier tidak ditemukan atau bukan milik pengguna
  }

  // Jika target karier belum memiliki requirement kompetensi
  if (!gapResult.summary.has_requirements || gapResult.summary.total_skills === 0) {
    return {
      career_target: {
        id: gapResult.career_target.id,
        title: gapResult.career_target.title,
        description: gapResult.career_target.description,
        created_at: gapResult.career_target.created_at,
        updated_at: gapResult.career_target.updated_at,
      },
      has_requirements: false,
      readiness_percentage: 0.0,
      projected_readiness_percentage: 0.0,
      summary: gapResult.summary,
      skills_progress: [],
      message: 'Target karier belum memiliki kriteria kompetensi.',
    };
  }

  const skillsProgress = gapResult.skills.map((s) => ({
    skill_id: s.skill_id,
    skill_name: s.skill_name,
    category: s.category,
    target_requirement: s.target_requirement,
    current_proficiency: {
      status: s.user_competency?.status || 'missing',
      proficiency_level: s.user_competency?.proficiency_level || null,
      score: s.user_competency?.score ?? null,
      updated_at: s.user_competency?.updated_at || null,
    },
    gap_status: s.gap_status,
    is_fulfilled: s.gap_status === 'fulfilled',
    notes: s.notes,
  }));

  return {
    career_target: {
      id: gapResult.career_target.id,
      title: gapResult.career_target.title,
      description: gapResult.career_target.description,
      created_at: gapResult.career_target.created_at,
      updated_at: gapResult.career_target.updated_at,
    },
    has_requirements: true,
    readiness_percentage: gapResult.summary.readiness_percentage,
    projected_readiness_percentage: gapResult.summary.projected_readiness_percentage,
    summary: gapResult.summary,
    skills_progress: skillsProgress,
  };
}

