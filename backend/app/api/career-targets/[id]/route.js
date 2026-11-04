import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateCareerTargetInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const authenticated = await getAuthenticatedUser(request);

    if (!authenticated) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const targetId = parsePositiveInt(resolvedParams?.id);

    if (!targetId) {
      return NextResponse.json(
        { status: 'error', message: 'ID target karier tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kepemilikan target karier (akses lintas user mengembalikan 404)
    const [targetRows] = await pool.query(
      `SELECT id, title, description, created_at, updated_at
       FROM career_targets
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [targetId, authenticated.id]
    );

    if (targetRows.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Target karier tidak ditemukan.' },
        { status: 404 }
      );
    }

    const target = targetRows[0];

    // 2. Ambil seluruh kebutuhan skill untuk target ini
    const [skillRows] = await pool.query(
      `SELECT cts.id, cts.skill_id, s.name AS skill_name, s.category,
              cts.expected_proficiency_level, cts.expected_score
       FROM career_target_skills cts
       JOIN skills s ON cts.skill_id = s.id
       WHERE cts.career_target_id = ?
       ORDER BY cts.id ASC`,
      [targetId]
    );

    return NextResponse.json(
      {
        status: 'success',
        data: {
          id: target.id,
          title: target.title,
          description: target.description,
          skills_count: skillRows.length,
          target_skills: skillRows,
          created_at: target.created_at,
          updated_at: target.updated_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Career target detail GET error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat mengambil detail target karier.' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const authenticated = await getAuthenticatedUser(request);

    if (!authenticated) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const targetId = parsePositiveInt(resolvedParams?.id);

    if (!targetId) {
      return NextResponse.json(
        { status: 'error', message: 'ID target karier tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kepemilikan target karier sebelum memperbarui
    const [existingTarget] = await pool.query(
      'SELECT id, title, description FROM career_targets WHERE id = ? AND user_id = ? LIMIT 1',
      [targetId, authenticated.id]
    );

    if (existingTarget.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Target karier tidak ditemukan.' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { status: 'error', message: 'Payload JSON tidak valid.' },
        { status: 400 }
      );
    }

    const validation = validateCareerTargetInput(body, true);
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validasi pembaruan target karier gagal.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const cleanData = validation.data;

    // 2. Jika title diubah, periksa agar tidak duplikat dengan target lain milik user
    if (cleanData.title !== undefined) {
      const [duplicateCheck] = await pool.query(
        'SELECT id FROM career_targets WHERE user_id = ? AND title = ? AND id != ? LIMIT 1',
        [authenticated.id, cleanData.title, targetId]
      );

      if (duplicateCheck.length > 0) {
        return NextResponse.json(
          { status: 'error', message: `Target karier dengan judul '${cleanData.title}' sudah ada.` },
          { status: 409 }
        );
      }
    }

    // 3. Jika target_skills dikirimkan dan berisi item, validasi keberadaan di katalog master skill
    if (body.target_skills !== undefined && cleanData.target_skills && cleanData.target_skills.length > 0) {
      const skillIds = cleanData.target_skills.map((s) => s.skill_id);
      const [existingSkills] = await pool.query(
        'SELECT id FROM skills WHERE id IN (?)',
        [skillIds]
      );
      const existingSkillIds = new Set(existingSkills.map((s) => s.id));
      for (const id of skillIds) {
        if (!existingSkillIds.has(id)) {
          return NextResponse.json(
            { status: 'error', message: `Skill dengan ID ${id} tidak ditemukan dalam katalog master skill.` },
            { status: 400 }
          );
        }
      }
    }

    // 4. Jalankan transaksi untuk pembaruan target karier dan relasi skill
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updateFields = [];
      const updateParams = [];

      if (cleanData.title !== undefined) {
        updateFields.push('title = ?');
        updateParams.push(cleanData.title);
      }

      if (cleanData.description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(cleanData.description);
      }

      if (updateFields.length > 0) {
        updateParams.push(targetId);
        await connection.query(
          `UPDATE career_targets SET ${updateFields.join(', ')} WHERE id = ?`,
          updateParams
        );
      }

      // Perilaku target_skills:
      // - Tidak dikirim (undefined): pertahankan daftar skill lama
      // - Array kosong ([]): hapus seluruh skill target
      // - Array berisi item: ganti seluruh daftar skill secara atomik
      if (body.target_skills !== undefined) {
        await connection.query(
          'DELETE FROM career_target_skills WHERE career_target_id = ?',
          [targetId]
        );

        if (cleanData.target_skills && cleanData.target_skills.length > 0) {
          for (const item of cleanData.target_skills) {
            await connection.query(
              `INSERT INTO career_target_skills 
               (career_target_id, skill_id, expected_proficiency_level, expected_score)
               VALUES (?, ?, ?, ?)`,
              [targetId, item.skill_id, item.expected_proficiency_level, item.expected_score]
            );
          }
        }
      }

      await connection.commit();

      // Ambil kembali target yang telah diperbarui
      const [updatedRows] = await pool.query(
        'SELECT id, title, description, created_at, updated_at FROM career_targets WHERE id = ?',
        [targetId]
      );

      const [skillRows] = await pool.query(
        `SELECT cts.id, cts.skill_id, s.name AS skill_name, s.category,
                cts.expected_proficiency_level, cts.expected_score
         FROM career_target_skills cts
         JOIN skills s ON cts.skill_id = s.id
         WHERE cts.career_target_id = ?
         ORDER BY cts.id ASC`,
        [targetId]
      );

      return NextResponse.json(
        {
          status: 'success',
          message: 'Target karier berhasil diperbarui.',
          data: {
            id: updatedRows[0].id,
            title: updatedRows[0].title,
            description: updatedRows[0].description,
            skills_count: skillRows.length,
            target_skills: skillRows,
            created_at: updatedRows[0].created_at,
            updated_at: updatedRows[0].updated_at,
          },
        },
        { status: 200 }
      );
    } catch (err) {
      await connection.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        return NextResponse.json(
          { status: 'error', message: `Target karier dengan judul '${cleanData.title}' sudah ada.` },
          { status: 409 }
        );
      }
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Career target PUT error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memperbarui target karier.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const authenticated = await getAuthenticatedUser(request);

    if (!authenticated) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const targetId = parsePositiveInt(resolvedParams?.id);

    if (!targetId) {
      return NextResponse.json(
        { status: 'error', message: 'ID target karier tidak valid.' },
        { status: 400 }
      );
    }

    // 1. Verifikasi kepemilikan target karier
    const [existingTarget] = await pool.query(
      'SELECT id FROM career_targets WHERE id = ? AND user_id = ? LIMIT 1',
      [targetId, authenticated.id]
    );

    if (existingTarget.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Target karier tidak ditemukan.' },
        { status: 404 }
      );
    }

    // 2. Hapus target karier (ON DELETE CASCADE otomatis menghapus relasi di career_target_skills)
    await pool.query(
      'DELETE FROM career_targets WHERE id = ? AND user_id = ?',
      [targetId, authenticated.id]
    );

    return NextResponse.json(
      {
        status: 'success',
        message: 'Target karier berhasil dihapus.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Career target DELETE error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menghapus target karier.' },
      { status: 500 }
    );
  }
}

