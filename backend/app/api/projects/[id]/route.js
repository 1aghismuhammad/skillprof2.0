import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateProjectInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]
 * Menampilkan detail satu proyek milik pengguna yang sedang terautentikasi.
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

    // 1. Ambil data proyek dengan otorisasi kepemilikan (user_id = user.id)
    const [projects] = await pool.query(
      `SELECT id, user_id, title, description, repository_url, live_url, 
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, 
              created_at, updated_at 
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

    // 2. Ambil bukti-bukti pendukung proyek
    const [evidences] = await pool.query(
      `SELECT id, project_id, title, evidence_type, url, created_at 
       FROM project_evidences 
       WHERE project_id = ? 
       ORDER BY id ASC`,
      [projectId]
    );

    return NextResponse.json(
      {
        status: 'success',
        data: {
          ...projects[0],
          evidences,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching project detail:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat detail proyek.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]
 * Memperbarui data proyek milik pengguna yang sedang terautentikasi.
 */
export async function PUT(request, { params }) {
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
    const projectId = parsePositiveInt(id);

    if (!projectId) {
      return NextResponse.json(
        { status: 'error', message: 'ID proyek tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Periksa keberadaan dan kepemilikan proyek
    const [existing] = await pool.query(
      `SELECT id, user_id, title, description, repository_url, live_url, 
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date 
       FROM projects 
       WHERE id = ? AND user_id = ? LIMIT 1`,
      [projectId, user.id]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Proyek tidak ditemukan.' },
        { status: 404 }
      );
    }

    const currentProject = existing[0];
    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateProjectInput(body, true);

    if (!valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validasi pembaruan proyek gagal.',
          errors,
        },
        { status: 400 }
      );
    }

    // 2. Gabungkan data baru dengan data lama yang tidak diperbarui
    const updatedTitle = data.title !== undefined ? data.title : currentProject.title;
    const updatedDescription = data.description !== undefined ? data.description : currentProject.description;
    const updatedRepo = data.repository_url !== undefined ? data.repository_url : currentProject.repository_url;
    const updatedLive = data.live_url !== undefined ? data.live_url : currentProject.live_url;
    const updatedStart = data.start_date !== undefined ? data.start_date : currentProject.start_date;
    const updatedEnd = data.end_date !== undefined ? data.end_date : currentProject.end_date;

    if (updatedStart && updatedEnd && updatedStart > updatedEnd) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validasi pembaruan proyek gagal.',
          errors: ['Tanggal selesai tidak boleh lebih awal dari tanggal mulai.'],
        },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. Jalankan query UPDATE dengan parameter binding dan proteksi user_id
    await connection.query(
      `UPDATE projects 
       SET title = ?, description = ?, repository_url = ?, live_url = ?, start_date = ?, end_date = ? 
       WHERE id = ? AND user_id = ?`,
      [
        updatedTitle,
        updatedDescription,
        updatedRepo,
        updatedLive,
        updatedStart,
        updatedEnd,
        projectId,
        user.id,
      ]
    );

    // 4. Perbarui bukti proyek secara atomik jika disertakan dalam payload
    if (data.evidences !== undefined) {
      await connection.query('DELETE FROM project_evidences WHERE project_id = ?', [projectId]);

      for (const ev of data.evidences) {
        await connection.query(
          `INSERT INTO project_evidences (project_id, title, evidence_type, url) 
           VALUES (?, ?, ?, ?)`,
          [projectId, ev.title, ev.evidence_type, ev.url]
        );
      }
    }

    // 5. Ambil data proyek yang telah diperbarui
    const [updatedProjects] = await connection.query(
      `SELECT id, user_id, title, description, repository_url, live_url, 
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, 
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, 
              created_at, updated_at 
       FROM projects 
       WHERE id = ? AND user_id = ? LIMIT 1`,
      [projectId, user.id]
    );

    const [evidences] = await connection.query(
      `SELECT id, project_id, title, evidence_type, url, created_at 
       FROM project_evidences 
       WHERE project_id = ? 
       ORDER BY id ASC`,
      [projectId]
    );

    await connection.commit();

    return NextResponse.json(
      {
        status: 'success',
        message: 'Proyek berhasil diperbarui.',
        data: {
          ...updatedProjects[0],
          evidences,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating project:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memperbarui proyek.' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * DELETE /api/projects/[id]
 * Menghapus proyek milik pengguna yang sedang terautentikasi.
 * Bukti terkait akan otomatis terhapus secara CASCADE di database.
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
    const projectId = parsePositiveInt(id);

    if (!projectId) {
      return NextResponse.json(
        { status: 'error', message: 'ID proyek tidak valid.' },
        { status: 400 }
      );
    }

    // Jalankan DELETE dengan parameter binding dan pembatasan kepemilikan user_id
    const [result] = await pool.query(
      'DELETE FROM projects WHERE id = ? AND user_id = ?',
      [projectId, user.id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Proyek tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        message: 'Proyek berhasil dihapus.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting project:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menghapus proyek.' },
      { status: 500 }
    );
  }
}
