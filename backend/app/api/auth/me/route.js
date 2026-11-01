import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthenticatedUser, clearAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // 1. Ekstraksi dan verifikasi pengguna dari cookie sesi
    const authenticated = await getAuthenticatedUser(request);

    if (!authenticated) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    // 2. Ambil data profil mutakhir dari database menggunakan parameter binding
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

    // 3. Kembalikan data profil (tanpa password_hash)
    return NextResponse.json(
      {
        status: 'success',
        user: userProfile,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Auth check error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memeriksa sesi pengguna.' },
      { status: 500 }
    );
  }
}
