import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  validateUserSkillsQuery,
  validateManualSkillInput,
} from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user-skills
 * Menampilkan daftar skill milik pengguna yang sedang terautentikasi.
 * Mendukung filter status (active, needs_review, rejected, all), kategori, pencarian, dan paginasi.
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
    const { valid, errors, data } = validateUserSkillsQuery(searchParams);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Parameter query tidak valid.', errors },
        { status: 400 }
      );
    }

    const { page, limit, status, category, search } = data;
    const offset = (page - 1) * limit;

    const whereClauses = ['us.user_id = ?'];
    const queryParams = [user.id];

    if (status !== 'all') {
      whereClauses.push('us.status = ?');
      queryParams.push(status);
    }

    if (category) {
      whereClauses.push('s.category = ?');
      queryParams.push(category);
    }

    if (search) {
      whereClauses.push('s.name LIKE ?');
      queryParams.push(`%${search}%`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // 1. Hitung total baris yang cocok
    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT us.id) AS total
       FROM user_skills us
       JOIN skills s ON us.skill_id = s.id
       ${whereSql}`,
      queryParams
    );

    const total = Number(countRows[0]?.total || 0);

    // 2. Ambil data skill dengan join katalog dan agregat assessment
    const [skills] = await pool.query(
      `SELECT us.id, us.user_id, us.skill_id, s.name AS skill_name, s.category,
              us.proficiency_level, us.score, us.status,
              us.created_at, us.updated_at,
              COUNT(usa.id) AS total_assessments
       FROM user_skills us
       JOIN skills s ON us.skill_id = s.id
       LEFT JOIN user_skill_assessments usa ON us.id = usa.user_skill_id
       ${whereSql}
       GROUP BY us.id
       ORDER BY 
         CASE us.status 
           WHEN 'active' THEN 1 
           WHEN 'needs_review' THEN 2 
           WHEN 'rejected' THEN 3 
           ELSE 4 
         END,
         us.updated_at DESC, 
         s.name ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json(
      {
        status: 'success',
        data: skills,
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
    console.error('Error fetching user skills:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat daftar skill.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user-skills
 * Menambahkan skill manual ke profil pengguna secara atomik.
 * Membuat user_skills aktif + user_skill_assessments accepted.
 */
export async function POST(request) {
  let connection = null;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateManualSkillInput(body);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi input skill gagal.', errors },
        { status: 400 }
      );
    }

    const { skill_id, proficiency_level, score, notes } = data;

    // 1. Verifikasi keberadaan skill di tabel master skills
    const [skillRows] = await pool.query(
      'SELECT id, name, category FROM skills WHERE id = ? LIMIT 1',
      [skill_id]
    );

    if (skillRows.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Skill tidak ditemukan dalam katalog master.' },
        { status: 404 }
      );
    }

    const masterSkill = skillRows[0];

    // 2. Periksa apakah user sudah memiliki skill ini
    const [existing] = await pool.query(
      'SELECT id, user_id, skill_id, proficiency_level, score, status FROM user_skills WHERE user_id = ? AND skill_id = ? LIMIT 1',
      [user.id, skill_id]
    );

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let userSkillId;

    if (existing.length > 0) {
      const current = existing[0];

      if (current.status === 'active') {
        // Skill sudah ada dan sudah aktif
        await connection.rollback();
        connection.release();
        connection = null;

        return NextResponse.json(
          {
            status: 'error',
            message: 'Skill ini sudah ada dalam profil aktif Anda. Gunakan fitur koreksi skill untuk memperbarui level atau skor.',
          },
          { status: 409 }
        );
      }

      // Jika sebelumnya berstatus 'needs_review' atau 'rejected', aktifkan kembali dengan input manual
      userSkillId = current.id;
      await connection.query(
        `UPDATE user_skills 
         SET proficiency_level = ?, score = ?, status = 'active' 
         WHERE id = ? AND user_id = ?`,
        [proficiency_level, score, userSkillId, user.id]
      );
    } else {
      // Buat entri baru di user_skills
      const [insertResult] = await connection.query(
        `INSERT INTO user_skills (user_id, skill_id, proficiency_level, score, status) 
         VALUES (?, ?, ?, ?, 'active')`,
        [user.id, skill_id, proficiency_level, score]
      );
      userSkillId = insertResult.insertId;
    }

    // 3. Buat assessment manual dengan status accepted
    const [assessmentResult] = await connection.query(
      `INSERT INTO user_skill_assessments 
       (user_skill_id, source_type, analysis_skill_id, proficiency_level, score, notes, review_status) 
       VALUES (?, 'manual', NULL, ?, ?, ?, 'accepted')`,
      [
        userSkillId,
        proficiency_level,
        score,
        notes || 'Ditambahkan secara manual oleh pengguna.',
      ]
    );

    await connection.commit();

    return NextResponse.json(
      {
        status: 'success',
        message: 'Skill berhasil ditambahkan ke profil pengguna.',
        data: {
          id: userSkillId,
          user_id: user.id,
          skill_id: masterSkill.id,
          skill_name: masterSkill.name,
          category: masterSkill.category,
          proficiency_level,
          score,
          status: 'active',
          assessment: {
            id: assessmentResult.insertId,
            source_type: 'manual',
            proficiency_level,
            score,
            notes: notes || 'Ditambahkan secara manual oleh pengguna.',
            review_status: 'accepted',
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error adding manual skill:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menambahkan skill.' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

