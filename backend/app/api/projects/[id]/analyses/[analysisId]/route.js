import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/analyses/[analysisId]
 * Menampilkan detail lengkap satu sesi analisis AI beserta daftar skill dan penalaran AI.
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

    const { id, analysisId } = await params;
    const projectId = parsePositiveInt(id);
    const parsedAnalysisId = parsePositiveInt(analysisId);

    if (!projectId || !parsedAnalysisId) {
      return NextResponse.json(
        { status: 'error', message: 'ID proyek atau ID analisis tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kepemilikan proyek dan analisis
    const [analyses] = await pool.query(
      `SELECT aa.id, aa.project_id, aa.summary, aa.feedback, aa.raw_response, aa.status, aa.created_at 
       FROM ai_analyses aa
       JOIN projects p ON aa.project_id = p.id
       WHERE aa.id = ? AND aa.project_id = ? AND p.user_id = ? 
       LIMIT 1`,
      [parsedAnalysisId, projectId, user.id]
    );

    if (analyses.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Detail analisis tidak ditemukan atau bukan milik Anda.' },
        { status: 404 }
      );
    }

    const analysis = analyses[0];

    // 2. Ambil daftar skill yang berhasil dipetakan ke katalog master
    const [skills] = await pool.query(
      `SELECT aas.id, aas.skill_id, s.name AS skill_name, s.category, 
              aas.proficiency_level, aas.score, aas.reasoning, aas.created_at 
       FROM ai_analysis_skills aas
       JOIN skills s ON aas.skill_id = s.id
       WHERE aas.analysis_id = ?
       ORDER BY aas.score DESC, s.name ASC`,
      [parsedAnalysisId]
    );

    // 3. Parse raw_response JSON secara aman
    let parsedRawResponse = null;
    if (analysis.raw_response) {
      try {
        parsedRawResponse = typeof analysis.raw_response === 'string'
          ? JSON.parse(analysis.raw_response)
          : analysis.raw_response;
      } catch {
        parsedRawResponse = null;
      }
    }

    return NextResponse.json(
      {
        status: 'success',
        data: {
          id: analysis.id,
          project_id: analysis.project_id,
          summary: analysis.summary,
          feedback: analysis.feedback,
          status: analysis.status,
          created_at: analysis.created_at,
          skills,
          raw_response: parsedRawResponse,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching analysis detail:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat detail analisis.' },
      { status: 500 }
    );
  }
}
