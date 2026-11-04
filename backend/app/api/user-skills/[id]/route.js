import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateSkillUpdateInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user-skills/[id]
 * Menampilkan detail satu skill milik pengguna beserta riwayat lengkap assessment (AI dan manual).
 */
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const userSkillId = parsePositiveInt(id);

    if (!userSkillId) {
      return NextResponse.json(
        { status: 'error', message: 'ID skill tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Ambil data skill dengan verifikasi kepemilikan user_id
    const [skills] = await pool.query(
      `SELECT us.id, us.user_id, us.skill_id, s.name AS skill_name, s.category,
              us.proficiency_level, us.score, us.status,
              us.created_at, us.updated_at
       FROM user_skills us
       JOIN skills s ON us.skill_id = s.id
       WHERE us.id = ? AND us.user_id = ?
       LIMIT 1`,
      [userSkillId, user.id]
    );

    if (skills.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Skill tidak ditemukan atau bukan milik Anda.' },
        { status: 404 }
      );
    }

    // 2. Ambil riwayat assessment terkait
    const [assessments] = await pool.query(
      `SELECT usa.id, usa.source_type, usa.analysis_skill_id,
              usa.proficiency_level, usa.score, usa.notes, usa.review_status,
              usa.created_at,
              p.id AS project_id, p.title AS project_title,
              aas.reasoning AS ai_reasoning
       FROM user_skill_assessments usa
       LEFT JOIN ai_analysis_skills aas ON usa.analysis_skill_id = aas.id
       LEFT JOIN ai_analyses aa ON aas.analysis_id = aa.id
       LEFT JOIN projects p ON aa.project_id = p.id
       WHERE usa.user_skill_id = ?
       ORDER BY usa.created_at DESC, usa.id DESC`,
      [userSkillId]
    );

    return NextResponse.json(
      {
        status: 'success',
        data: {
          ...skills[0],
          assessments,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching user skill detail:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat detail skill.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user-skills/[id]
 * Mengoreksi level kompetensi dan/atau skor untuk skill aktif milik pengguna.
 * Ketentuan:
 * - Hanya boleh mengubah skill aktif milik pengguna terkait.
 * - Assessment AI pending tidak tertimpa.
 * - Mencatat riwayat koreksi manual secara transaksional.
 */
export async function PATCH(request, { params }) {
  let connection = null;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const userSkillId = parsePositiveInt(id);

    if (!userSkillId) {
      return NextResponse.json(
        { status: 'error', message: 'ID skill tidak valid.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateSkillUpdateInput(body);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi pembaruan skill gagal.', errors },
        { status: 400 }
      );
    }

    // 1. Periksa keberadaan, kepemilikan, dan status skill
    const [existing] = await pool.query(
      `SELECT us.id, us.user_id, us.skill_id, us.proficiency_level, us.score, us.status,
              s.name AS skill_name, s.category
       FROM user_skills us
       JOIN skills s ON us.skill_id = s.id
       WHERE us.id = ? AND us.user_id = ?
       LIMIT 1`,
      [userSkillId, user.id]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Skill tidak ditemukan atau bukan milik Anda.' },
        { status: 404 }
      );
    }

    const currentSkill = existing[0];

    // Sesuai Aturan 5: PATCH hanya boleh mengubah skill aktif milik pengguna terkait
    if (currentSkill.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: `Hanya skill berstatus aktif yang dapat dikoreksi melalui endpoint ini. Status skill saat ini: "${currentSkill.status}".`,
        },
        { status: 400 }
      );
    }

    const updatedLevel = data.proficiency_level ?? currentSkill.proficiency_level;
    const updatedScore = data.score ?? currentSkill.score;
    const correctionNotes = data.notes || 'Koreksi manual profil skill oleh pengguna.';

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 2. Perbarui nilai aktif di user_skills
    await connection.query(
      `UPDATE user_skills 
       SET proficiency_level = ?, score = ? 
       WHERE id = ? AND user_id = ?`,
      [updatedLevel, updatedScore, userSkillId, user.id]
    );

    // 3. Catat riwayat koreksi manual di user_skill_assessments (status accepted)
    // Tanpa mengganggu atau menimpa assessment AI pending yang ada
    const [assessmentResult] = await connection.query(
      `INSERT INTO user_skill_assessments 
       (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
       VALUES (?, 'manual', NULL, ?, ?, ?, 'accepted')`,
      [userSkillId, updatedLevel, updatedScore, correctionNotes]
    );

    await connection.commit();

    return NextResponse.json(
      {
        status: 'success',
        message: 'Skill berhasil diperbarui.',
        data: {
          id: userSkillId,
          user_id: user.id,
          skill_id: currentSkill.skill_id,
          skill_name: currentSkill.skill_name,
          category: currentSkill.category,
          proficiency_level: updatedLevel,
          score: updatedScore,
          status: 'active',
          assessment: {
            id: assessmentResult.insertId,
            source_type: 'manual',
            proficiency_level: updatedLevel,
            score: updatedScore,
            notes: correctionNotes,
            review_status: 'accepted',
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating user skill:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memperbarui skill.' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * DELETE /api/user-skills/[id]
 * Menghapus skill dari profil pengguna secara soft delete dengan status 'rejected'.
 * Hal ini memastikan riwayat assessment AI dan manual tetap tersimpan aman.
 */
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const userSkillId = parsePositiveInt(id);

    if (!userSkillId) {
      return NextResponse.json(
        { status: 'error', message: 'ID skill tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kepemilikan dan status saat ini
    const [existing] = await pool.query(
      'SELECT id, user_id, status FROM user_skills WHERE id = ? AND user_id = ? LIMIT 1',
      [userSkillId, user.id]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Skill tidak ditemukan atau bukan milik Anda.' },
        { status: 404 }
      );
    }

    if (existing[0].status === 'rejected') {
      return NextResponse.json(
        { status: 'error', message: 'Skill ini sudah berstatus non-aktif/ditolak.' },
        { status: 400 }
      );
    }

    // 2. Soft delete dengan mengubah status ke 'rejected'
    await pool.query(
      `UPDATE user_skills 
       SET status = 'rejected' 
       WHERE id = ? AND user_id = ?`,
      [userSkillId, user.id]
    );

    return NextResponse.json(
      {
        status: 'success',
        message: 'Skill berhasil dinonaktifkan dari profil pengguna.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting user skill:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menonaktifkan skill.' },
      { status: 500 }
    );
  }
}

