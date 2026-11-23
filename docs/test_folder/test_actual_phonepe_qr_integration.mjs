/**
 * ShopKart — Actual PhonePe QR Asset & Checkout Integration Verification Suite
 *
 * Strengthened Verification Suite:
 * 1. Decodes directly from the actual binary file: public/phonepe-qr.png (zero scratch files).
 * 2. Full PNG integrity verification (magic signature, IHDR chunk, zlib IDAT inflate, Paeth unfiltering).
 * 3. Exact dimension verification (684 × 660).
 * 4. Error handling check: corrupted/invalid PNG files are rejected with clean assertion errors.
 * 5. Exact complete UPI payload verification (100% strict string equality, not just includes).
 * 6. Built-asset check: dist/phonepe-qr.png exists and is byte-for-byte identical to public/phonepe-qr.png.
 * 7. Real React component SSR tests (PhonePePaymentSection and OrderConfirmationPage).
 */

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

console.log('=================================================================')
console.log('SHOPKART — DIRECT PNG PHONEPE QR VERIFICATION & INTEGRATION SUITE')
console.log('=================================================================\n')

let passedTests = 0
let failedTests = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    Error: ${err.message}`)
    failedTests++
  }
}

/**
 * Pure PNG decoder implementing RFC 2083 standard in pure Node.js (via built-in zlib).
 * Parses chunks, decompresses IDAT scanlines, and applies PNG inverse filters (Sub, Up, Average, Paeth).
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new Error('Invalid PNG: buffer too small or not a Buffer')
  }

  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buffer.subarray(0, 8).equals(pngMagic)) {
    throw new Error('Invalid PNG: file does not match 8-byte PNG magic signature')
  }

  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks = []

  while (pos < buffer.length) {
    if (pos + 8 > buffer.length) {
      throw new Error('Invalid PNG: truncated chunk header')
    }
    const len = buffer.readUInt32BE(pos)
    const type = buffer.subarray(pos + 4, pos + 8).toString('ascii')

    if (pos + 12 + len > buffer.length) {
      throw new Error(`Invalid PNG: truncated ${type} chunk data`)
    }
    const data = buffer.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (bitDepth !== 8 || colorType !== 2) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType} (expected 24-bit TrueColor)`)
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (width === 0 || height === 0) {
    throw new Error('Invalid PNG: missing or empty IHDR chunk')
  }
  if (idatChunks.length === 0) {
    throw new Error('Invalid PNG: missing IDAT image data chunks')
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks))
  const bpp = 3 // 24-bit TrueColor RGB
  const stride = width * bpp
  const expectedInflatedSize = height * (stride + 1)

  if (inflated.length !== expectedInflatedSize) {
    throw new Error(`Corrupted PNG scanline stream: expected ${expectedInflatedSize} bytes, got ${inflated.length}`)
  }

  const image = Buffer.alloc(width * height * bpp)
  let inPos = 0
  let prevRowOffset = -1

  for (let y = 0; y < height; y++) {
    const filter = inflated[inPos++]
    const rowOffset = y * stride

    for (let x = 0; x < stride; x++) {
      const filt = inflated[inPos++]
      const a = x >= bpp ? image[rowOffset + x - bpp] : 0
      const b = prevRowOffset >= 0 ? image[prevRowOffset + x] : 0
      const c = (prevRowOffset >= 0 && x >= bpp) ? image[prevRowOffset + x - bpp] : 0

      let val = filt
      if (filter === 0) {
        val = filt
      } else if (filter === 1) {
        val = (filt + a) & 0xff
      } else if (filter === 2) {
        val = (filt + b) & 0xff
      } else if (filter === 3) {
        val = (filt + Math.floor((a + b) / 2)) & 0xff
      } else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        let pr = c
        if (pa <= pb && pa <= pc) pr = a
        else if (pb <= pc) pr = b
        val = (filt + pr) & 0xff
      } else {
        throw new Error(`Invalid PNG filter type: ${filter}`)
      }
      image[rowOffset + x] = val
    }
    prevRowOffset = rowOffset
  }

  return {
    width,
    height,
    isDark: (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false
      const idx = (y * width + x) * bpp
      const r = image[idx]
      const g = image[idx + 1]
      const b = image[idx + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      return lum < 120
    },
  }
}

/**
 * Extracts and decodes the QR code directly from an in-memory PNG buffer.
 * Samples modules dynamically from the image, unmasks using Mask 7,
 * and de-interleaves Version 8-H codewords to return the exact URI string.
 */
export function decodePhonePeQrFromPngBuffer(pngBuffer) {
  const png = decodePng(pngBuffer)

  // 1. Locate the outer black bounding box of the QR code
  let minX = png.width
  let minY = png.height
  let maxX = 0
  let maxY = 0

  for (let y = 0; y < png.height; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      if (png.isDark(x, y)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const boxW = maxX - minX
  const boxH = maxY - minY
  assert.strictEqual(boxW, 536, 'Expected QR bounding box width of 536 pixels')
  assert.strictEqual(boxH, 536, 'Expected QR bounding box height of 536 pixels')

  const size = 49 // Version 8 matrix is 49x49 modules
  const step = boxW / (size - 1)

  // 2. Sample 49x49 modules from the decoded pixel buffer
  const grid = []
  for (let r = 0; r < size; r++) {
    const row = []
    for (let c = 0; c < size; c++) {
      const x = Math.round(minX + c * step)
      const y = Math.round(minY + r * step)
      row.push(png.isDark(x, y) ? 1 : 0)
    }
    grid.push(row)
  }

  // 3. Mark non-data function modules (finders, timing, alignment, format, version)
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false))
  function markFinder(startR, startC) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startR + r
        const col = startC + c
        if (row >= 0 && row < size && col >= 0 && col < size) isFunction[row][col] = true
      }
    }
  }
  markFinder(0, 0)
  markFinder(0, size - 7)
  markFinder(size - 7, 0)

  for (let i = 0; i < size; i++) {
    isFunction[6][i] = true
    isFunction[i][6] = true
  }

  const alignCoords = [6, 24, 42]
  for (const r of alignCoords) {
    for (const c of alignCoords) {
      if ((r === 6 && c === 6) || (r === 6 && c === 42) || (r === 42 && c === 6)) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) isFunction[r + dr][c + dc] = true
      }
    }
  }

  for (let i = 0; i <= 8; i++) {
    isFunction[8][i] = true
    isFunction[i][8] = true
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true
    isFunction[size - 1 - i][8] = true
  }
  isFunction[size - 8][8] = true

  for (let r = 0; r < 6; r++) {
    for (let c = size - 11; c <= size - 9; c++) isFunction[r][c] = true
  }
  for (let r = size - 11; r <= size - 9; r++) {
    for (let c = 0; c < 6; c++) isFunction[r][c] = true
  }

  // 4. Extract data bits and apply Mask 7 unmasking
  const bits = []
  let upward = true
  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--
    const leftCol = rightCol - 1
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i)

    for (const r of rows) {
      for (const c of [rightCol, leftCol]) {
        if (!isFunction[r][c]) {
          let bit = grid[r][c]
          // Mask 7 formula: ((row * col) % 3 + (row + col) % 2) % 2 === 0
          if (((r * c) % 3 + (r + c) % 2) % 2 === 0) bit = bit ^ 1
          bits.push(bit)
        }
      }
    }
    upward = !upward
  }

  // 5. Convert unmasked bits into raw codewords
  const rawCodewords = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let val = 0
    for (let b = 0; b < 8; b++) val = (val << 1) | bits[i + b]
    rawCodewords.push(val)
  }

  // 6. De-interleave ISO/IEC 18004 Version 8-H blocks (4 blocks of 14, 2 blocks of 15)
  const dataBlocks = Array.from({ length: 6 }, () => [])
  let byteIdx = 0
  for (let round = 0; round < 14; round++) {
    for (let b = 0; b < 6; b++) dataBlocks[b].push(rawCodewords[byteIdx++])
  }
  for (let b = 4; b < 6; b++) dataBlocks[b].push(rawCodewords[byteIdx++])

  const deinterleavedData = [].concat(...dataBlocks)

  // 7. Read mode, character count, and string payload
  let bPos = 0
  function getBits(n) {
    let v = 0
    for (let i = 0; i < n; i++) {
      const byteIndex = Math.floor(bPos / 8)
      const bitIndex = 7 - (bPos % 8)
      v = (v << 1) | ((deinterleavedData[byteIndex] >> bitIndex) & 1)
      bPos++
    }
    return v
  }

  const mode = getBits(4)
  assert.strictEqual(mode, 4, 'Expected Byte mode (0100)')
  const length = getBits(8)
  let decoded = ''
  for (let i = 0; i < length; i++) {
    decoded += String.fromCharCode(getBits(8))
  }

  return decoded
}

async function main() {
  const qrFilePath = path.resolve('public/phonepe-qr.png')
  const distFilePath = path.resolve('dist/phonepe-qr.png')
  const EXPECTED_EXACT_URI = 'upi://pay?pa=7676535672-2@ibl&pn=SHIVALINGAPPAGOUDA&mc=0000&mode=02&purpose=00'

  // =========================================================================
  // 1. PHYSICAL FILE & PNG INTEGRITY TESTS
  // =========================================================================
  test('public/phonepe-qr.png exists on disk', () => {
    assert.ok(fs.existsSync(qrFilePath), 'public/phonepe-qr.png must exist on disk')
  })

  test('public/phonepe-qr.png starts with standard 8-byte PNG magic header', () => {
    const buffer = fs.readFileSync(qrFilePath)
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.ok(buffer.subarray(0, 8).equals(pngMagic), 'File must start with standard PNG signature')
  })

  test('public/phonepe-qr.png decodes successfully and has exact dimensions 684 x 660', () => {
    const buffer = fs.readFileSync(qrFilePath)
    const decodedPng = decodePng(buffer)
    assert.strictEqual(decodedPng.width, 684, 'PNG width must be exactly 684 pixels')
    assert.strictEqual(decodedPng.height, 660, 'PNG height must be exactly 660 pixels')
  })

  test('PNG decoder rejects corrupted, truncated, or invalid file buffers', () => {
    // Empty buffer
    assert.throws(() => decodePng(Buffer.alloc(0)), /too small/i)
    // Non-PNG header
    assert.throws(() => decodePng(Buffer.from('NOT_A_PNG_HEADER_HERE')), /magic signature/i)
    // Truncated PNG
    const validBuf = fs.readFileSync(qrFilePath)
    const truncated = validBuf.subarray(0, 30)
    assert.throws(() => decodePng(truncated), /truncated/i)
  })

  // =========================================================================
  // 2. DIRECT BIT-LEVEL QR DECODING & COMPLETE URI MATCH
  // =========================================================================
  test('QR code is decoded directly from public/phonepe-qr.png with zero scratch files', () => {
    const buffer = fs.readFileSync(qrFilePath)
    const decodedPayload = decodePhonePeQrFromPngBuffer(buffer)
    // Strict 100% exact full-string equality
    assert.strictEqual(
      decodedPayload,
      EXPECTED_EXACT_URI,
      `Decoded payload must exactly equal expected URI.\nExpected: ${EXPECTED_EXACT_URI}\nActual:   ${decodedPayload}`
    )
  })

  test('Decoded URI contains exact verified payee address and name without extra credentials', () => {
    const buffer = fs.readFileSync(qrFilePath)
    const decodedPayload = decodePhonePeQrFromPngBuffer(buffer)
    const url = new URL(decodedPayload)

    assert.strictEqual(url.protocol, 'upi:')
    assert.strictEqual(url.host, 'pay')
    assert.strictEqual(url.searchParams.get('pa'), '7676535672-2@ibl')
    assert.strictEqual(url.searchParams.get('pn'), 'SHIVALINGAPPAGOUDA')
    assert.strictEqual(url.searchParams.get('mc'), '0000')
    assert.strictEqual(url.searchParams.get('mode'), '02')
    assert.strictEqual(url.searchParams.get('purpose'), '00')
  })

  // =========================================================================
  // 3. BUILT ASSET VERIFICATION (DIST/PHONEPE-QR.PNG)
  // =========================================================================
  test('dist/phonepe-qr.png exists after production build', () => {
    assert.ok(fs.existsSync(distFilePath), 'dist/phonepe-qr.png must exist in production output')
  })

  test('dist/phonepe-qr.png is byte-for-byte identical to public/phonepe-qr.png', () => {
    const publicBuf = fs.readFileSync(qrFilePath)
    const distBuf = fs.readFileSync(distFilePath)
    assert.strictEqual(distBuf.length, publicBuf.length, 'File size in dist must match public')
    assert.ok(distBuf.equals(publicBuf), 'dist/phonepe-qr.png must be byte-for-byte identical to source public asset')
  })

  // =========================================================================
  // 4. REACT SSR & CHECKOUT INTEGRATION VERIFICATION
  // =========================================================================
  const viteServer = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  })

  const { default: PhonePePaymentSection, DEFAULT_PUBLIC_QR_PATH } =
    await viteServer.ssrLoadModule('/src/components/checkout/PhonePePaymentSection.jsx')

  const { default: OrderConfirmationPage } =
    await viteServer.ssrLoadModule('/src/pages/customer/OrderConfirmationPage.jsx')

  test('DEFAULT_PUBLIC_QR_PATH defaults strictly to "/phonepe-qr.png"', () => {
    assert.strictEqual(DEFAULT_PUBLIC_QR_PATH, '/phonepe-qr.png')
  })

  test('PhonePePaymentSection SSR renders <img> pointing to /phonepe-qr.png by default', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        orderId: '33333333-3333-4333-8333-333333333333',
        orderCreatedAt: new Date().toISOString(),
        orderTotal: 1499,
      })
    )

    assert.ok(html.includes('src="/phonepe-qr.png"'), 'Must render image with src="/phonepe-qr.png"')
    assert.ok(html.includes('alt="PhonePe QR Code"'), 'Must render descriptive alt text')
    assert.ok(!html.includes('Merchant QR Not Configured'), 'Must NOT display missing QR placeholder')
    assert.ok(html.includes('Scan with PhonePe, GPay, Paytm, or BHIM UPI'), 'Must display scan instruction copy')
  })

  test('PhonePePaymentSection SSR renders administrative placeholder when QR is explicitly null', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhonePePaymentSection, {
        orderId: '33333333-3333-4333-8333-333333333333',
        orderCreatedAt: new Date().toISOString(),
        orderTotal: 1499,
        qrImageUrl: null,
      })
    )

    assert.ok(html.includes('Merchant QR Not Configured'), 'Must display missing QR placeholder when null')
    assert.ok(!html.includes('src="/phonepe-qr.png"'), 'Must NOT render broken image tag when null')
  })

  test('OrderConfirmationPage SSR renders the PhonePe QR section with /phonepe-qr.png', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(OrderConfirmationPage, {
          initialOrder: {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'pending',
            payment_provider: 'phonepe',
            created_at: new Date().toISOString(),
            order_items: [
              {
                id: 'item-1',
                product_id: 'prod-1',
                product_name: 'Wireless Headphones',
                quantity: 1,
                unit_price: 1499,
                total_price: 1499,
              },
            ],
          },
        })
      )
    )

    assert.ok(html.includes('src="/phonepe-qr.png"'), 'Order confirmation must render actual /phonepe-qr.png')
    assert.ok(html.includes('Enter 12-Digit UTR'), 'Order confirmation must render UTR submission input')
    assert.ok(!html.includes('Merchant QR Not Configured'), 'Order confirmation must NOT show missing-QR placeholder')
  })

  await viteServer.close()

  console.log('\n=================================================================')
  console.log(`STRENGTHENED QR INTEGRATION RESULTS: ${passedTests} passed, ${failedTests} failed, ${passedTests + failedTests} total`)
  console.log('=================================================================')

  if (failedTests > 0) {
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('Fatal test error:', err)
    process.exit(1)
  })
}
