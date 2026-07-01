// Scale-calibrated wall digitizer. The user clicks two points a known
// distance apart (e.g. a printed dimension or the scale bar) to establish a
// pixels-per-metre scale for the currently rendered plan page, then a single
// "Auto-measure" call sends that exact image to the server — which asks
// Claude for wall-endpoint pixel coordinates only, never a length reading,
// and converts to metres deterministically using the calibration. This
// avoids relying on the model to OCR small printed dimension strings.
import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from '../lib/api.js';
import { Banner } from './ui.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const RENDER_SCALE = 2.0;

export default function PlanDigitizer({ file, onClose, onAddWalls }) {
  const baseCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const pdfDocRef = useRef(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState(null);

  const [calibrationPoints, setCalibrationPoints] = useState([]); // up to 2 points, canvas pixel coords
  const [pxPerMetre, setPxPerMetre] = useState(null);
  const [pendingDistanceMm, setPendingDistanceMm] = useState('');

  const [measuring, setMeasuring] = useState(false);
  const [measuredWalls, setMeasuredWalls] = useState([]); // [{ ...wall, included }]
  const [measureError, setMeasureError] = useState(null);

  // Load the PDF once per file.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
      } catch (e) {
        setError('Could not load the PDF for digitizing: ' + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // Render the current page whenever it changes; reset calibration/results
  // since they're specific to one page's pixel space.
  useEffect(() => {
    if (!pdfDocRef.current) return;
    let cancelled = false;
    setLoadingPage(true);
    setCalibrationPoints([]);
    setPxPerMetre(null);
    setMeasuredWalls([]);
    setMeasureError(null);
    (async () => {
      const page = await pdfDocRef.current.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = baseCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      canvas.width = overlay.width = viewport.width;
      canvas.height = overlay.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (!cancelled) setLoadingPage(false);
    })();
    return () => { cancelled = true; };
  }, [pageNum]);

  const drawOverlay = (points, walls) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.lineWidth = 3;
    // Calibration line — amber.
    if (points.length >= 1) {
      ctx.fillStyle = '#f59e0b';
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (points.length === 2) {
      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    }
    // Measured walls — blue, included ones only.
    ctx.strokeStyle = '#2563eb';
    for (const w of walls) {
      if (!w.included) continue;
      ctx.beginPath();
      ctx.moveTo(w._pixels.x1, w._pixels.y1);
      ctx.lineTo(w._pixels.x2, w._pixels.y2);
      ctx.stroke();
    }
  };

  useEffect(() => { drawOverlay(calibrationPoints, measuredWalls); }, [calibrationPoints, measuredWalls]);

  const handleCanvasClick = (e) => {
    if (pxPerMetre != null) return; // calibration is locked once set
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const scaleX = overlayCanvasRef.current.width / rect.width;
    const scaleY = overlayCanvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setCalibrationPoints((pts) => (pts.length >= 2 ? [{ x, y }] : [...pts, { x, y }]));
  };

  const applyCalibration = () => {
    const mm = Number(pendingDistanceMm);
    if (!mm || mm <= 0 || calibrationPoints.length !== 2) return;
    const [a, b] = calibrationPoints;
    const pixelDist = Math.hypot(b.x - a.x, b.y - a.y);
    setPxPerMetre(pixelDist / (mm / 1000));
  };

  const resetCalibration = () => {
    setPxPerMetre(null);
    setCalibrationPoints([]);
    setPendingDistanceMm('');
    setMeasuredWalls([]);
  };

  const runAutoMeasure = async () => {
    setMeasuring(true);
    setMeasureError(null);
    try {
      const dataUrl = baseCanvasRef.current.toDataURL('image/png');
      const result = await api.digitizeWalls(dataUrl, pxPerMetre, `page ${pageNum} of ${numPages}`);
      setMeasuredWalls((result.walls || []).map((w) => ({ ...w, included: true })));
    } catch (e) {
      setMeasureError(e.data?.error || e.message);
    } finally {
      setMeasuring(false);
    }
  };

  const toggleWall = (i) =>
    setMeasuredWalls((walls) => walls.map((w, idx) => (idx === i ? { ...w, included: !w.included } : w)));

  const addToTakeoff = () => {
    const included = measuredWalls.filter((w) => w.included).map(({ included, _pixels, ...w }) => w);
    if (included.length) onAddWalls(included);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 sm:p-6" onClick={onClose}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Digitize walls from plan</p>
            <p className="text-xs text-gray-500">
              Click two points a known distance apart to set the scale, then auto-measure every wall on this page.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto bg-gray-50 p-4">
            {error ? (
              <Banner tone="error">{error}</Banner>
            ) : (
              <div className="relative inline-block">
                <canvas ref={baseCanvasRef} className="block max-w-none" />
                <canvas
                  ref={overlayCanvasRef}
                  onClick={handleCanvasClick}
                  className="absolute left-0 top-0 max-w-none"
                  style={{ cursor: pxPerMetre == null ? 'crosshair' : 'default' }}
                />
              </div>
            )}
          </div>

          <div className="w-80 shrink-0 overflow-y-auto border-l p-4 space-y-4">
            {numPages > 1 && (
              <div className="flex items-center justify-between">
                <button className="btn-ghost" disabled={pageNum <= 1} onClick={() => setPageNum((p) => p - 1)}>← Prev</button>
                <span className="text-sm text-gray-500">Page {pageNum} / {numPages}</span>
                <button className="btn-ghost" disabled={pageNum >= numPages} onClick={() => setPageNum((p) => p + 1)}>Next →</button>
              </div>
            )}

            {loadingPage && <p className="text-sm text-gray-400">Rendering page…</p>}

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">1. Set scale</p>
              {pxPerMetre == null ? (
                <>
                  <p className="text-xs text-gray-500">
                    Click two points on the plan a known distance apart (a printed dimension works well), then enter that distance.
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Points clicked: {calibrationPoints.length} / 2</p>
                  {calibrationPoints.length === 2 && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number" step="any"
                        className="input w-28"
                        placeholder="mm"
                        value={pendingDistanceMm}
                        onChange={(e) => setPendingDistanceMm(e.target.value)}
                      />
                      <button className="btn-primary" onClick={applyCalibration}>Set scale</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-green-700">✓ Scale set: {pxPerMetre.toFixed(1)} px/m</p>
                  <button className="text-xs text-gray-400 hover:text-red-500" onClick={resetCalibration}>Reset</button>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">2. Auto-measure</p>
              <button
                className="btn-primary w-full"
                disabled={pxPerMetre == null || measuring}
                onClick={runAutoMeasure}
              >
                {measuring ? 'Measuring…' : 'Auto-measure walls on this page'}
              </button>
              {measureError && <p className="mt-2 text-xs text-red-600">{measureError}</p>}
            </div>

            {measuredWalls.length > 0 && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  3. Review ({measuredWalls.filter((w) => w.included).length} of {measuredWalls.length} selected)
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {measuredWalls.map((w, i) => (
                    <label key={i} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-white">
                      <input type="checkbox" checked={w.included} onChange={() => toggleWall(i)} />
                      <span className="flex-1 truncate">{w.location || `Wall ${i + 1}`}</span>
                      <span className="font-medium tabular-nums">{w.length_m.toFixed(2)}m</span>
                    </label>
                  ))}
                </div>
                <button className="btn-primary mt-3 w-full" onClick={addToTakeoff}>
                  Add {measuredWalls.filter((w) => w.included).length} wall(s) to take-off
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
