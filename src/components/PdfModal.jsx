"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Loader from "./Loader";

// In-page PDF viewer. Pages are drawn with pdf.js, because mobile browsers (Android especially)
// cannot show a PDF inside a page natively.
export default function PdfModal({ url, title, onClose }) {
  const pagesRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let pdf = null;

    const render = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        pdf = await pdfjs.getDocument(url).promise;
        const container = pagesRef.current;
        if (cancelled || !container) return;
        container.innerHTML = "";

        const width = container.clientWidth;
        const ratio = window.devicePixelRatio || 1;
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const scale = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale: scale * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.className = "mb-3 rounded-lg bg-white shadow";
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          if (number === 1 && !cancelled) setStatus("ready");
        }
      } catch (error) {
        console.error("Failed to render PDF", error);
        if (!cancelled) setStatus("error");
      }
    };

    render();
    return () => {
      cancelled = true;
      pdf?.destroy();
    };
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full max-h-[92svh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <p className="min-w-0 truncate text-sm font-semibold text-white">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-purple-500 hover:text-purple-300 transition"
            >
              Open in new tab
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:border-purple-500 hover:text-purple-300 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto bg-zinc-950 p-3 sm:p-4">
          {status === "loading" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-zinc-400">
              <Loader size="lg" />
              Loading your CV…
            </div>
          ) : null}
          {status === "error" ? (
            <p className="py-10 text-center text-sm text-red-300">
              Could not display the PDF here. Use “Open in new tab”.
            </p>
          ) : null}
          <div ref={pagesRef} />
        </div>
      </div>
    </div>
  );
}
