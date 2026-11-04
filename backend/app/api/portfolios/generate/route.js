import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { generatePortfolioDraft } from '@/lib/ai/portfolio-builder';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portfolios/generate
 * Menghasilkan draf portofolio kompetensi AI secara murni in-memory / stateless tanpa menyimpan otomatis ke database.
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

    const body = await request.json().catch(() => ({}));
    const draft = await generatePortfolioDraft(user.id, body || {});

    return NextResponse.json(
      {
        status: 'success',
        message: 'Draf portofolio berhasil dihasilkan oleh AI. Silakan tinjau dan simpan perubahan.',
        data: draft,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Portfolio generate error:', error.message);
    const statusCode = error.status || 500;
    return NextResponse.json(
      {
        status: 'error',
        message: error.message || 'Terjadi kesalahan pada server saat menghasilkan draf portofolio.',
      },
      { status: statusCode }
    );
  }
}

