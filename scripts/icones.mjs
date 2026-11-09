// Gera os ícones PNG do app (sem dependências): node scripts/icones.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcTab = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(tipo, dados) {
  const t = Buffer.from(tipo), l = Buffer.alloc(4), c = Buffer.alloc(4);
  l.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([l, t, dados, c]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const A = [124, 92, 255], B = [34, 211, 238], BG = [11, 11, 18];
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const distSeg = (x, y, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
};

// cor do ponto (x,y em 0..1). escala = tamanho do desenho (maskable usa menor, dentro da zona segura)
function pixel(x, y, escala, arredondado) {
  if (arredondado) { // cantos arredondados (ícone "any")
    const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
    if (Math.hypot(x - cx, y - cy) > r) return [0, 0, 0, 0];
  }
  let c = mix(BG, A, 0.0);
  const g = mix(A, B, (x + y) / 2);
  c = mix([20, 18, 48], BG, y); // fundo escuro com leve degradê
  // relógio: anel + ponteiros, em degradê roxo→ciano
  const u = (x - 0.5) / escala, v = (y - 0.5) / escala;       // coords centradas
  const r = Math.hypot(u, v);
  const ring = Math.abs(r - 0.30) < 0.035;
  const h1 = distSeg(u, v, 0, 0, -0.10, -0.15) < 0.03;          // ponteiro das horas (~10h)
  const h2 = distSeg(u, v, 0, 0, 0.0, -0.22) < 0.022;           // ponteiro dos minutos
  const pt = r < 0.04;
  const cor = mix(A, B, Math.min(1, Math.max(0, (u + v + 0.7) / 1.4)));
  if (ring || h1 || h2 || pt) return [...cor, 255];
  if (r < 0.30) return [...mix(c, g, 0.10), 255];
  return [...c, 255];
}

function gerar(tam, escala, arredondado) {
  const S = 3, buf = Buffer.alloc(tam * tam * 4);
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const p = pixel((x + (i + .5) / S) / tam, (y + (j + .5) / S) / tam, escala, arredondado);
      r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
    }
    const o = (y * tam + x) * 4, n = S * S;
    buf[o] = a ? r / a : 0; buf[o + 1] = a ? g / a : 0; buf[o + 2] = a ? b / a : 0; buf[o + 3] = a / n;
  }
  return png(tam, tam, buf);
}

const RAIZ = new URL('..', import.meta.url).pathname;
fs.mkdirSync(RAIZ + 'docs/icons', { recursive: true });
fs.writeFileSync(RAIZ + 'docs/icons/icon-192.png', gerar(192, 1.15, true));
fs.writeFileSync(RAIZ + 'docs/icons/icon-512.png', gerar(512, 1.15, true));
fs.writeFileSync(RAIZ + 'docs/icons/icon-maskable-512.png', gerar(512, 0.80, false)); // sem cantos; conteúdo na zona segura
fs.writeFileSync(RAIZ + 'docs/icons/apple-touch-icon.png', gerar(180, 0.95, false));   // iOS arredonda sozinho
console.log('ícones gerados');
