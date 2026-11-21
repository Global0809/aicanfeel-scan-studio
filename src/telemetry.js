import measured from './flow-residuals.json'
const FRAME_COUNT = measured.sourceFramesTotal
const BIN_COUNT = measured.bins.length
const HISTOGRAM_LIMIT = 3
const TAU = Math.PI * 2
const validTrace = new Array(FRAME_COUNT).fill(null)
const frameBins = new Array(FRAME_COUNT).fill(null)
for (let i = 0; i < measured.sourceFrames.length; i++) {
  const destination = measured.sourceFrames[i] + 1
  validTrace[destination] = measured.trace[i]
  frameBins[destination] = measured.localBins[i]
}
// A trailing average of measured frame RMS values. A lost track resets the window.
const averageTrace = validTrace.map((value, i) => {
  if (value === null) return null
  let sum = 0, count = 0
  for (let j = i; j >= 0 && j > i - 12 && validTrace[j] !== null; j--) {
    sum += validTrace[j]
    count++
  }
  return sum / count
})
const recordedPass = { ...measured, trace: validTrace, averageTrace, localBins: frameBins }

function histogramWindow(pass, frame) {
  if (!pass.localBins[frame]) return null
  const start = Math.max(0, Math.min(FRAME_COUNT - 19, frame - 9))
  const bins = new Uint32Array(BIN_COUNT)
  for (let pair = start; pair < start + 19; pair++) {
    const observed = pass.localBins[pair]
    if (observed) for (let i = 0; i < BIN_COUNT; i++) bins[i] += observed[i]
  }
  return bins
}
const maxWindowCount = Math.max(...measured.sourceFrames.map(start => Math.max(...histogramWindow(recordedPass, start + 1))))
const countStep = Math.max(1, Math.ceil(maxWindowCount / 400) * 100)
const histogramCeiling = Math.ceil(maxWindowCount / countStep) * countStep

const colors = {
  background: '#141c1f', plot: '#10171a', text: '#b6c6c5', fineGrid: '#1c282d',
  grid: '#314045', axis: '#506165', trace: '#d0e4d9', mean: '#e4ac6f', dot: '#edf4e8',
  selection: '#a8d5e9', label: '#426979', inlier: '#84bdae', marginal: '#91a9cf', outlier: '#dda16f',
}

function makeLayer(canvas) {
  const context = canvas.getContext('2d', { alpha: false })
  const cache = canvas.ownerDocument.createElement('canvas')
  const base = cache.getContext('2d', { alpha: false })
  return { canvas, context, cache, base, width: 0, height: 0, sx: 1, sy: 1, prior: null }
}

function sizeLayer(layer, pixelRatio) {
  if (!layer.context || !layer.base) return false
  const { width, height } = layer.canvas.getBoundingClientRect()
  const pxWidth = Math.max(1, Math.round(width * pixelRatio))
  const pxHeight = Math.max(1, Math.round(height * pixelRatio))
  if (width === layer.width && height === layer.height && pxWidth === layer.canvas.width && pxHeight === layer.canvas.height) return false
  layer.width = width
  layer.height = height
  layer.canvas.width = layer.cache.width = pxWidth
  layer.canvas.height = layer.cache.height = pxHeight
  layer.sx = pxWidth / (width || 1)
  layer.sy = pxHeight / (height || 1)
  for (const ctx of [layer.context, layer.base]) ctx.setTransform(layer.sx, 0, 0, layer.sy, 0, 0)
  layer.prior = null
  return true
}

function restore(layer, from = 0, to = layer.width) {
  // Restore only the strip covered by the previous moving marker from the static raster.
  const left = Math.max(0, Math.floor(from * layer.sx))
  const right = Math.min(layer.cache.width, Math.ceil(to * layer.sx))
  if (right <= left) return
  const ctx = layer.context
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(layer.cache, left, 0, right - left, layer.cache.height, left, 0, right - left, layer.cache.height)
  ctx.setTransform(layer.sx, 0, 0, layer.sy, 0, 0)
}

function metrics(layer, narrow) {
  const { width, height } = layer
  const unit = Math.max(0.34, Math.min(height / 100, width / (narrow ? 300 : 960), 5))
  const font = Math.max(unit * 12.3, Math.min(9.2, height / 6.5))
  const left = Math.min(Math.max((narrow ? 28 : 37) * unit, font * (narrow ? 2.8 : 3.9)), width * 0.17)
  const right = width - (narrow ? 13 : 12) * unit
  const top = Math.max((narrow ? 7 : 16) * unit, font * (narrow ? .74 : 1.38))
  const bottom = height - Math.max(16 * unit, font + 3 * unit)
  return { unit, font, left, right, top, bottom, w: right - left, h: bottom - top }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
}

function textStyle(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px 'Share Tech Mono', Consolas, monospace`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colors.text
}

function background(layer, chart) {
  const ctx = layer.base
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, layer.width, layer.height)
  ctx.fillStyle = colors.plot
  ctx.fillRect(chart.left, chart.top, chart.w, chart.h)
}

function yAxis(ctx, chart, labels) {
  const { left, right, top, bottom, unit, font } = chart
  textStyle(ctx, font)
  ctx.textAlign = 'right'
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = unit * 0.85
  ctx.beginPath()
  for (let i = 0; i < labels.length; i++) {
    const y = bottom - i / (labels.length - 1) * (bottom - top)
    line(ctx, left, y, right, y)
    ctx.fillText(labels[i], left - 5 * unit, y)
  }
  ctx.stroke()
}

function traceBase(layer, pass) {
  const chart = metrics(layer, false)
  const { left, right, top, bottom, w, h, unit, font } = chart
  const ctx = layer.base
  background(layer, chart)
  const maxY = Math.max(2, Math.ceil(pass.peakPx * 2) / 2)
  chart.y = value => bottom - Math.min(1, value / maxY) * h
  chart.x = frame => left + frame / (FRAME_COUNT - 1) * w
  yAxis(ctx, chart, ['0 px', `${(maxY / 2).toFixed(1)} px`, `${maxY.toFixed(1)} px`])
  const interval = w / font > 75 ? 20 : 40
  textStyle(ctx, font)
  ctx.textAlign = 'center'
  for (const major of [false, true]) {
    ctx.beginPath()
    ctx.strokeStyle = major ? colors.grid : colors.fineGrid
    ctx.lineWidth = unit * 0.75
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const frameNumber = frame + 1
      if (frame && frameNumber % 5 !== 0) continue
      if ((frame === 0 || frameNumber % interval === 0) !== major) continue
      const x = chart.x(frame)
      line(ctx, x, top, x, bottom)
      if (major) ctx.fillText(String(frameNumber), x, bottom + (layer.height - bottom) * 0.54)
    }
    ctx.stroke()
  }
  // Registration is absent at the end of the capture. Keep missing samples distinct
  // from genuine zero-error observations.
  const last = pass.sourceFrames.at(-1) + 1
  const gapX = chart.x(last + 0.5)
  ctx.save()
  ctx.beginPath()
  ctx.rect(gapX, top, right-gapX, h)
  ctx.clip()
  ctx.fillStyle = '#243034'
  ctx.fillRect(gapX, top, right-gapX, h)
  ctx.beginPath()
  for (let x = gapX-h; x < right; x += 7 * unit) line(ctx, x, bottom, x+h, top)
  ctx.strokeStyle = '#344448'
  ctx.lineWidth = .7 * unit
  ctx.stroke()
  ctx.restore()
  textStyle(ctx, font)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#b6c6c6'
  if (right-gapX > ctx.measureText('NO TRACK').width + 8*unit) {
    const labelY = top + Math.min(1.12*font, h*.23)
    const labelW = ctx.measureText('NO TRACK').width + 7*unit
    ctx.fillStyle = '#243034'
    ctx.fillRect((right+gapX-labelW)/2, labelY-font*.65, labelW, 1.3*font)
    ctx.fillStyle = '#becdcd'
    ctx.fillText('NO TRACK', (gapX+right)/2, labelY)
  }

  function drawSeries(values, color, lineWidth) {
    ctx.beginPath()
    for (let i = 0; i < FRAME_COUNT; i++) {
      if (values[i] === null) continue
      if (i === 0 || values[i-1] === null) ctx.moveTo(chart.x(i), chart.y(values[i]))
      else ctx.lineTo(chart.x(i), chart.y(values[i]))
    }
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(lineWidth * unit, .85 / layer.sx)
    ctx.stroke()
  }
  ctx.lineJoin = 'round'
  drawSeries(pass.trace, colors.trace, 1.25)
  drawSeries(pass.averageTrace, colors.mean, 1.75)

  // Pick real extrema of the observed trace. Avoid a dot per sample at call size.
  ctx.beginPath()
  ctx.fillStyle = colors.dot
  const radius = Math.max(1.3 * unit, .85 / layer.sx)
  for (let i = 3; i < last - 2; i++) {
    const v = pass.trace[i]
    if (v === null || v < pass.p95Px || v < Math.max(...pass.trace.slice(i-2, i+3))) continue
    ctx.moveTo(chart.x(i) + radius, chart.y(v))
    ctx.arc(chart.x(i), chart.y(v), radius, 0, TAU)
  }
  ctx.fill()
  // Instrument key occupies the gutter above the plot. The active frame tag can
  // pass over it; strip restoration then recovers the key from this cached raster.
  const keyY = top * .44
  let keyX = left
  textStyle(ctx, font, 500)
  ctx.textAlign = 'left'
  for (const [label, color] of [['FRAME RMS', colors.trace], ['12-FRAME MEAN', colors.mean]]) {
    ctx.fillStyle = color
    ctx.fillRect(keyX, keyY - .7*unit, 10*unit, 1.5*unit)
    ctx.fillText(label, keyX+14*unit, keyY)
    keyX += ctx.measureText(label).width + 29*unit
  }
  ctx.strokeStyle = colors.axis
  ctx.lineWidth = 0.8 * unit
  ctx.beginPath()
  line(ctx, left, bottom, right, bottom)
  ctx.stroke()
  layer.chart = chart
  layer.prior = null
  restore(layer)
}

function traceMarker(layer, pass, framePosition) {
  const { chart, context: ctx } = layer
  const { unit, font } = chart
  const x = chart.x(framePosition)
  const frame = Math.round(framePosition)
  if (layer.prior && Math.abs(layer.prior.x - x) * layer.sx < 0.35 && layer.prior.frame === frame) return
  if (layer.prior) restore(layer, layer.prior.left, layer.prior.right)
  const value = pass.trace[frame]
  ctx.strokeStyle = colors.selection
  ctx.lineWidth = Math.max(1 * unit, 1 / layer.sx)
  ctx.beginPath()
  line(ctx, x, chart.top, x, chart.bottom)
  ctx.stroke()
  if (value !== null) {
    ctx.beginPath()
    ctx.fillStyle = '#e0eaf5'
    ctx.arc(x, chart.y(value), 2.8 * unit, 0, TAU)
    ctx.fill()
    ctx.stroke()
  }
  const label = 'F' + String(frame+1).padStart(3, '0')
  textStyle(ctx, font * 0.98, 600)
  const tagWidth = Math.max(18 * unit, ctx.measureText(label).width + 8 * unit)
  const tagHeight = font + 3.2 * unit
  const tagX = Math.max(1 * unit, Math.min(layer.width - tagWidth - unit, x - tagWidth / 2))
  const tagY = Math.max(0, chart.top - tagHeight + 2 * unit)
  ctx.fillStyle = colors.label
  ctx.beginPath()
  ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 2.0 * unit)
  ctx.fill()
  ctx.fillStyle = '#eef4fc'
  ctx.textAlign = 'center'
  ctx.fillText(label, tagX + tagWidth / 2, tagY + tagHeight / 2 - unit * 0.15)
  layer.prior = { x, frame, left: Math.min(tagX, x - 4 * unit) - 2, right: Math.max(tagX + tagWidth, x + 4 * unit) + 2 }
}

function histogramCountTick(value) {
  if (value < 1000) return String(Math.round(value))
  return `${Number((value / 1000).toFixed(1))}k`
}

function histogramBase(layer, pass, frame = 0) {
  const chart = metrics(layer, true)
  const { left, right, bottom, w, h, unit, font } = chart
  const ctx = layer.base
  background(layer, chart)
  const local = histogramWindow(pass, frame)
  const windowBins = local || pass.bins
  const step = local ? countStep : Math.max(100, Math.ceil(Math.max(...pass.bins) / 400) * 100)
  const ceiling = local ? histogramCeiling : Math.ceil(Math.max(...pass.bins) / step) * step
  const yLabels = []
  for (let i = 0; i <= ceiling; i += step) yLabels.push(histogramCountTick(i))
  yAxis(ctx, chart, yLabels)
  chart.binWidth = w / BIN_COUNT
  const gap = Math.min(chart.binWidth * 0.24, Math.max(0.75 * unit, 0.8 / layer.sx))
  chart.barX = i => left + i * chart.binWidth + gap / 2
  chart.barWidth = chart.binWidth - gap
  chart.barY = i => bottom - windowBins[i] / ceiling * h
  // Boundaries split the two mixed bins exactly at the class thresholds.
  const classes = ctx.createLinearGradient(left, 0, right, 0)
  for (const [start,end,color] of [[0,.6,colors.inlier],[.6,1.3,colors.marginal],[1.3,HISTOGRAM_LIMIT,colors.outlier]]) {
    classes.addColorStop(start/HISTOGRAM_LIMIT,color)
    classes.addColorStop(end/HISTOGRAM_LIMIT,color)
  }
  ctx.fillStyle = classes
  for (let i = 0; i < BIN_COUNT; i++) {
    const y = chart.barY(i)
    ctx.fillRect(chart.barX(i), y, chart.barWidth, bottom - y)
  }
  ctx.save()
  ctx.setLineDash([2.5*unit, 2.5*unit])
  ctx.lineWidth = Math.max(.8*unit,.6/layer.sx)
  for (const [threshold, color] of [[.6, colors.marginal], [1.3, colors.outlier]]) {
    ctx.strokeStyle = color
    ctx.globalAlpha = .58
    const x = left + threshold / HISTOGRAM_LIMIT * w
    ctx.beginPath()
    line(ctx, x, chart.top, x, bottom)
    ctx.stroke()
  }
  ctx.restore()
  textStyle(ctx, font)
  const xStep = w / font > 38 ? .5 : 1
  const ticksY = bottom + (layer.height-bottom)*.54
  for (let tick = 0; tick <= HISTOGRAM_LIMIT; tick += xStep) {
    const x = left + tick / HISTOGRAM_LIMIT * w
    if (tick===2.5 && right-x < (ctx.measureText('≥2.94 px').width+font)) continue
    ctx.textAlign = tick===0 ? 'left' : tick===HISTOGRAM_LIMIT ? 'right' : 'center'
    const label = tick===0 ? '0' : tick===HISTOGRAM_LIMIT ? '≥2.94 px' : tick.toFixed(1)
    ctx.fillText(label, x, ticksY)
  }
  ctx.strokeStyle = colors.axis
  ctx.lineWidth = 0.8 * unit
  ctx.beginPath()
  line(ctx, left, bottom, right, bottom)
  ctx.stroke()
  textStyle(ctx, font)
  ctx.textAlign = 'right'
  ctx.fillText(local ? '19 FRAMES' : 'WHOLE CAPTURE', right-3*unit, chart.top+font*.65)
  layer.chart = chart
  layer.prior = null
  restore(layer)
}

function histogramMarker(layer, selectedPx) {
  const index = Math.min(BIN_COUNT - 1, Math.floor(selectedPx / HISTOGRAM_LIMIT * BIN_COUNT))
  if (layer.prior?.index === index) return
  if (layer.prior) restore(layer, layer.prior.left, layer.prior.right)
  const { chart, context: ctx } = layer
  const x = chart.barX(index)
  const y = chart.barY(index)
  ctx.fillStyle = '#e0eff7'
  ctx.fillRect(x, y, chart.barWidth, chart.bottom - y)
  layer.prior = { index, left: x - 1, right: x + chart.barWidth + 1 }
}

function donutBase(layer, pass) {
  const { width, height, base: ctx } = layer
  const { unit, font:baseFont } = metrics(layer, true)
  const font=Math.max(baseFont,Math.min(width/23,height/5.8))
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)
  const radius = Math.min(height * 0.34, width * 0.16)
  const ringWidth = radius * 0.29
  const cx = Math.max(radius + 5 * unit, width * 0.22)
  const cy = height / 2
  const series = [
    ['Inliers', colors.inlier, '<0.6 px'],
    ['Marginal', colors.marginal, '0.6–1.3 px'],
    ['Outliers', colors.outlier, '≥1.3 px'],
  ]
  const counts = pass.classes.reduce((a, b) => a + b, 0)
  let angle = -Math.PI / 2
  ctx.lineWidth = ringWidth
  ctx.lineCap = 'butt'
  for (let i = 0; i < series.length; i++) {
    const sweep = pass.classes[i] / counts * TAU
    const gap = Math.min(0.035, sweep * 0.12)
    ctx.strokeStyle = series[i][1]
    ctx.beginPath()
    ctx.arc(cx, cy, radius, angle + gap, angle + sweep - gap)
    ctx.stroke()
    angle += sweep
  }
  ctx.beginPath()
  for(let i=0; i<24; i++) {
    const a = i * TAU/24
    const r = radius + ringWidth*.72
    const r2 = r + unit*(i%6===0 ? 4 : 1.8)
    line(ctx, cx+Math.sin(a)*r, cy-Math.cos(a)*r, cx+Math.sin(a)*r2, cy-Math.cos(a)*r2)
  }
  ctx.strokeStyle = colors.axis
  ctx.lineWidth = Math.max(.8*unit,.7/layer.sx)
  ctx.stroke()
  textStyle(ctx, Math.min(1.46 * font, radius * 0.43), 600)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e0e3e7'
  ctx.fillText(`${pass.inlierPct.toFixed(1)}%`, cx, cy - font * 0.27)
  textStyle(ctx, Math.min(0.78 * font, radius * 0.26))
  ctx.fillText('INLIERS', cx, cy + font * 0.94)
  const legendX = Math.max(cx + radius + 12 * unit, width * 0.43)
  const rowHeight = Math.min(18.5 * unit, height / 3.6)
  series.forEach(([name, color, threshold], i) => {
    const y = cy + (i - 1) * rowHeight
    ctx.fillStyle = color
    ctx.fillRect(legendX, y - 2.5 * unit, 5 * unit, 5 * unit)
    textStyle(ctx, font)
    ctx.textAlign = 'left'
    ctx.fillText(name, legendX + 10 * unit, y)
    const thresholdX = legendX + 10*unit + ctx.measureText('Marginal').width + 7*unit
    const valueSpace = ctx.measureText('100.0%').width + 16*unit
    textStyle(ctx, font*.9)
    if (thresholdX + ctx.measureText('0.6–1.3 px').width < width-valueSpace) {
      ctx.fillStyle = '#aabbbb'
      ctx.fillText(threshold, thresholdX, y)
    }
    textStyle(ctx, font)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#d8dbe0'
    ctx.fillText(`${(pass.classes[i] / counts * 100).toFixed(1)}%`, width - 12 * unit, y)
  })
  layer.prior = null
  restore(layer)
}

/** Draw measured facial-flow residuals, with no independent animation clock.
 * Both canvases need a parent-controlled CSS size. The caller owns playback and timing.
 * update() returns numeric pixel-error metrics including the selected integer frame.
 */
export function createTelemetry({ traceCanvas, distributionCanvas }) {
  const trace = makeLayer(traceCanvas)
  const distributionLayer = makeLayer(distributionCanvas)
  const win = traceCanvas.ownerDocument.defaultView
  let resizeNeeded = true
  let lastDpr = 0
  let currentMode = ''
  let currentDistribution = ''
  let lastBinFrame=-1
  let disposed = false
  let lastSummary
  let classification = null
  let classRedraw = true
  const invalidate = () => { resizeNeeded = true }
  const observer = win.ResizeObserver ? new win.ResizeObserver(invalidate) : null
  observer?.observe(traceCanvas)
  observer?.observe(distributionCanvas)
  win.addEventListener('resize', invalidate, { passive: true })

  return {
    attachClassification(canvas) {
      if (classification) observer?.unobserve(classification.canvas)
      classification = canvas ? makeLayer(canvas) : null
      if (canvas) observer?.observe(canvas)
      classRedraw = true
      resizeNeeded = true
    },
    update({ time = 0, progress, sourceFrame, distribution = 'histogram' } = {}) {
      if (disposed) return lastSummary
      const name = 'optical'
      const kind = distribution === 'donut' ? 'donut' : 'histogram'
      const pass = recordedPass
      const dpr = Math.min(win.devicePixelRatio || 1, 3)
      let traceResized = false
      let distributionResized = false
      if (resizeNeeded || lastDpr !== dpr) {
        traceResized = sizeLayer(trace, dpr)
        distributionResized = sizeLayer(distributionLayer, dpr)
        if (classification) classRedraw = sizeLayer(classification, dpr) || classRedraw
        lastDpr = dpr
        resizeNeeded = false
      }
      const fraction = Number.isFinite(progress) ? progress : Number.isFinite(time) ? (time % 10 + 10) % 10 / 10 : 0
      const position = Number.isFinite(sourceFrame) ? Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(sourceFrame))) : Math.max(0, Math.min(1, fraction)) * (FRAME_COUNT - 1)
      const frame = Math.round(position)
      const selectedPx = pass.trace[frame]
      if (trace.width > 0 && trace.height > 0 && trace.context) {
        if (currentMode !== name || traceResized) traceBase(trace, pass)
        traceMarker(trace, pass, position)
      }
      if (distributionLayer.width > 0 && distributionLayer.height > 0 && distributionLayer.context) {
        const binFrame=frame
        if (currentMode !== name || currentDistribution !== kind || distributionResized || kind==='histogram' && lastBinFrame!==binFrame) {
          if (kind === 'donut') donutBase(distributionLayer, pass)
          else histogramBase(distributionLayer, pass, binFrame)
          lastBinFrame=binFrame
        }
        if (kind === 'histogram' && selectedPx !== null) histogramMarker(distributionLayer, selectedPx)
      }
      if (classification?.width && (classRedraw || currentMode !== name)) {
        donutBase(classification, pass)
        classRedraw = false
      }
      if (frame !== lastSummary?.frame || currentMode !== name) {
        lastSummary = { frame, frameCount: FRAME_COUNT, available: selectedPx !== null, selectedPx, meanPx: pass.meanPx, p95Px: pass.p95Px, peakPx: pass.peakPx, inlierPct: pass.inlierPct }
      }
      currentMode = name
      currentDistribution = kind
      return lastSummary
    },
    dispose() {
      if (disposed) return
      disposed = true
      observer?.disconnect()
      win.removeEventListener('resize', invalidate)
      for (const layer of [trace, distributionLayer]) layer.cache.width = layer.cache.height = 1
      if (classification) classification.cache.width = classification.cache.height = 1
    },
  }
}
