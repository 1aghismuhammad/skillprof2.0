import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { validatePortfolioInput } from '@/lib/validation';
import { getUserPortfolio, savePortfolio } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolios
 * Mengambil data portofolio milik pengguna yang sedang terautentikasi.
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

    const portfolio = await getUserPortfolio(user.id);

    return NextResponse.json(
      {
        status: 'success',
        data: portfolio,
        message: portfolio ? undefined : 'Pengguna belum memiliki portofolio.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching user portfolio:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat portofolio.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolios
 * Membuat dan menyimpan portofolio baru untuk pengguna yang sedang login.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validatePortfolioInput(body, false);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi portofolio gagal.', errors },
        { status: 400 }
      );
    }

    const newPortfolio = await savePortfolio(user.id, data);

    return NextResponse.json(
      {
        status: 'success',
        message: 'Portofolio berhasil dibuat dan disimpan.',
        data: newPortfolio,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error saving portfolio:', error.message);
    const statusCode = error.status || 500;
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Terjadi kesalahan pada server saat menyimpan portofolio.',
      },
      { status: statusCode }
    );
  }
}

