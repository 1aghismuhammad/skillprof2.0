import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';
import { getCareerTargetCompetencyProgress } from '@/lib/progress';

export const dynamic = 'force-dynamic';

/**
 * GET /api/competency-progress/career-targets/[id]
 * Menampilkan evaluasi progres kompetensi pengguna terhadap kebutuhan target karier tertentu.
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
    const targetId = parsePositiveInt(resolvedParams?.id);

    if (!targetId) {
      return NextResponse.json(
        { status: 'error', message: 'ID target karier tidak valid.' },
        { status: 400 }
      );
    }

    const progress = await getCareerTargetCompetencyProgress(targetId, user.id);

    if (!progress) {
      return NextResponse.json(
        { status: 'error', message: 'Target karier tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: progress,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Career target competency progress error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat progres kompetensi target karier.' },
      { status: 500 }
    );
  }
}

