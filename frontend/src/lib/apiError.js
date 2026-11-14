const STATUS_FALLBACKS = {
  401: 'Sesi berakhir, silakan login kembali.',
  403: 'Permintaan ditolak oleh kebijakan keamanan (CORS/CSRF).',
  404: 'Data tidak ditemukan.',
  409: 'Terjadi konflik data.',
  422: 'Data belum memenuhi syarat.',
  429: 'Kuota layanan AI tercapai. Coba lagi beberapa saat.',
  502: 'Respons AI tidak valid. Coba lagi.',
  503: 'Layanan sedang tidak tersedia.',
  504: 'Layanan AI melebihi batas waktu. Coba lagi.',
}

function fallbackMessage(status) {
  return STATUS_FALLBACKS[status] || 'Terjadi kesalahan pada server.'
}

/**
 * Normalize Axios (or similar) errors into a plain Error with status/message/errors.
 * Pure ESM — no browser or Vue dependencies.
 */
export function normalizeApiError(err) {
  const out = new Error('Terjadi kesalahan pada server.')
  out.status = 0
  out.errors = []

  if (!err?.response) {
    out.status = 0
    if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
      out.message = 'Server tidak merespons dalam batas waktu. Coba lagi.'
    } else {
      out.message =
        'Tidak dapat terhubung ke server. Pastikan backend berjalan di localhost:3000.'
    }
    return out
  }

  const status = err.response.status
  out.status = status
  const body = err.response.data

  if (body && typeof body === 'object') {
    out.message = body.message || body.error || fallbackMessage(status)
    out.errors = Array.isArray(body.errors) ? body.errors : []
  } else {
    out.message = fallbackMessage(status)
  }

  return out
}
