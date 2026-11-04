import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser, clearAuthCookie } from '@/lib/auth';
import { validateProfileUpdateInput } from '@/lib/validation';

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

    const [rows] = await pool.query(
      'SELECT id, name, email, bio, avatar_url, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [authenticated.id]
    );

    if (rows.length === 0) {
      const response = NextResponse.json(
        { status: 'error', message: 'Pengguna tidak ditemukan.' },
        { status: 401 }
      );
      clearAuthCookie(response);
      return response;
    }

    const userProfile = rows[0];

    return NextResponse.json(
      {
        status: 'success',
        data: userProfile,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Profile GET error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat mengambil data profil.' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
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

    const validation = validateProfileUpdateInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validasi pembaruan profil gagal.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const { cleanData } = { cleanData: validation.data };

    const updateFields = ['name = ?'];
    const updateParams = [cleanData.name];

    if (cleanData.bio !== undefined) {
      updateFields.push('bio = ?');
      updateParams.push(cleanData.bio);
    }

    if (cleanData.avatar_url !== undefined) {
      updateFields.push('avatar_url = ?');
      updateParams.push(cleanData.avatar_url);
    }

    updateParams.push(authenticated.id);

    await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateParams
    );

    const [rows] = await pool.query(
      'SELECT id, name, email, bio, avatar_url, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [authenticated.id]
    );

    return NextResponse.json(
      {
        status: 'success',
        message: 'Profil berhasil diperbarui.',
        data: rows[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Profile PUT error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memperbarui profil.' },
      { status: 500 }
    );
  }
}

