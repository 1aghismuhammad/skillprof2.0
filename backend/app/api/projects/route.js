import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { validateProjectInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects
 * Menampilkan seluruh daftar proyek milik pengguna yang sedang terautentikasi.
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

    // Ambil daftar proyek milik pengguna dengan parameter binding
    const [projects] = await pool.query(
      `SELECT id, user_id, title, description, repository_url, live_url, 
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, 
              created_at, updated_at 
       FROM projects 
       WHERE user_id = ? 
       ORDER BY created_at DESC, id DESC`,
      [user.id]
    );

    return NextResponse.json(
      {
        status: 'success',
        data: projects,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching projects:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat daftar proyek.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects
 * Membuat proyek baru untuk pengguna yang sedang login.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateProjectInput(body, false);

    if (!valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validasi data proyek gagal.',
          errors,
        },
        { status: 400 }
      );
    }

    // 1. Simpan data proyek ke tabel projects menggunakan parameter binding
    const [result] = await pool.query(
      `INSERT INTO projects (user_id, title, description, repository_url, live_url, start_date, end_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        data.title,
        data.description,
        data.repository_url,
        data.live_url,
        data.start_date,
        data.end_date,
      ]
    );

    const projectId = result.insertId;

    // 2. Simpan bukti proyek (project_evidences) jika dilampirkan
    const savedEvidences = [];
    if (data.evidences && data.evidences.length > 0) {
      for (const ev of data.evidences) {
        const [evResult] = await pool.query(
          `INSERT INTO project_evidences (project_id, title, evidence_type, url) 
           VALUES (?, ?, ?, ?)`,
          [projectId, ev.title, ev.evidence_type, ev.url]
        );
        savedEvidences.push({
          id: evResult.insertId,
          project_id: projectId,
          title: ev.title,
          evidence_type: ev.evidence_type,
          url: ev.url,
        });
      }
    }

    // 3. Ambil data proyek yang baru disimpan
    const [newProjects] = await pool.query(
      `SELECT id, user_id, title, description, repository_url, live_url, 
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, 
              created_at, updated_at 
       FROM projects 
       WHERE id = ? AND user_id = ? LIMIT 1`,
      [projectId, user.id]
    );

    const projectData = {
      ...newProjects[0],
      evidences: savedEvidences,
    };

    return NextResponse.json(
      {
        status: 'success',
        message: 'Proyek berhasil dibuat.',
        data: projectData,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating project:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat membuat proyek.' },
      { status: 500 }
    );
  }
}
