import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateAssessmentRejectInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/user-skills/assessments/[id]/reject
 * Menolak assessment AI.
 * Ketentuan bisnis:
 * - Mengubah review_status assessment menjadi 'rejected'.
 * - Jika seluruh assessment untuk skill ini ditolak dan tidak ada assessment aktif/manual yang diterima,
 *   skill tidak boleh tampil sebagai kompetensi aktif (status user_skills diubah menjadi 'rejected').
 * - Jika masih ada assessment lain yang sudah accepted, skill tetap aktif.
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

    // Hanya assessment dengan status 'pending' yang dapat ditolak
    if (currentAssessment.review_status !== 'pending') {
      return NextResponse.json(
        {
          status: 'error',
          message: `Assessment ini sudah pernah ditinjau sebelumnya (status saat ini: "${currentAssessment.review_status}").`,
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateAssessmentRejectInput(body);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi penolakan assessment gagal.', errors },
        { status: 400 }
      );
    }

    const rejectionReason = data.notes || 'Ditolak oleh pengguna saat peninjauan.';
    const finalNotes = currentAssessment.notes
      ? `${currentAssessment.notes} [Alasan penolakan: ${rejectionReason}]`
      : rejectionReason;

    // 2. Transaksi pembaruan status assessment dan penyesuaian profil user_skills
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Update status assessment menjadi rejected
    await connection.query(
      `UPDATE user_skill_assessments 
       SET review_status = 'rejected', 
           notes = ? 
       WHERE id = ?`,
      [finalNotes, assessmentId]
    );

    // Hitung assessment lain pada user_skills terkait
    const [acceptedRows] = await connection.query(
      `SELECT COUNT(*) AS total 
       FROM user_skill_assessments 
       WHERE user_skill_id = ? AND review_status = 'accepted'`,
      [currentAssessment.user_skill_id]
    );
    const acceptedCount = Number(acceptedRows[0]?.total || 0);

    const [pendingRows] = await connection.query(
      `SELECT COUNT(*) AS total 
       FROM user_skill_assessments 
       WHERE user_skill_id = ? AND review_status = 'pending'`,
      [currentAssessment.user_skill_id]
    );
    const pendingCount = Number(pendingRows[0]?.total || 0);

    let finalUserSkillStatus = currentAssessment.user_skill_status;

    if (acceptedCount === 0) {
      if (pendingCount === 0) {
        // Semua assessment ditolak dan tidak ada assessment accepted
        // Skill tidak boleh tampil sebagai kompetensi aktif -> set 'rejected'
        finalUserSkillStatus = 'rejected';
        await connection.query(
          `UPDATE user_skills 
           SET status = 'rejected', proficiency_level = NULL, score = NULL 
           WHERE id = ? AND user_id = ?`,
          [currentAssessment.user_skill_id, user.id]
        );
      } else {
        // Masih ada assessment lain yang pending -> tetap 'needs_review'
        finalUserSkillStatus = 'needs_review';
        await connection.query(
          `UPDATE user_skills 
           SET status = 'needs_review' 
           WHERE id = ? AND user_id = ?`,
          [currentAssessment.user_skill_id, user.id]
        );
      }
    }
    // Jika acceptedCount > 0, status user_skills tetap 'active' dengan level/skor sebelumnya

    await connection.commit();

    return NextResponse.json(
      {
        status: 'success',
        message: 'Assessment berhasil ditolak.',
        data: {
          assessment_id: assessmentId,
          user_skill_id: currentAssessment.user_skill_id,
          skill_id: currentAssessment.skill_id,
          skill_name: currentAssessment.skill_name,
          review_status: 'rejected',
          user_skill_status: finalUserSkillStatus,
          notes: finalNotes,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error rejecting assessment:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menolak assessment.' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

