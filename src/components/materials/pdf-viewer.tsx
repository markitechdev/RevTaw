"use client";

import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};

const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 2] as const;

/**
 * Renders a PDF with pdf.js on canvases, one per page, so it works the same in
 * every browser (mobile browsers do not render PDFs inside iframes). Pages are
 * drawn lazily as they scroll into view.
 */
export function PdfViewer({ url, title }: { url: string; title: string }) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [current, setCurrent] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let canceled = false;
    let loaded: PdfDocument | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const task = pdfjs.getDocument({ url, withCredentials: true });
        loaded = (await task.promise) as unknown as PdfDocument;
        if (canceled) {
          await loaded.destroy();
          return;
        }
        setDoc(loaded);
      } catch (cause) {
        console.error("pdf viewer: failed to load", cause);
        if (!canceled) setError("This PDF could not be displayed. You can still download it below.");
      }
    })();

    return () => {
      canceled = true;
      void loaded?.destroy();
    };
  }, [url]);

  const scrollToPage = useCallback((pageNumber: number) => {
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  if (error) {
    return <ErrorState title="Preview unavailable" description={error} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2" role="toolbar" aria-label="PDF controls">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Previous page"
            disabled={!doc || current <= 1}
            onClick={() => scrollToPage(current - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-24 text-center text-sm text-muted-foreground" aria-live="polite">
            {doc ? `Page ${current} of ${doc.numPages}` : "Loading…"}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Next page"
            disabled={!doc || current >= doc.numPages}
            onClick={() => scrollToPage(current + 1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center text-sm text-muted-foreground">
            {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
          </span>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Zoom in"
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="max-h-[75vh] overflow-auto rounded-xl border border-border bg-muted/60 p-3"
        aria-label={`${title} preview`}
      >
        {!doc ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground" role="status">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Loading preview…
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {Array.from({ length: doc.numPages }, (_, index) => (
              <PdfPageCanvas
                key={index + 1}
                doc={doc}
                pageNumber={index + 1}
                zoom={ZOOM_STEPS[zoomIndex]}
                onVisible={setCurrent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPageCanvas({
  doc,
  pageNumber,
  zoom,
  onVisible,
}: {
  doc: PdfDocument;
  pageNumber: number;
  zoom: number;
  onVisible: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRender(true);
            if (entry.intersectionRatio > 0.5) onVisible(pageNumber);
          }
        }
      },
      { rootMargin: "400px 0px", threshold: [0, 0.6] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  useEffect(() => {
    if (!shouldRender) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let canceled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (canceled) return;
      const container = wrapperRef.current?.parentElement;
      const available = Math.max(280, (container?.clientWidth ?? 800) - 24);
      const base = page.getViewport({ scale: 1 });
      const scale = (available / base.width) * zoom;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise.catch(() => undefined);
    })();

    return () => {
      canceled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, zoom, shouldRender]);

  return (
    <div ref={wrapperRef} data-page={pageNumber} className="w-full max-w-full overflow-x-auto">
      <canvas
        ref={canvasRef}
        className="mx-auto block min-h-40 rounded bg-white shadow-sm"
        role="img"
        aria-label={`Page ${pageNumber}`}
      />
    </div>
  );
}
