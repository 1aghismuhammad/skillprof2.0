import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { validateAssessmentsQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user-skills/assessments
 * Menampilkan daftar assessment yang perlu ditinjau oleh pengguna yang sedang terautentikasi.
 * Default filter: review_status = 'pending'. Mendukung filter status lain, source_type, dan paginasi.
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { valid, errors, data } = validateAssessmentsQuery(searchParams);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Parameter query tidak valid.', errors },
        { status: 400 }
      );
    }

    const { page, limit, status, sourceType } = data;
    const offset = (page - 1) * limit;

    const whereClauses = ['us.user_id = ?'];
    const queryParams = [user.id];

    if (status !== 'all') {
      whereClauses.push('usa.review_status = ?');
      queryParams.push(status);
    }

    if (sourceType !== 'all') {
      whereClauses.push('usa.source_type = ?');
      queryParams.push(sourceType);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // 1. Hitung total baris yang cocok
    const [countRows] = await pool.query(
      `SELECT COUNT(usa.id) AS total
       FROM user_skill_assessments usa
       JOIN user_skills us ON usa.user_skill_id = us.id
       JOIN skills s ON us.skill_id = s.id
       ${whereSql}`,
      queryParams
    );

    const total = Number(countRows[0]?.total || 0);

    // 2. Ambil daftar assessment beserta konteks skill dan proyek terkait
    const [assessments] = await pool.query(
      `SELECT usa.id, usa.user_skill_id, usa.source_type, usa.analysis_skill_id,
              usa.proficiency_level, usa.score, usa.notes, usa.review_status,
              usa.created_at,
              s.id AS skill_id, s.name AS skill_name, s.category AS skill_category,
              us.status AS user_skill_status,
              us.proficiency_level AS current_active_level,
              us.score AS current_active_score,
              p.id AS project_id, p.title AS project_title,
              aas.reasoning AS ai_reasoning
       FROM user_skill_assessments usa
       JOIN user_skills us ON usa.user_skill_id = us.id
       JOIN skills s ON us.skill_id = s.id
       LEFT JOIN ai_analysis_skills aas ON usa.analysis_skill_id = aas.id
       LEFT JOIN ai_analyses aa ON aas.analysis_id = aa.id
       LEFT JOIN projects p ON aa.project_id = p.id
       ${whereSql}
       ORDER BY usa.created_at DESC, usa.id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json(
      {
        status: 'success',
        data: assessments,
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching assessments:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat daftar assessment.' },
      { status: 500 }
    );
  }
}

