import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validateSharingInput } from '@/lib/validation';
import { getPortfolioSharingSettings, updatePortfolioSharing } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolios/[id]/sharing
 * Mengambil pengaturan berbagi dan privasi portofolio milik pengguna aktif.
 */
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const portfolioId = parsePositiveInt(resolvedParams?.id);

    if (!portfolioId) {
      return NextResponse.json(
        { status: 'error', message: 'ID portofolio tidak valid.' },
        { status: 400 }
      );
    }

    const settings = await getPortfolioSharingSettings(portfolioId, user.id);

    if (!settings) {
      return NextResponse.json(
        { status: 'error', message: 'Portofolio tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: settings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching portfolio sharing settings:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat pengaturan berbagi.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/portfolios/[id]/sharing
 * Memperbarui pengaturan berbagi (is_published, slug, email publik, link sosial).
 */
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const portfolioId = parsePositiveInt(resolvedParams?.id);

    if (!portfolioId) {
      return NextResponse.json(
        { status: 'error', message: 'ID portofolio tidak valid.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const { valid, errors, data } = validateSharingInput(body);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi pengaturan berbagi gagal.', errors },
        { status: 400 }
      );
    }

    const updatedSettings = await updatePortfolioSharing(portfolioId, user.id, data);

    return NextResponse.json(
      {
        status: 'success',
        message: 'Pengaturan berbagi portofolio berhasil diperbarui.',
        data: updatedSettings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating portfolio sharing settings:', error.message);
    const statusCode = error.status || 500;
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Terjadi kesalahan pada server saat memperbarui pengaturan berbagi.',
      },
      { status: statusCode }
    );
  }
}

export async function PUT(request, context) {
  return PATCH(request, context);
}

