import sharp from 'sharp'
import { writeFileSync } from 'fs'

const sizes = [256, 48, 32, 16]
const buffers = await Promise.all(
  sizes.map(s => sharp('build-resources/icon.png').resize(s, s).png().toBuffer())
)

const n = buffers.length
const headerSize = 6 + n * 16
let offset = headerSize
const entries = buffers.map((buf, i) => {
  const e = Buffer.alloc(16)
  const s = sizes[i]
  e.writeUInt8(s === 256 ? 0 : s, 0)
  e.writeUInt8(s === 256 ? 0 : s, 1)
  e.writeUInt8(0, 2)
  e.writeUInt8(0, 3)
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(buf.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += buf.length
  return e
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(n, 4)

const ico = Buffer.concat([header, ...entries, ...buffers])
writeFileSync('build-resources/icon.ico', ico)
console.log('icon.ico written:', ico.length, 'bytes')
