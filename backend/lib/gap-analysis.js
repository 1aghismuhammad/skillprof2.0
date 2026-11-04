import pool from '@/lib/db';

export const PROFICIENCY_ORDINAL = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * Menghitung analisis kesenjangan kompetensi untuk satu target karier tertentu.
 * Operasi ini murni READ-ONLY (tanpa penulisan ke database).
 *
 * @param {number} targetId - ID target karier
 * @param {number} userId - ID pengguna yang terautentikasi
 * @param {object} [db] - Instance koneksi / pool database
 * @returns {Promise<object|null>} Hasil analisis gap atau null jika tidak ditemukan/bukan pemilik
 */
export async function calculateCareerTargetGap(targetId, userId, db = pool) {
  // 1. Ambil target karier dan verifikasi kepemilikan
  const [targetRows] = await db.query(
    `SELECT id, user_id, title, description, created_at, updated_at
     FROM career_targets
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [targetId, userId]
  );

  if (targetRows.length === 0) {
    return null; // Target tidak ditemukan atau bukan milik pengguna
  }

  const target = targetRows[0];

  // 2. Ambil seluruh kebutuhan skill untuk target ini
  const [requirements] = await db.query(
    `SELECT cts.id AS requirement_id,
            cts.skill_id,
            s.name AS skill_name,
            s.category AS skill_category,
            cts.expected_proficiency_level,
            cts.expected_score
     FROM career_target_skills cts
     JOIN skills s ON cts.skill_id = s.id
     WHERE cts.career_target_id = ?
     ORDER BY cts.id ASC`,
    [targetId]
  );

  const totalSkills = requirements.length;

  // Kasus edge-case: target karier belum memiliki kriteria skill requirement
  if (totalSkills === 0) {
    return {
      career_target: {
        id: target.id,
        title: target.title,
        description: target.description,
        created_at: target.created_at,
        updated_at: target.updated_at,
      },
      summary: {
        total_skills: 0,
        fulfilled_count: 0,
        under_qualified_count: 0,
        pending_review_count: 0,
        missing_count: 0,
        readiness_percentage: 0.0,
        projected_readiness_percentage: 0.0,
        has_requirements: false,
        message: 'Target karier belum memiliki kriteria kompetensi.',
      },
      skills: [],
    };
  }

  const skillIds = requirements.map((r) => r.skill_id);

  // 3. Ambil data kompetensi pengguna pada skill terkait
  const [userSkillRows] = await db.query(
    `SELECT us.id,
            us.skill_id,
            us.status,
            us.proficiency_level,
            us.score,
            us.updated_at
     FROM user_skills us
     WHERE us.user_id = ? AND us.skill_id IN (?)`,
    [userId, skillIds]
  );

  const userSkillsMap = new Map();
  for (const row of userSkillRows) {
    userSkillsMap.set(row.skill_id, row);
  }

  // 4. Ambil assessment berstatus 'pending' terurut created_at DESC, id DESC
  const [pendingAssessmentRows] = await db.query(
    `SELECT usa.id,
            usa.user_skill_id,
            us.skill_id,
            usa.source_type,
            usa.proficiency_level,
            usa.score,
            usa.notes,
            usa.created_at
     FROM user_skill_assessments usa
     JOIN user_skills us ON usa.user_skill_id = us.id
     WHERE us.user_id = ? 
       AND us.skill_id IN (?) 
       AND usa.review_status = 'pending'
     ORDER BY usa.created_at DESC, usa.id DESC`,
    [userId, skillIds]
  );

  const latestPendingMap = new Map();
  const pendingCountMap = new Map();
  for (const row of pendingAssessmentRows) {
    pendingCountMap.set(row.skill_id, (pendingCountMap.get(row.skill_id) || 0) + 1);
    // Karena query terurut created_at DESC, entri pertama yang masuk adalah yang paling mutakhir
    if (!latestPendingMap.has(row.skill_id)) {
      latestPendingMap.set(row.skill_id, {
        id: row.id,
        source_type: row.source_type,
        proficiency_level: row.proficiency_level,
        score: row.score,
        notes: row.notes,
        created_at: row.created_at,
      });
    }
  }

  // 5. Evaluasi setiap kebutuhan skill sesuai aturan prioritas
  let fulfilledCount = 0;
  let underQualifiedCount = 0;
  let pendingReviewCount = 0;
  let missingCount = 0;

  const evaluatedSkills = requirements.map((req) => {
    const uSkill = userSkillsMap.get(req.skill_id);
    const latestPending = latestPendingMap.get(req.skill_id);
    const totalPendingForSkill = pendingCountMap.get(req.skill_id) || 0;

    let gapStatus = 'missing';
    let notes = '';
    let userCompetency = null;

    if (uSkill) {
      userCompetency = {
        user_skill_id: uSkill.id,
        status: uSkill.status,
        proficiency_level: uSkill.proficiency_level,
        score: uSkill.score,
        updated_at: uSkill.updated_at,
      };
    }

    let pendingAssessmentInfo = null;
    if (latestPending) {
      pendingAssessmentInfo = {
        assessment_id: latestPending.id,
        source_type: latestPending.source_type,
        proficiency_level: latestPending.proficiency_level,
        score: latestPending.score,
        notes: latestPending.notes,
        created_at: latestPending.created_at,
        total_pending: totalPendingForSkill,
      };
    }

    // PRIORITAS 1: Kompetensi aktif pada user_skills
    if (uSkill && uSkill.status === 'active') {
      const userLevelOrd = PROFICIENCY_ORDINAL[uSkill.proficiency_level] || 0;
      const expectedLevelOrd = PROFICIENCY_ORDINAL[req.expected_proficiency_level] || 0;

      const levelMet = userLevelOrd >= expectedLevelOrd;
      const scoreMet =
        req.expected_score === null ||
        req.expected_score === undefined ||
        uSkill.score >= req.expected_score;

      if (levelMet && scoreMet) {
        gapStatus = 'fulfilled';
        notes = 'Kompetensi aktif memenuhi kriteria target karier.';
        fulfilledCount++;
      } else {
        gapStatus = 'under-qualified';
        if (!levelMet && !scoreMet) {
          notes = `Tingkat kemahiran (${uSkill.proficiency_level}) dan skor (${uSkill.score}) masih di bawah target (${req.expected_proficiency_level}, skor ${req.expected_score}).`;
        } else if (!levelMet) {
          notes = `Tingkat kemahiran pengguna (${uSkill.proficiency_level}) masih di bawah target (${req.expected_proficiency_level}).`;
        } else {
          notes = `Skor kompetensi pengguna (${uSkill.score}) masih di bawah target (${req.expected_score}).`;
        }
        underQualifiedCount++;
      }

      // Jika ada assessment pending baru, sertakan sebagai data informatif tanpa menimpa status utama
      if (pendingAssessmentInfo) {
        userCompetency.pending_assessment = pendingAssessmentInfo;
      }
    }
    // PRIORITAS 2: Tidak ada skill aktif, namun ada rekomendasi AI yang menunggu peninjauan
    else if (pendingAssessmentInfo) {
      gapStatus = 'pending_review';
      notes = 'Terdapat rekomendasi AI yang menunggu peninjauan pengguna.';
      pendingReviewCount++;

      if (!userCompetency) {
        userCompetency = {
          user_skill_id: null,
          status: 'needs_review',
          proficiency_level: null,
          score: null,
        };
      }
      userCompetency.pending_assessment = pendingAssessmentInfo;
    }
    // PRIORITAS 3: Tidak ada skill aktif maupun assessment pending (missing atau rejected)
    else {
      gapStatus = 'missing';
      if (uSkill && uSkill.status === 'rejected') {
        notes = 'Kompetensi telah ditolak oleh pengguna sehingga belum ada bukti yang diakui.';
      } else {
        notes = 'Belum ada bukti proyek atau kompetensi terkait skill ini.';
      }
      missingCount++;
    }

    return {
      skill_id: req.skill_id,
      skill_name: req.skill_name,
      category: req.skill_category,
      target_requirement: {
        expected_proficiency_level: req.expected_proficiency_level,
        expected_score: req.expected_score,
      },
      user_competency: userCompetency,
      gap_status: gapStatus,
      notes,
    };
  });

  // Perhitungan persentase kesiapan
  const readinessPercentage = Math.round((fulfilledCount / totalSkills) * 1000) / 10;
  const projectedReadinessPercentage =
    Math.round(((fulfilledCount + 0.5 * underQualifiedCount) / totalSkills) * 1000) / 10;

  return {
    career_target: {
      id: target.id,
      title: target.title,
      description: target.description,
      created_at: target.created_at,
      updated_at: target.updated_at,
    },
    summary: {
      total_skills: totalSkills,
      fulfilled_count: fulfilledCount,
      under_qualified_count: underQualifiedCount,
      pending_review_count: pendingReviewCount,
      missing_count: missingCount,
      readiness_percentage: readinessPercentage,
      projected_readiness_percentage: projectedReadinessPercentage,
      has_requirements: true,
      message: 'Analisis kesenjangan kompetensi berhasil dihitung.',
    },
    skills: evaluatedSkills,
  };
}

/**
 * Menghitung ringkasan analisis kesenjangan untuk seluruh target karier milik pengguna.
 *
 * @param {number} userId - ID pengguna yang terautentikasi
 * @param {object} [db] - Instance koneksi / pool database
 * @returns {Promise<Array<object>>} Daftar analisis gap per target karier
 */
export async function calculateAllCareerTargetsGap(userId, db = pool) {
  const [targetRows] = await db.query(
    `SELECT id FROM career_targets WHERE user_id = ? ORDER BY id ASC`,
    [userId]
  );

  const results = [];
  for (const t of targetRows) {
    const gap = await calculateCareerTargetGap(t.id, userId, db);
    if (gap) {
      results.push(gap);
    }
  }
  return results;
}

