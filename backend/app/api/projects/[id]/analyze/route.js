import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateUrl } from '@/lib/validation';
import { executeProjectAnalysis } from '@/lib/ai/analyzer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/analyze
 * Meminta analisis kompetensi baru untuk proyek milik pengguna yang sedang terautentikasi.
 */
export async function POST(request, { params }) {
  let lockConnection = null;
  let lockedProjectId = null;

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
      `SELECT id, user_id, title, description, repository_url, live_url 
       FROM projects 
       WHERE id = ? AND user_id = ? LIMIT 1`,
      [projectId, user.id]
    );

    if (projects.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Proyek tidak ditemukan.' },
        { status: 404 }
      );
    }

    const project = projects[0];

    // 2. Validasi kelayakan deskripsi proyek untuk dianalisis
    const cleanDescription = (project.description || '').trim();
    if (!cleanDescription) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Deskripsi proyek kosong. Harap isi deskripsi proyek terlebih dahulu sebelum meminta analisis kompetensi.',
        },
        { status: 400 }
      );
    }

    if (cleanDescription.length > 4000) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Deskripsi proyek terlalu panjang untuk dianalisis (maksimal 4000 karakter).',
        },
        { status: 400 }
      );
    }

    // 3. Ambil dan validasi metadata bukti proyek
    const [evidences] = await pool.query(
      `SELECT id, project_id, title, evidence_type, url 
       FROM project_evidences 
       WHERE project_id = ? 
       ORDER BY id ASC`,
      [projectId]
    );

    for (const ev of evidences) {
      if (!validateUrl(ev.url, 500)) {
        return NextResponse.json(
          {
            status: 'error',
            message: `Bukti proyek "${ev.title}" memiliki tautan URL yang tidak valid. Perbaiki URL bukti sebelum menganalisis.`,
          },
          { status: 400 }
        );
      }
    }

    // 4. Cegah duplicate submission request dan analisis simultan menggunakan MariaDB User Lock
    // GET_LOCK dengan timeout 0 akan langsung mengembalikan 0 (gagal lock)
    // jika permintaan analisis untuk proyek ini sedang diproses oleh koneksi lain.
    lockConnection = await pool.getConnection();
    const lockKey = `skillproof_project_analyze_${projectId}`;
    const [lockRows] = await lockConnection.query(
      'SELECT GET_LOCK(?, 0) AS acquired',
      [lockKey]
    );

    if (!lockRows[0] || lockRows[0].acquired !== 1) {
      lockConnection.release();
      lockConnection = null;
      return NextResponse.json(
        {
          status: 'error',
          message: 'Analisis untuk proyek ini sedang berjalan. Harap tunggu beberapa saat.',
        },
        { status: 409 }
      );
    }
    lockedProjectId = projectId;

    // 5. Jalankan orkestrasi analisis AI dan persistensi transaksional
    const result = await executeProjectAnalysis({
      project,
      evidences,
    });

    return NextResponse.json(
      {
        status: 'success',
        message: 'Analisis kompetensi proyek berhasil diselesaikan.',
        data: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Project analysis error:', error.message);

    // Tangani skenario spesifik error provider
    if (error.message.includes('AI_API_KEY')) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Layanan analisis AI belum dikonfigurasi (AI_API_KEY tidak tersedia).',
        },
        { status: 503 }
      );
    }

    if (error.status === 429) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Layanan AI sedang mencapai batas frekuensi permintaan (rate limit). Silakan coba lagi beberapa saat lagi.',
        },
        { status: 429 }
      );
    }

    if (error.status === 504 || error.message.includes('batas waktu')) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Permintaan analisis ke layanan AI melampaui batas waktu (timeout).',
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Terjadi kesalahan pada server saat memproses analisis proyek.',
      },
      { status: 500 }
    );
  } finally {
    if (lockConnection && lockedProjectId) {
      try {
        await lockConnection.query('SELECT RELEASE_LOCK(?)', [`skillproof_project_analyze_${lockedProjectId}`]);
      } catch (err) {
        console.error('Error releasing analyze lock:', err.message);
      }
      lockConnection.release();
    }
  }
}
