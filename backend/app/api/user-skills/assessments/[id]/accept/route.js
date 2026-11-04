import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateAssessmentAcceptInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/user-skills/assessments/[id]/accept
 * Menerima assessment AI (dengan opsi menerima rekomendasi langsung atau dengan koreksi proficiency/skor).
 * Mengubah review_status assessment menjadi 'accepted' dan user_skills menjadi 'active' secara transaksional.
 */
export async function POST(request, { params }) {
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
    const assessmentId = parsePositiveInt(id);

    if (!assessmentId) {
      return NextResponse.json(
        { status: 'error', message: 'ID assessment tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Ambil data assessment dan verifikasi kepemilikan
    const [rows] = await pool.query(
      `SELECT usa.id, usa.user_skill_id, usa.source_type, usa.analysis_skill_id,
              usa.proficiency_level, usa.score, usa.notes, usa.review_status,
              us.user_id, us.skill_id, us.status AS user_skill_status,
              s.name AS skill_name, s.category AS skill_category
       FROM user_skill_assessments usa
       JOIN user_skills us ON usa.user_skill_id = us.id
       JOIN skills s ON us.skill_id = s.id
       WHERE usa.id = ? AND us.user_id = ?
       LIMIT 1`,
      [assessmentId, user.id]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Assessment tidak ditemukan atau bukan milik Anda.' },
        { status: 404 }
      );
    }

    const currentAssessment = rows[0];

    // Hanya assessment dengan status 'pending' yang dapat ditinjau
    if (currentAssessment.review_status !== 'pending') {
      return NextResponse.json(
        {
          status: 'error',
          message: `Assessment ini sudah pernah ditinjau sebelumnya (status saat ini: "${currentAssessment.review_status}").`,
        },
        { status: 400 }
      );
    }

    // 2. Validasi input koreksi opsional dari payload body
    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateAssessmentAcceptInput(body);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi penerimaan assessment gagal.', errors },
        { status: 400 }
      );
    }

    const acceptedLevel = data.proficiency_level ?? currentAssessment.proficiency_level;
    const acceptedScore = data.score ?? currentAssessment.score;

    let finalNotes = currentAssessment.notes || '';
    if (data.notes) {
      finalNotes = data.notes;
    } else if (data.hasCorrection) {
      finalNotes = finalNotes
        ? `${finalNotes} [Diterima dengan koreksi pengguna: ${acceptedLevel}, skor: ${acceptedScore}]`
        : `Diterima dengan koreksi pengguna: ${acceptedLevel}, skor: ${acceptedScore}`;
    }

    // 3. Jalankan pembaruan secara transaksional
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Update assessment menjadi accepted
    await connection.query(
      `UPDATE user_skill_assessments 
       SET review_status = 'accepted', 
           proficiency_level = ?, 
           score = ?, 
           notes = ? 
       WHERE id = ?`,
      [acceptedLevel, acceptedScore, finalNotes, assessmentId]
    );

    // Update user_skills menjadi active dengan level dan skor yang disetujui
    await connection.query(
      `UPDATE user_skills 
       SET status = 'active', 
           proficiency_level = ?, 
           score = ? 
       WHERE id = ? AND user_id = ?`,
      [acceptedLevel, acceptedScore, currentAssessment.user_skill_id, user.id]
    );

    await connection.commit();

    return NextResponse.json(
      {
        status: 'success',
        message: data.hasCorrection
          ? 'Assessment AI berhasil diterima dengan koreksi dan disimpan ke profil aktif.'
          : 'Assessment AI berhasil diterima dan disimpan ke profil aktif.',
        data: {
          assessment_id: assessmentId,
          user_skill_id: currentAssessment.user_skill_id,
          skill_id: currentAssessment.skill_id,
          skill_name: currentAssessment.skill_name,
          category: currentAssessment.skill_category,
          proficiency_level: acceptedLevel,
          score: acceptedScore,
          review_status: 'accepted',
          user_skill_status: 'active',
          notes: finalNotes,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error accepting assessment:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menerima assessment.' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

