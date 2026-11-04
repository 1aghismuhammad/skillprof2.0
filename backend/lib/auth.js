import { SignJWT, jwtVerify } from 'jose';

export const JWT_ALGORITHM = 'HS256';
export const TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 hari
export const AUTH_COOKIE_NAME = 'auth_token';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Membuat JWT bertanda tangan dengan algoritma HS256
 */
export async function signToken(user) {
  const secret = getJwtSecret();
  return await new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

/**
 * Memverifikasi integritas, algoritma (HS256), masa berlaku, dan klaim token
 */
export async function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    });

    if (!payload.userId || !payload.email || !payload.name) {
      return null;
    }

    return {
      id: Number(payload.userId),
      email: payload.email,
      name: payload.name,
    };
  } catch (error) {
    // Tanda tangan tidak cocok, token rusak, atau token telah kedaluwarsa
    return null;
  }
}

/**
 * Mengambil konfigurasi opsi cookie autentikasi
 */
export function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    name: AUTH_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    // Di development gunakan 'lax' agar cookie dapat terkirim antar port di localhost.
    // Di production cross-site gunakan 'none' dengan 'secure'.
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE_SECONDS,
  };
}

/**
 * Menyematkan cookie autentikasi HttpOnly ke respons Next.js
 */
export function setAuthCookie(response, token) {
  const options = getAuthCookieOptions();
  response.cookies.set({
    name: options.name,
    value: token,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });
  return response;
}

/**
 * Menghapus cookie autentikasi pada saat logout
 */
export function clearAuthCookie(response) {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

/**
 * Helper terpusat untuk mengambil dan memverifikasi identitas pengguna yang terautentikasi.
 * Mengutamakan cookie HttpOnly secara konsisten untuk aplikasi peramban.
 */
export async function getAuthenticatedUser(request) {
  let token = null;

  // Baca token dari cookies request
  if (request.cookies && typeof request.cookies.get === 'function') {
    token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  } else if (typeof request.headers?.get === 'function') {
    // Fallback parsing manual dari header Cookie
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]*)`));
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) {
    // Fallback parsing dari header Authorization: Bearer <token>
    if (typeof request.headers?.get === 'function') {
      const authHeader = request.headers.get('authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }
  }

  if (!token) {
    return null;
  }

  return await verifyToken(token);
}
