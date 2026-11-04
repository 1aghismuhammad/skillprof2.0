import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getUserCompetencyProgressSummary } from '@/lib/progress';

export const dynamic = 'force-dynamic';

/**
 * GET /api/competency-progress
 * Menampilkan ringkasan progres kompetensi pengguna yang sedang login.
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

    const progressSummary = await getUserCompetencyProgressSummary(user.id);

    return NextResponse.json(
      {
        status: 'success',
        data: progressSummary,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Competency progress summary error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat progres kompetensi.' },
      { status: 500 }
    );
  }
}

