import qrcode from 'qrcode-generator'

/**
 * QR-Code als SVG-Pfad. Bewusst als String statt als Canvas: Ein SVG skaliert
 * verlustfrei, lässt sich per CSS einfärben und funktioniert auch dann, wenn die
 * Seite als einzelne HTML-Datei von `file://` läuft.
 */
export function qrSvg(text: string, options: { margin?: number } = {}): string {
  const margin = options.margin ?? 2

  // Typzahl 0 = automatisch die kleinste passende Version wählen.
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()

  const count = qr.getModuleCount()
  const size = count + margin * 2

  let path = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue
      path += `M${col + margin} ${row + margin}h1v1h-1z`
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` shape-rendering="crispEdges" role="img" aria-label="QR-Code zum Verbinden">`,
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
    `<path d="${path}" fill="#000"/>`,
    `</svg>`,
  ].join('')
}
