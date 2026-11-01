import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { signToken, setAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { status: 'error', message: 'Payload JSON tidak valid.' },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // 1. Validasi Keberadaan Field
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { status: 'error', message: 'Email dan kata sandi wajib diisi.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Cari pengguna berdasarkan email menggunakan parameter binding
    const [users] = await pool.query(
      'SELECT id, name, email, password_hash, bio, avatar_url FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    // 3. Verifikasi Keberadaan Akun dan Password
    // Pesan error seragam untuk menghindari penyingkapan keberadaan akun (Account Enumeration)
    const genericAuthErrorMessage = 'Email atau kata sandi tidak valid.';

    if (users.length === 0) {
      return NextResponse.json(
        { status: 'error', message: genericAuthErrorMessage },
        { status: 401 }
      );
    }

    const user = users[0];
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordMatch) {
      return NextResponse.json(
        { status: 'error', message: genericAuthErrorMessage },
        { status: 401 }
      );
    }

    // 4. Terbitkan token JWT dan sematkan ke HttpOnly cookie
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    const token = await signToken(tokenPayload);

    // 5. Kembalikan respons profil pengguna TANPA password_hash
    const response = NextResponse.json(
      {
        status: 'success',
        message: 'Login berhasil.',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          bio: user.bio,
          avatar_url: user.avatar_url,
        },
      },
      { status: 200 }
    );

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error('Login error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat login.' },
      { status: 500 }
    );
  }
}
