import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt, validatePortfolioInput } from '@/lib/validation';
import { getPortfolioById, updatePortfolio, deletePortfolio } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolios/[id]
 * Mengambil detail portofolio berdasarkan ID dengan verifikasi kepemilikan.
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

    const portfolio = await getPortfolioById(portfolioId, user.id);

    if (!portfolio) {
      return NextResponse.json(
        { status: 'error', message: 'Portofolio tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: portfolio,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching portfolio by id:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat detail portofolio.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/portfolios/[id]
 * Memperbarui data portofolio, slug, urutan proyek & skill, serta status publikasi secara atomik.
 */
export async function PUT(request, { params }) {
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
    const { valid, errors, data } = validatePortfolioInput(body, true);

    if (!valid) {
      return NextResponse.json(
        { status: 'error', message: 'Validasi pembaruan portofolio gagal.', errors },
        { status: 400 }
      );
    }

    const updatedPortfolio = await updatePortfolio(portfolioId, user.id, data);

    return NextResponse.json(
      {
        status: 'success',
        message: 'Portofolio berhasil diperbarui.',
        data: updatedPortfolio,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating portfolio:', error.message);
    const statusCode = error.status || 500;
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Terjadi kesalahan pada server saat memperbarui portofolio.',
      },
      { status: statusCode }
    );
  }
}

/**
 * PATCH /api/portfolios/[id]
 * Memperbarui sebagian data portofolio (termasuk status publikasi, slug, kontak, proyek, skill).
 */
export async function PATCH(request, context) {
  return PUT(request, context);
}

/**
 * DELETE /api/portfolios/[id]
 * Menghapus portofolio pengguna beserta relasinya. Data proyek dan skill asli tetap utuh.
 */
export async function DELETE(request, { params }) {
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

    const result = await deletePortfolio(portfolioId, user.id);

    return NextResponse.json(
      {
        status: 'success',
        message: result.message,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting portfolio:', error.message);
    const statusCode = error.status || 500;
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Terjadi kesalahan pada server saat menghapus portofolio.',
      },
      { status: statusCode }
    );
  }
}

