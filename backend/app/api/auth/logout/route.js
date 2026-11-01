import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json(
    {
      status: 'success',
      message: 'Logout berhasil.',
    },
    { status: 200 }
  );

  clearAuthCookie(response);
  return response;
}
