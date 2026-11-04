import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';
import { calculateCareerTargetGap } from '@/lib/gap-analysis';

export const dynamic = 'force-dynamic';

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

    const result = await calculateCareerTargetGap(targetId, user.id);

    if (!result) {
      return NextResponse.json(
        { status: 'error', message: 'Target karier tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Career target gap analysis error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menghitung analisis kesenjangan kompetensi.' },
      { status: 500 }
    );
  }
}

