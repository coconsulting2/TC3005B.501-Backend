import { useState, useRef } from "react";
import { FILE_DROP_ZONE_STYLES } from "@config/fileDropZone";
import type { FileDropZoneState } from "@config/fileDropZone";

interface Props {
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
  onFilesSelected: (files: File[]) => void;
  onError?: (message: string) => void;
}

export default function FileDropZone({
  accept,
  multiple = false,
  maxSizeMB = 10,
  disabled = false,
  label = "Arrastra archivos aquí o haz clic para seleccionar",
  hint,
  onFilesSelected,
  onError,
}: Props) {
  const [state, setState] = useState<FileDropZoneState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptedExtensions = accept
    ?.split(",")
    .map((ext) => ext.trim().toLowerCase());

  const validateFiles = (files: FileList | null): File[] | null => {
    if (!files || files.length === 0) return null;

    const fileArray = Array.from(files);
    const maxBytes = maxSizeMB * 1024 * 1024;

    for (const file of fileArray) {
      if (file.size > maxBytes) {
        const msg = `El archivo "${file.name}" excede el tamaño máximo de ${maxSizeMB}MB.`;
        setErrorMessage(msg);
        setState("error");
        onError?.(msg);
        return null;
      }

      if (acceptedExtensions) {
        const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
        const matchesExt = acceptedExtensions.some((a) => a === ext);
        const matchesMime = acceptedExtensions.some((a) => file.type === a);
        if (!matchesExt && !matchesMime) {
          const msg = `El archivo "${file.name}" no es un tipo permitido.`;
          setErrorMessage(msg);
          setState("error");
          onError?.(msg);
          return null;
        }
      }
    }

    return fileArray;
  };

  const handleFiles = (files: FileList | null) => {
    const validated = validateFiles(files);
    if (validated) {
      setErrorMessage(null);
      setState("idle");
      onFilesSelected(validated);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setState("hover");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setState("idle");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setState("idle");
    handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const currentStyle = disabled
    ? FILE_DROP_ZONE_STYLES.disabled
    : FILE_DROP_ZONE_STYLES[state];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${currentStyle}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-col items-center gap-2">
        <svg
          className={`w-10 h-10 ${state === "error" ? "text-[var(--color-warning-300)]" : "text-[var(--color-neutral-400)]"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <p className="text-sm font-medium text-[var(--color-neutral-500)]">
          {label}
        </p>

        {hint && (
          <p className="text-xs text-[var(--color-neutral-400)]">{hint}</p>
        )}

        {errorMessage && (
          <p className="text-xs text-[var(--color-warning-300)] font-medium">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
