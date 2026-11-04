import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user-skills/assessments/[id]
 * Menampilkan detail satu assessment milik pengguna yang sedang terautentikasi.
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
    const assessmentId = parsePositiveInt(id);

    if (!assessmentId) {
      return NextResponse.json(
        { status: 'error', message: 'ID assessment tidak valid.' },
        { status: 400 }
      );
    }

    // Ambil data assessment dengan verifikasi kepemilikan user_skills.user_id = user.id
    const [rows] = await pool.query(
      `SELECT usa.id, usa.user_skill_id, usa.source_type, usa.analysis_skill_id,
              usa.proficiency_level, usa.score, usa.notes, usa.review_status,
              usa.created_at,
              s.id AS skill_id, s.name AS skill_name, s.category AS skill_category,
              us.status AS user_skill_status,
              us.proficiency_level AS current_active_level,
              us.score AS current_active_score,
              p.id AS project_id, p.title AS project_title,
              aas.reasoning AS ai_reasoning,
              aa.id AS analysis_id,
              aa.created_at AS analyzed_at
       FROM user_skill_assessments usa
       JOIN user_skills us ON usa.user_skill_id = us.id
       JOIN skills s ON us.skill_id = s.id
       LEFT JOIN ai_analysis_skills aas ON usa.analysis_skill_id = aas.id
       LEFT JOIN ai_analyses aa ON aas.analysis_id = aa.id
       LEFT JOIN projects p ON aa.project_id = p.id
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

    return NextResponse.json(
      {
        status: 'success',
        data: rows[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching assessment detail:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat detail assessment.' },
      { status: 500 }
    );
  }
}

