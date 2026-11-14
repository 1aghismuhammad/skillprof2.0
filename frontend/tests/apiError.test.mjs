import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeApiError } from '../src/lib/apiError.js'

describe('normalizeApiError', () => {
  it('maps network failure (no response) to status 0', () => {
    const err = normalizeApiError({ message: 'Network Error' })
    assert.equal(err.status, 0)
    assert.match(err.message, /Tidak dapat terhubung ke server/)
    assert.deepEqual(err.errors, [])
  })

  it('maps ECONNABORTED to timeout message', () => {
    const err = normalizeApiError({ code: 'ECONNABORTED' })
    assert.equal(err.status, 0)
    assert.match(err.message, /batas waktu/)
  })

  it('maps ETIMEDOUT to timeout message', () => {
    const err = normalizeApiError({ code: 'ETIMEDOUT' })
    assert.equal(err.status, 0)
    assert.match(err.message, /batas waktu/)
  })

  it('preserves errors[] from 400 body', () => {
    const err = normalizeApiError({
      response: {
        status: 400,
        data: {
          status: 'error',
          message: 'Validasi gagal.',
          errors: ['Nama terlalu pendek', 'Password wajib'],
        },
      },
    })
    assert.equal(err.status, 400)
    assert.equal(err.message, 'Validasi gagal.')
    assert.deepEqual(err.errors, ['Nama terlalu pendek', 'Password wajib'])
  })

  it('reads middleware-style body.error for 403', () => {
    const err = normalizeApiError({
      response: {
        status: 403,
        data: { error: 'Origin tidak diizinkan.' },
      },
    })
    assert.equal(err.status, 403)
    assert.equal(err.message, 'Origin tidak diizinkan.')
  })

  it('uses status fallback when 429 has no message', () => {
    const err = normalizeApiError({
      response: { status: 429, data: {} },
    })
    assert.equal(err.status, 429)
    assert.match(err.message, /Kuota layanan AI/)
  })

  it('uses status fallback when body is HTML string', () => {
    const err = normalizeApiError({
      response: {
        status: 502,
        data: '<html><body>Bad Gateway</body></html>',
      },
    })
    assert.equal(err.status, 502)
    assert.match(err.message, /Respons AI tidak valid/)
  })

  it('prefers body.message over body.error', () => {
    const err = normalizeApiError({
      response: {
        status: 401,
        data: { message: 'Email atau kata sandi tidak valid.', error: 'ignored' },
      },
    })
    assert.equal(err.message, 'Email atau kata sandi tidak valid.')
  })
})
