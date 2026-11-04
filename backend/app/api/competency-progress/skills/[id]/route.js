import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';
import { getSkillProgressDetail } from '@/lib/progress';

export const dynamic = 'force-dynamic';

/**
 * GET /api/competency-progress/skills/[id]
 * Menampilkan detail perkembangan dan linimasa assessment untuk satu skill spesifik milik pengguna.
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
    const skillId = parsePositiveInt(resolvedParams?.id);

    if (!skillId) {
      return NextResponse.json(
        { status: 'error', message: 'ID skill tidak valid.' },
        { status: 400 }
      );
    }

    const skillDetail = await getSkillProgressDetail(skillId, user.id);

    if (!skillDetail) {
      return NextResponse.json(
        { status: 'error', message: 'Skill tidak ditemukan pada profil Anda.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: skillDetail,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Skill competency progress error:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat riwayat progres skill.' },
      { status: 500 }
    );
  }
}

