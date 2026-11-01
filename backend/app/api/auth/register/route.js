import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { signToken, setAuthCookie } from '@/lib/auth';
import { validateEmail, validatePassword, validateName } from '@/lib/validation';

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

    const { name, email, password } = body;

    // 1. Validasi Input
    if (!validateName(name)) {
      return NextResponse.json(
        { status: 'error', message: 'Nama harus memiliki panjang antara 2 hingga 100 karakter.' },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { status: 'error', message: 'Format alamat email tidak valid.' },
        { status: 400 }
      );
    }

    if (!validatePassword(password)) {
      return NextResponse.json(
        { status: 'error', message: 'Kata sandi minimal terdiri dari 8 karakter.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // 2. Periksa apakah email sudah terdaftar
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { status: 'error', message: 'Alamat email sudah terdaftar. Silakan gunakan email lain atau login.' },
        { status: 409 }
      );
    }

    // 3. Hashing password menggunakan bcryptjs (10 salt rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Simpan pengguna baru ke database dengan parameter binding
    const [insertResult] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [cleanName, normalizedEmail, passwordHash]
    );

    const newUser = {
      id: insertResult.insertId,
      name: cleanName,
      email: normalizedEmail,
    };

    // 5. Terbitkan JWT dan sematkan ke HttpOnly cookie
    const token = await signToken(newUser);

    const response = NextResponse.json(
      {
        status: 'success',
        message: 'Registrasi berhasil.',
        user: newUser,
      },
      { status: 201 }
    );

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    // Tangani kemungkinan race condition duplicate entry pada unique constraint database
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { status: 'error', message: 'Alamat email sudah terdaftar.' },
        { status: 409 }
      );
    }

    console.error('Registration error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat registrasi.' },
      { status: 500 }
    );
  }
}
