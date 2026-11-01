import { NextResponse } from 'next/server';

function getAllowedOrigins() {
  const configured = process.env.FRONTEND_URL || 'http://localhost:5173';
  const origins = new Set([configured.replace(/\/$/, '')]);

  // Tambahkan alternatif localhost/127.0.0.1 saat mode development
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }

  return origins;
}

function getRequestOrigin(request) {
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    return originHeader.replace(/\/$/, '');
  }

  const refererHeader = request.headers.get('referer');
  if (refererHeader) {
    try {
      const url = new URL(refererHeader);
      return url.origin.replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  return null;
}

export function middleware(request) {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = getRequestOrigin(request);
  const rawOrigin = request.headers.get('origin');
  const isStateChangingMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);

  // 1. Penanganan Preflight Request (OPTIONS)
  if (request.method === 'OPTIONS') {
    if (rawOrigin && !allowedOrigins.has(requestOrigin)) {
      return new NextResponse(
        JSON.stringify({ error: 'Origin tidak diizinkan oleh kebijakan CORS.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const preflightOrigin = allowedOrigins.has(requestOrigin)
      ? rawOrigin
      : process.env.FRONTEND_URL || 'http://localhost:5173';

    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': preflightOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 2. Perlindungan CSRF pada Request yang Mengubah Data (POST, PUT, DELETE, PATCH)
  // Peramban web secara otomatis menyertakan header Origin atau Referer pada request lintas origin.
  if (isStateChangingMethod && rawOrigin) {
    if (!allowedOrigins.has(requestOrigin)) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Permintaan ditolak: Origin tidak diizinkan (Proteksi CSRF).',
        },
        { status: 403 }
      );
    }
  }

  // Cek Sec-Fetch-Site jika berasal dari browser
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (isStateChangingMethod && secFetchSite === 'cross-site' && !allowedOrigins.has(requestOrigin)) {
    return NextResponse.json(
      {
        status: 'error',
        error: 'Permintaan ditolak: Cross-site request tidak diizinkan (Proteksi CSRF).',
      },
      { status: 403 }
    );
  }

  // 3. Lanjutkan Request dan Sematkan Header CORS
  const response = NextResponse.next();

  if (allowedOrigins.has(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', rawOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
