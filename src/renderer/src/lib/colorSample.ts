// Echantillonnage de couleurs depuis le canvas pdf.js, pour que l'outil "Modifier"
// reprenne la VRAIE couleur de fond et de texte de l'original (au lieu de blanc/noir
// forces). Tout est local (Electron + fichier disque) → getImageData n'est pas
// bloque par tainted-canvas/CORS.

interface RGB {
  r: number
  g: number
  b: number
}

function toHex(c: RGB): string {
  return (
    '#' +
    [c.r, c.g, c.b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

function dist2(a: RGB, b: RGB): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

/**
 * Echantillonne, autour de la zone `rect` (coords normalisees [0,1], origine top-left,
 * = hit.x/hit.y/hit.width/hit.height d'un TextHit), la couleur de FOND et la couleur
 * du TEXTE d'origine telles que rendues par pdf.js.
 *
 * - Le FOND est mesure sur une COURONNE EXTERIEURE au bbox (zone garantie hors-glyphe),
 *   ce qui evite l'inversion fond/texte sur du petit texte dense (bbox serre).
 * - Le TEXTE est mesure a l'INTERIEUR du bbox (pixels les plus eloignes du fond).
 *
 * `canvas.width/height` incluent deja le facteur dpr (haute densite) + l'arrondi
 * floor ; on multiplie donc rect.* par canvas.width/height pour passer en pixels
 * PHYSIQUES sans relire devicePixelRatio.
 */
export function sampleTextColors(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number }
): { background: string; text: string } {
  const FALLBACK = { background: '#FFFFFF', text: '#000000' }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return FALLBACK

  const cw = canvas.width
  const ch = canvas.height
  // bbox serre du texte, en pixels physiques
  let tx = Math.round(rect.x * cw)
  let ty = Math.round(rect.y * ch)
  let tw = Math.round(rect.w * cw)
  let th = Math.round(rect.h * ch)
  tx = Math.max(0, Math.min(cw - 1, tx))
  ty = Math.max(0, Math.min(ch - 1, ty))
  tw = Math.max(1, Math.min(cw - tx, tw))
  th = Math.max(1, Math.min(ch - ty, th))

  // Region ELARGIE d'une marge (≈ 60% de la hauteur) pour capter le vrai fond autour
  const margin = Math.max(2, Math.round(th * 0.6))
  const ex = Math.max(0, tx - margin)
  const ey = Math.max(0, ty - margin)
  const ew = Math.min(cw - ex, tw + 2 * margin)
  const eh = Math.min(ch - ey, th + 2 * margin)

  let img: ImageData
  try {
    img = ctx.getImageData(ex, ey, ew, eh)
  } catch {
    return FALLBACK
  }
  const data = img.data
  // Offsets du bbox serre DANS la region elargie
  const ix = tx - ex
  const iy = ty - ey

  const at = (x: number, y: number): RGB => {
    const i = (y * ew + x) * 4
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const alphaAt = (x: number, y: number): number => data[(y * ew + x) * 4 + 3]

  // Defense anti "pave noir" : si le canvas a ete lu pendant un re-render (bitmap
  // transparent), la majorite des pixels ont alpha 0 → on renonce a l'echantillon.
  let opaque = 0
  let total = 0
  for (let y = 0; y < eh; y += 2) {
    for (let x = 0; x < ew; x += 2) {
      total++
      if (alphaAt(x, y) > 10) opaque++
    }
  }
  if (total === 0 || opaque / total < 0.5) return FALLBACK

  if (ew < 3 || eh < 3) {
    const c = at(Math.floor(ew / 2), Math.floor(eh / 2))
    return { background: toHex(c), text: c.r + c.g + c.b > 382 ? '#000000' : '#FFFFFF' }
  }

  // 1) FOND = mode (couleur la plus frequente) sur la COURONNE exterieure au bbox
  //    (tout ce qui est dans la region elargie mais hors du bbox serre).
  const q = (v: number): number => (v >> 4) << 4
  const counts = new Map<string, { rgb: RGB; n: number }>()
  const tally = (c: RGB): void => {
    const k = `${q(c.r)},${q(c.g)},${q(c.b)}`
    const e = counts.get(k)
    if (e) {
      e.n++
      e.rgb.r += c.r
      e.rgb.g += c.g
      e.rgb.b += c.b
    } else {
      counts.set(k, { rgb: { ...c }, n: 1 })
    }
  }
  const inInner = (x: number, y: number): boolean =>
    x >= ix && x < ix + tw && y >= iy && y < iy + th
  for (let y = 0; y < eh; y++) {
    for (let x = 0; x < ew; x++) {
      if (!inInner(x, y)) tally(at(x, y))
    }
  }
  // Repli : si pas de couronne (region == bbox), echantillonne tout
  if (counts.size === 0) {
    for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) tally(at(x, y))
  }
  let best: { rgb: RGB; n: number } | null = null
  for (const e of counts.values()) if (!best || e.n > best.n) best = e
  const bg: RGB = {
    r: best!.rgb.r / best!.n,
    g: best!.rgb.g / best!.n,
    b: best!.rgb.b / best!.n
  }

  // 2) TEXTE = moyenne des pixels du bbox INTERIEUR les plus eloignes du fond.
  const innerDists: number[] = []
  for (let y = iy; y < iy + th; y++) {
    for (let x = ix; x < ix + tw; x++) innerDists.push(dist2(at(x, y), bg))
  }
  innerDists.sort((a, b) => a - b)
  const thr = Math.max(innerDists[Math.floor(innerDists.length * 0.85)] || 0, 18 * 18)
  let tr = 0
  let tg = 0
  let tb = 0
  let tn = 0
  for (let y = iy; y < iy + th; y++) {
    for (let x = ix; x < ix + tw; x++) {
      const c = at(x, y)
      if (dist2(c, bg) >= thr) {
        tr += c.r
        tg += c.g
        tb += c.b
        tn++
      }
    }
  }
  const text: RGB =
    tn > 0
      ? { r: tr / tn, g: tg / tn, b: tb / tn }
      : // clair-sur-clair : on garde un contraste lisible base sur la luminance du fond
        bg.r + bg.g + bg.b > 382
        ? { r: 26, g: 26, b: 26 }
        : { r: 245, g: 245, b: 245 }

  return { background: toHex(bg), text: toHex(text) }
}
