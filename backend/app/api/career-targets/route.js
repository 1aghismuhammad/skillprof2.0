import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { validateCareerTargetInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const authenticated = await getAuthenticatedUser(request);

    if (!authenticated) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    // 1. Ambil seluruh target karier milik pengguna
    const [targetRows] = await pool.query(
      `SELECT id, title, description, created_at, updated_at
       FROM career_targets
       WHERE user_id = ?
       ORDER BY id ASC`,
      [authenticated.id]
    );

    if (targetRows.length === 0) {
      return NextResponse.json(
        {
          status: 'success',
          data: [],
        },
        { status: 200 }
      );
    }

    // 2. Ambil seluruh skill yang terkait dengan target karier pengguna secara efisien
    const [skillRows] = await pool.query(
      `SELECT cts.id, cts.career_target_id, cts.skill_id, s.name AS skill_name, s.category,
              cts.expected_proficiency_level, cts.expected_score
       FROM career_target_skills cts
       JOIN skills s ON cts.skill_id = s.id
       JOIN career_targets ct ON cts.career_target_id = ct.id
       WHERE ct.user_id = ?
       ORDER BY cts.id ASC`,
      [authenticated.id]
    );

    // 3. Kelompokkan skill per career_target_id tanpa menyebabkan duplikasi baris
    const skillsByTargetId = new Map();
    for (const row of skillRows) {
      if (!skillsByTargetId.has(row.career_target_id)) {
        skillsByTargetId.set(row.career_target_id, []);
      }
      skillsByTargetId.get(row.career_target_id).push({
        id: row.id,
        skill_id: row.skill_id,
        skill_name: row.skill_name,
        category: row.category,
        expected_proficiency_level: row.expected_proficiency_level,
        expected_score: row.expected_score,
      });
    }

    const data = targetRows.map((target) => {
      const skills = skillsByTargetId.get(target.id) || [];
      return {
        id: target.id,
        title: target.title,
        description: target.description,
        skills_count: skills.length,
        target_skills: skills,
        created_at: target.created_at,
        updated_at: target.updated_at,
      };
    });

    return NextResponse.json(
      {
        status: 'success',
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Career targets GET error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat mengambil daftar target karier.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authenticated = await getAuthenticatedUser(request);

    if (!authenticated) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { status: 'error', message: 'Payload JSON tidak valid.' },
        { status: 400 }
      );
    }

    const validation = validateCareerTargetInput(body, false);
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validasi target karier gagal.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const cleanData = validation.data;

    // 1. Validasi keberadaan master skill di katalog
    if (cleanData.target_skills && cleanData.target_skills.length > 0) {
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

    // 2. Periksa duplikasi nama target karier untuk pengguna yang sama
    const [existingTitle] = await pool.query(
      'SELECT id FROM career_targets WHERE user_id = ? AND title = ? LIMIT 1',
      [authenticated.id, cleanData.title]
    );

    if (existingTitle.length > 0) {
      return NextResponse.json(
        { status: 'error', message: `Target karier dengan judul '${cleanData.title}' sudah ada.` },
        { status: 409 }
      );
    }

    // 3. Simpan target karier dan relasi skill secara atomik dalam satu transaksi
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [targetResult] = await connection.query(
        'INSERT INTO career_targets (user_id, title, description) VALUES (?, ?, ?)',
        [authenticated.id, cleanData.title, cleanData.description]
      );
      const targetId = targetResult.insertId;

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

      await connection.commit();

      // Ambil kembali target yang baru dibuat beserta relasi skill
      const [targetRows] = await pool.query(
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

      const createdTarget = {
        id: targetRows[0].id,
        title: targetRows[0].title,
        description: targetRows[0].description,
        skills_count: skillRows.length,
        target_skills: skillRows,
        created_at: targetRows[0].created_at,
        updated_at: targetRows[0].updated_at,
      };

      return NextResponse.json(
        {
          status: 'success',
          message: 'Target karier berhasil dibuat.',
          data: createdTarget,
        },
        { status: 201 }
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
    console.error('Career targets POST error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat membuat target karier.' },
      { status: 500 }
    );
  }
}

