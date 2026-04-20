/**
 * FileDropZone — Drag & drop zone for PDF and XML receipt files.
 *
 * Two modes:
 *  1. Selection mode (no uploadUrl): validates & stores files, exposes via onPdfChange/onXmlChange.
 *  2. Upload mode (uploadUrl provided): uploads via XMLHttpRequest with real progress.
 *
 * Backend contract: POST /api/files/upload-receipt-files/:receipt_id
 *   - Multipart form with fields "pdf" and "xml" (both required).
 *   - Response: { message, pdf, xml, cfdi?, registro_sugerido? }
 *
 * For international trips (isInternational=true), XML is optional —
 * a default.xml placeholder is fetched from /default.xml before upload.
 *
 * States: idle → dragging → selected → uploading → done (or error).
 */

import { useState, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { useDropzone } from "react-dropzone";

/* ── Types ── */

type DropZoneState = "idle" | "dragging" | "selected" | "uploading" | "done" | "error";

/** Resumen fiscal devuelto por el backend tras parsear el XML (GridFS). */
export interface ReceiptUploadCfdiSummary {
  uuid: string;
  version: string;
  rfcEmisor: string;
  rfcReceptor: string | null;
  fecha: string;
  total: number;
  selloUltimos8: string | null;
  taxes: unknown;
}

export interface ReceiptUploadResponse {
  message: string;
  pdf: { fileId: string; fileName: string };
  xml: { fileId: string; fileName: string };
  cfdi?: ReceiptUploadCfdiSummary;
  registro_sugerido?: Record<string, unknown> | null;
}

export interface FileDropZoneHandle {
  /** Trigger upload programmatically (for deferred upload flow) */
  upload: (url: string) => Promise<ReceiptUploadResponse>;
  /** Get currently selected files */
  getFiles: () => { pdf: File | null; xml: File | null };
  /** Reset to idle */
  reset: () => void;
}

interface FileDropZoneProps {
  /** Bearer token for auth header */
  token: string;
  /** If true, XML is optional (a default.xml placeholder is used) */
  isInternational?: boolean;
  /** Called when a PDF file is selected/cleared */
  onPdfChange?: (file: File | null) => void;
  /** Called when an XML file is selected/cleared */
  onXmlChange?: (file: File | null) => void;
  /** Upload endpoint URL — if provided, files upload automatically on drop */
  uploadUrl?: string;
  /** Called with server response on successful upload (auto-upload mode) */
  onUploadComplete?: (response: ReceiptUploadResponse) => void;
  /** Called on upload error */
  onUploadError?: (error: string) => void;
  className?: string;
}

/* ── Helpers ── */

const ACCEPTED_EXTENSIONS = [".pdf", ".xml"];

const ACCEPT_MAP: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/xml": [".xml"],
  "text/xml": [".xml"],
};

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function apiOriginFromUploadUrl(uploadUrl: string): string {
  try {
    return new URL(uploadUrl).origin;
  } catch {
    return "";
  }
}

/** Misma cookie de sesión `_csrf` que usa `apiClient` para POST JSON. */
async function fetchCsrfToken(apiOrigin: string): Promise<string> {
  const res = await fetch(`${apiOrigin}/api/user/csrf-token`, {
    method: "GET",
    credentials: "include",
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`CSRF ${res.status}: ${bodyText.slice(0, 120)}`);
  }
  let data: { csrfToken?: string };
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    throw new Error("Respuesta CSRF no es JSON");
  }
  if (!data?.csrfToken) {
    throw new Error("Token CSRF ausente");
  }
  return data.csrfToken;
}

function classifyFiles(files: File[]): {
  pdf: File | null;
  xml: File | null;
  rejected: string[];
} {
  let pdf: File | null = null;
  let xml: File | null = null;
  const rejected: string[] = [];

  for (const file of files) {
    const ext = getExtension(file.name);
    if (ext === ".pdf" && !pdf) {
      pdf = file;
    } else if (ext === ".xml" && !xml) {
      xml = file;
    } else if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      rejected.push(file.name);
    }
  }
  return { pdf, xml, rejected };
}

async function fetchDefaultXml(): Promise<File> {
  const res = await fetch("/default.xml");
  const blob = await res.blob();
  return new File([blob], "default.xml", { type: "application/xml" });
}

function uploadWithProgress(
  url: string,
  pdf: File,
  xml: File,
  token: string,
  onProgress: (pct: number) => void
): Promise<ReceiptUploadResponse> {
  return (async () => {
    const origin = apiOriginFromUploadUrl(url);
    if (!origin) {
      throw new Error("URL de subida inválida");
    }
    const csrfToken = await fetchCsrfToken(origin);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("pdf", pdf);
      formData.append("xml", xml);

      xhr.withCredentials = true;

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Respuesta inesperada del servidor"));
          }
        } else {
          reject(new Error(`Error ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Error de red al subir archivos")));
      xhr.addEventListener("abort", () => reject(new Error("Subida cancelada")));

      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("csrf-token", csrfToken);
      xhr.send(formData);
    });
  })();
}

/* ── Component ── */

const FileDropZone = forwardRef<FileDropZoneHandle, FileDropZoneProps>(function FileDropZone(
  {
    token,
    isInternational = false,
    onPdfChange,
    onXmlChange,
    uploadUrl,
    onUploadComplete,
    onUploadError,
    className = "",
  },
  ref
) {
  const [state, setState] = useState<DropZoneState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [doneFiles, setDoneFiles] = useState<string[]>([]);

  // Notify parent of file changes
  useEffect(() => { onPdfChange?.(pdfFile); }, [pdfFile]);
  useEffect(() => { onXmlChange?.(xmlFile); }, [xmlFile]);

  const reset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setErrorMsg("");
    setPdfFile(null);
    setXmlFile(null);
    setDoneFiles([]);
  }, []);

  /** Core upload logic — used by both auto-upload and imperative trigger */
  const doUpload = useCallback(
    async (url: string, pdf: File, xml: File | null): Promise<ReceiptUploadResponse> => {
      setState("uploading");
      setProgress(0);
      setErrorMsg("");

      const finalXml = xml ?? (isInternational ? await fetchDefaultXml() : null);
      if (!finalXml) {
        throw new Error("Se requiere un archivo XML para viajes nacionales");
      }

      return uploadWithProgress(url, pdf, finalXml, token, setProgress);
    },
    [token, isInternational]
  );

  // Imperative handle for parent-controlled upload
  useImperativeHandle(
    ref,
    () => ({
      upload: async (url: string) => {
        if (!pdfFile) throw new Error("No se ha seleccionado un archivo PDF");
        try {
          const response = await doUpload(url, pdfFile, xmlFile);
          setState("done");
          setDoneFiles([pdfFile.name, xmlFile?.name ?? "default.xml"].filter(Boolean));
          return response;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al subir archivos";
          setState("error");
          setErrorMsg(msg);
          throw err;
        }
      },
      getFiles: () => ({ pdf: pdfFile, xml: xmlFile }),
      reset,
    }),
    [pdfFile, xmlFile, doUpload, reset]
  );

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const { pdf, xml, rejected } = classifyFiles(acceptedFiles);

      if (rejected.length > 0) {
        setState("error");
        setErrorMsg(
          `Extensión no válida: ${rejected.join(", ")}. Solo se aceptan .pdf y .xml`
        );
        return;
      }

      if (!pdf && !xml) {
        setState("error");
        setErrorMsg("No se seleccionaron archivos válidos");
        return;
      }

      // Merge with existing selections
      const nextPdf = pdf ?? pdfFile;
      const nextXml = xml ?? xmlFile;
      setPdfFile(nextPdf);
      setXmlFile(nextXml);

      // Auto-upload mode: both files ready + URL provided
      if (uploadUrl && nextPdf && (nextXml || isInternational)) {
        try {
          const response = await doUpload(uploadUrl, nextPdf, nextXml);
          setState("done");
          setDoneFiles([nextPdf.name, nextXml?.name ?? "default.xml"]);
          onUploadComplete?.(response);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al subir archivos";
          setState("error");
          setErrorMsg(msg);
          onUploadError?.(msg);
        }
        return;
      }

      // Selection mode: just show what's been picked
      setState("selected");
    },
    [pdfFile, xmlFile, uploadUrl, isInternational, doUpload, onUploadComplete, onUploadError]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPT_MAP,
    maxFiles: 2,
    disabled: state === "uploading",
    noClick: state === "uploading",
    noDrag: state === "uploading",
  });

  const displayState: DropZoneState =
    isDragActive && state !== "uploading" ? "dragging" : state;

  const needsPdf = !pdfFile;
  const needsXml = !isInternational && !xmlFile;

  return (
    <div className={`w-full ${className}`}>
      <div
        {...getRootProps()}
        className={`
          relative flex flex-col items-stretch justify-center gap-3
          border-2 border-dashed rounded-[var(--radius-lg)] p-6
          transition-all duration-200 cursor-pointer min-h-[160px]
          ${stateStyles[displayState]}
          ${state === "uploading" ? "cursor-default" : ""}
        `}
        role="button"
        aria-label="Zona de carga de archivos PDF y XML"
      >
        <input {...getInputProps()} />

        {displayState === "idle" && <IdleContent isInternational={isInternational} />}
        {displayState === "dragging" && <DraggingContent />}
        {displayState === "selected" && (
          <SelectedContent
            pdfName={pdfFile?.name ?? null}
            xmlName={xmlFile?.name ?? null}
            needsPdf={needsPdf}
            needsXml={needsXml}
            isInternational={isInternational}
          />
        )}
        {displayState === "uploading" && <UploadingContent progress={progress} />}
        {displayState === "done" && <DoneContent files={doneFiles} />}
        {displayState === "error" && <ErrorContent message={errorMsg} />}
      </div>

      {(state === "done" || state === "error") && (
        <button
          onClick={reset}
          className="mt-3 text-sm font-medium text-primary-400 hover:text-primary-500 transition-colors cursor-pointer"
        >
          {state === "done" ? "Subir más archivos" : "Intentar de nuevo"}
        </button>
      )}
    </div>
  );
});

export default FileDropZone;

/* ── State-dependent styles ── */

const stateStyles: Record<DropZoneState, string> = {
  idle: "border-[var(--color-neutral-300)] bg-[var(--color-surface-white)] hover:border-primary-300 hover:bg-primary-50/30",
  dragging: "border-primary-400 bg-primary-50/50 scale-[1.01]",
  selected: "border-primary-300 bg-primary-50/20",
  uploading: "border-[var(--color-neutral-300)] bg-[var(--color-surface-secondary)]",
  done: "border-success-300 bg-success-50/40",
  error: "border-accent-300 bg-accent-50/40",
};

/* ── Sub-components for each state ── */

function IdleContent({ isInternational }: { isInternational: boolean }) {
  return (
    <div className="w-full flex flex-col items-center">
      <UploadIcon className="w-8 h-8 text-[var(--color-ink-muted)]" />
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-ink-secondary)]">
          Arrastra tus archivos aquí
        </p>
        <p className="text-xs text-[var(--color-ink-muted)] mt-1">
          o haz clic para seleccionar &middot; <strong>.pdf</strong>
          {!isInternational && <> y <strong>.xml</strong></>}
        </p>
      </div>
    </div>
  );
}

function DraggingContent() {
  return (
    <div className="w-full flex flex-col items-center">
      <UploadIcon className="w-8 h-8 text-primary-400 animate-bounce" />
      <p className="text-sm font-medium text-primary-500">Suelta los archivos aquí</p>
    </div>
  );
}

function SelectedContent({
  pdfName,
  xmlName,
  needsPdf,
  needsXml,
  isInternational,
}: {
  pdfName: string | null;
  xmlName: string | null;
  needsPdf: boolean;
  needsXml: boolean;
  isInternational: boolean;
}) {
  return (
    <div className="w-full max-w-none mx-auto px-0 sm:px-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 items-start">
        <FileChip label="PDF" fileName={pdfName} missing={needsPdf} />
        {!isInternational && (
          <FileChip label="XML" fileName={xmlName} missing={needsXml} />
        )}
        {isInternational && !xmlName && (
          <p className="text-xs text-[var(--color-ink-muted)] text-center mt-1 sm:col-span-2">
            Viaje internacional — se usará XML por defecto
          </p>
        )}
      </div>
      {(needsPdf || needsXml) && (
        <p className="text-sm text-[var(--color-ink-muted)] text-center mt-2 leading-relaxed sm:col-span-2 max-w-none">
          Arrastra o haz clic para agregar{needsPdf ? " el PDF" : ""}{needsPdf && needsXml ? " y" : ""}{needsXml ? " el XML" : ""} faltante
        </p>
      )}
    </div>
  );
}

function FileChip({ label, fileName, missing }: { label: string; fileName: string | null; missing: boolean }) {
  return (
    <div
      className={`w-full grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border text-sm min-w-0 ${
        missing
          ? "border-dashed border-[var(--color-neutral-300)] text-[var(--color-ink-muted)]"
          : "border-success-200 bg-success-50/50 text-success-500"
      }`}
    >
      {missing ? (
        <PlusIcon className="w-4 h-4" />
      ) : (
        <CheckIcon className="w-4 h-4" />
      )}
      <span className="font-medium whitespace-nowrap">{label}:</span>
      <span className="min-w-0 truncate">{fileName ?? `Falta archivo .${label.toLowerCase()}`}</span>
    </div>
  );
}

function UploadingContent({ progress }: { progress: number }) {
  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-3">
      <SpinnerIcon className="w-6 h-6 text-primary-400 animate-spin" />
      <p className="text-sm font-medium text-[var(--color-ink-secondary)]">
        Subiendo... {progress}%
      </p>
      <div className="w-full h-2 bg-[var(--color-neutral-200)] rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

function DoneContent({ files }: { files: string[] }) {
  return (
    <div className="w-full flex flex-col items-center">
      <CheckIcon className="w-8 h-8 text-success-400" />
      <div className="text-center">
        <p className="text-sm font-medium text-success-500">Archivos subidos correctamente</p>
        {files.length > 0 && (
          <p className="text-xs text-[var(--color-ink-muted)] mt-1">{files.join(", ")}</p>
        )}
      </div>
    </div>
  );
}

function ErrorContent({ message }: { message: string }) {
  return (
    <div className="w-full flex flex-col items-center">
      <ErrorIcon className="w-8 h-8 text-accent-400" />
      <div className="text-center">
        <p className="text-sm font-medium text-accent-500">Error</p>
        <p className="text-xs text-accent-400 mt-1">{message}</p>
      </div>
    </div>
  );
}

/* ── SVG Icons ── */

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}
