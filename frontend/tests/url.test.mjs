import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isHttpUrl } from '../src/lib/url.js'

describe('isHttpUrl', () => {
  it('accepts http and https absolute URLs', () => {
    assert.equal(isHttpUrl('https://example.com'), true)
    assert.equal(isHttpUrl('http://localhost:3000/path'), true)
    assert.equal(isHttpUrl('https://github.com/org/repo'), true)
    assert.equal(isHttpUrl('  https://example.com/a?b=1  '), true)
  })

  it('rejects non-http protocols and relative paths', () => {
    assert.equal(isHttpUrl('javascript:alert(1)'), false)
    assert.equal(isHttpUrl('data:text/html,hi'), false)
    assert.equal(isHttpUrl('ftp://files.example.com'), false)
    assert.equal(isHttpUrl('/relative/path'), false)
    assert.equal(isHttpUrl('//evil.com'), false)
    assert.equal(isHttpUrl('example.com'), false)
  })

  it('rejects empty and non-string values', () => {
    assert.equal(isHttpUrl(''), false)
    assert.equal(isHttpUrl('   '), false)
    assert.equal(isHttpUrl(null), false)
    assert.equal(isHttpUrl(undefined), false)
    assert.equal(isHttpUrl(42), false)
    assert.equal(isHttpUrl({ href: 'https://x.com' }), false)
  })
})
