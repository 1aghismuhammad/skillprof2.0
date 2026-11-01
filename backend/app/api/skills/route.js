import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateSkillsQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/skills
 * Mengambil daftar katalog master skills dengan dukungan filter pencarian, kategori, dan paginasi.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const { valid, errors, data } = validateSkillsQuery(searchParams);

    if (!valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Parameter query tidak valid.',
          errors,
        },
        { status: 400 }
      );
    }

    const { page, limit, search, category } = data;
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const queryParams = [];

    // Filter pencarian nama skill
    if (search) {
      whereClauses.push('name LIKE ?');
      queryParams.push(`%${search}%`);
    }

    // Filter kategori skill
    if (category) {
      whereClauses.push('category = ?');
      queryParams.push(category);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Hitung total item yang cocok
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM skills ${whereSql}`,
      queryParams
    );
    const total = Number(countRows[0].total);

    // 2. Ambil data dengan pagination menggunakan parameter binding
    const [skills] = await pool.query(
      `SELECT id, name, category, created_at 
       FROM skills 
       ${whereSql} 
       ORDER BY category ASC, name ASC 
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
    console.error('Error fetching skills catalog:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat katalog skill.' },
      { status: 500 }
    );
  }
}
