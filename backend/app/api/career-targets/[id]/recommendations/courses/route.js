import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/validation';
import { generateCareerTargetRecommendations } from '@/lib/ai/recommender';

export const dynamic = 'force-dynamic';

/**
 * GET /api/career-targets/[id]/recommendations/courses
 * Menghasilkan rekomendasi materi pembelajaran (kursus terstruktur) untuk menutup skill gap.
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

    const recommendations = await generateCareerTargetRecommendations(targetId, user.id, {
      type: 'courses',
    });

    if (!recommendations) {
      return NextResponse.json(
        { status: 'error', message: 'Target karier tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        data: recommendations,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Course recommendations error:', error.message);

    if (error.status === 400 || error.code === 'NO_REQUIREMENTS') {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes('AI_API_KEY')) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Layanan rekomendasi AI belum dikonfigurasi (AI_API_KEY tidak tersedia).',
        },
        { status: 503 }
      );
    }

    if (error.status === 429) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Layanan AI sedang mencapai batas frekuensi permintaan (rate limit). Silakan coba lagi beberapa saat lagi.',
        },
        { status: 429 }
      );
    }

    if (error.status === 504 || error.message?.includes('batas waktu')) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Permintaan rekomendasi ke layanan AI melampaui batas waktu (timeout).',
        },
        { status: 504 }
      );
    }

    if (error.status === 502) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Respons dari provider AI tidak memenuhi format atau kriteria validasi.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        message: 'Terjadi kesalahan pada server saat menghasilkan rekomendasi kursus.',
      },
      { status: 500 }
    );
  }
}

