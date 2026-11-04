import { NextResponse } from 'next/server';
import { getPublicPortfolioBySlug } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/portfolios/[slug]
 * Mengambil data portofolio publik berdasarkan slug.
 *
 * PERSYARATAN INTEGRITAS & PRIVASI:
 * 1. Tidak membutuhkan token autentikasi (publik).
 * 2. Hanya portofolio dengan is_published = 1 yang ditampilkan.
 * 3. Portofolio privat (is_published = 0) dan slug yang tidak terdaftar
 *    SAMA-SAMA mengembalikan HTTP 404 (pesan generic) untuk mencegah enumeration/probing.
 * 4. DTO publik secara ketat menyaring data: TIDAK PERNAH mengirimkan user_id,
 *    email akun (users.email), password_hash, atau informasi audit privat.
 * 5. Hanya menampilkan proyek yang masih terkait dengan pemilik portofolio.
 * 6. Hanya menampilkan skill yang masih berstatus 'active' pada user_skills.
 */
export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const rawSlug = resolvedParams?.slug;

    if (!rawSlug || typeof rawSlug !== 'string') {
      return NextResponse.json(
        { status: 'error', message: 'Portofolio publik tidak ditemukan.' },
        { status: 404 }
      );
    }

    const portfolio = await getPublicPortfolioBySlug(rawSlug);

    if (!portfolio) {
      return NextResponse.json(
        { status: 'error', message: 'Portofolio publik tidak ditemukan.' },
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
    console.error('Error fetching public portfolio:', error.message);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan pada server saat memuat portofolio publik.' },
      { status: 500 }
    );
  }
}

