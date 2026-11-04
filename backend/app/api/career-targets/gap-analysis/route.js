import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { calculateAllCareerTargetsGap } from '@/lib/gap-analysis';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { status: 'error', message: 'Akses tidak sah. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const results = await calculateAllCareerTargetsGap(user.id);

    return NextResponse.json(
      {
        status: 'success',
        data: results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('All career targets gap analysis error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat menghitung analisis kesenjangan seluruh target karier.' },
      { status: 500 }
    );
  }
}

