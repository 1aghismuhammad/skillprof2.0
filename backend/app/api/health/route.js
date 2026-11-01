import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Uji koneksi database menggunakan query ringan
    await pool.query('SELECT 1 + 1 AS result, NOW() AS db_time');

    return NextResponse.json(
      {
        status: 'healthy',
        service: 'skillproof-backend',
        database: {
          status: 'connected',
          name: process.env.DB_NAME || 'skillproof',
        },
        timestamp,
      },
      { status: 200 }
    );
  } catch (error) {
    // Catat log error internal untuk debugging pengembang,
    // jangan ekspos detail kredensial atau connection string ke client.
    console.error('Health check database connection error:', error.message);

    return NextResponse.json(
      {
        status: 'unhealthy',
        service: 'skillproof-backend',
        database: {
          status: 'disconnected',
          message: 'Koneksi database gagal atau tidak tersedia.',
        },
        timestamp,
      },
      { status: 503 }
    );
  }
}
