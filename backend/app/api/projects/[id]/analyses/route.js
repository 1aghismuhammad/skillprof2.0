import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/analyses
 * Menampilkan riwayat seluruh sesi analisis AI untuk proyek milik pengguna yang terautentikasi.
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
    const projectId = parsePositiveInt(id);

    if (!projectId) {
      return NextResponse.json(
        { status: 'error', message: 'ID proyek tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kepemilikan proyek
    const [projects] = await pool.query(
      'SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1',
      [projectId, user.id]
    );

    if (projects.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Proyek tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Ambil riwayat analisis beserta jumlah skill yang berhasil dipetakan
    const [analyses] = await pool.query(
      `SELECT aa.id, aa.project_id, aa.summary, aa.feedback, aa.status, 
              COUNT(aas.id) AS total_skills,
              aa.created_at 
       FROM ai_analyses aa
       LEFT JOIN ai_analysis_skills aas ON aa.id = aas.analysis_id
       WHERE aa.project_id = ?
       GROUP BY aa.id
       ORDER BY aa.created_at DESC, aa.id DESC`,
      [projectId]
    );

    return NextResponse.json(
      {
        status: 'success',
        data: analyses,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching project analyses:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat riwayat analisis proyek.' },
      { status: 500 }
    );
  }
}
