/**
 * Author: Emiliano Deyta Illescas
 *
 * Description:
 * Unit tests for the FileDropZone component. Covers rendering states
 * (idle, selected, error), file classification (PDF / XML / rejected),
 * callbacks (onPdfChange, onXmlChange), and international mode behaviour.
 *
 * Note: react-dropzone is mocked so we can control the onDrop callback
 * directly without relying on native drag-and-drop events.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import FileDropZone from "@components/FileDropZone";

/* ── Mock react-dropzone ── */

let capturedOnDrop: ((files: File[]) => void) | null = null;

vi.mock("react-dropzone", () => ({
  useDropzone: (opts: any) => {
    capturedOnDrop = opts.onDrop;
    return {
      getRootProps: () => ({ role: "button", "aria-label": "Zona de carga de archivos PDF y XML" }),
      getInputProps: () => ({ type: "file", style: { display: "none" } }),
      isDragActive: false,
    };
  },
}));

function makePdf(name = "factura.pdf"): File {
  return new File(["pdf-content"], name, { type: "application/pdf" });
}

function makeXml(name = "factura.xml"): File {
  return new File(["xml-content"], name, { type: "application/xml" });
}

function makeTxt(name = "notas.txt"): File {
  return new File(["text"], name, { type: "text/plain" });
}

describe("FileDropZone", () => {
  beforeEach(() => {
    capturedOnDrop = null;
  });

  it("renders idle state with upload instructions", () => {
    render(<FileDropZone token="test-token" />);
    expect(screen.getByText(/arrastra tus archivos aquí/i)).toBeInTheDocument();
    expect(screen.getByText(/\.pdf/)).toBeInTheDocument();
  });

  it("shows XML requirement text for domestic trips", () => {
    render(<FileDropZone token="test-token" isInternational={false} />);
    expect(screen.getByText(/\.xml/)).toBeInTheDocument();
  });

  it("does not mention XML for international trips", () => {
    render(<FileDropZone token="test-token" isInternational={true} />);
    const hint = screen.getByText(/haz clic para seleccionar/i);
    expect(hint.textContent).not.toMatch(/\.xml/);
  });

  it("transitions to selected state when a PDF is dropped", async () => {
    render(<FileDropZone token="test-token" />);
    expect(capturedOnDrop).toBeTruthy();

    await act(async () => {
      capturedOnDrop!([makePdf()]);
    });

    expect(screen.getByText(/factura\.pdf/)).toBeInTheDocument();
  });

  it("calls onPdfChange when a PDF is dropped", async () => {
    const onPdfChange = vi.fn();
    render(<FileDropZone token="test-token" onPdfChange={onPdfChange} />);

    await act(async () => {
      capturedOnDrop!([makePdf()]);
    });

    expect(onPdfChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "factura.pdf" }),
    );
  });

  it("calls onXmlChange when an XML is dropped", async () => {
    const onXmlChange = vi.fn();
    render(<FileDropZone token="test-token" onXmlChange={onXmlChange} />);

    await act(async () => {
      capturedOnDrop!([makeXml()]);
    });

    expect(onXmlChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "factura.xml" }),
    );
  });

  it("classifies both PDF and XML from a single drop", async () => {
    const onPdfChange = vi.fn();
    const onXmlChange = vi.fn();
    render(
      <FileDropZone
        token="test-token"
        onPdfChange={onPdfChange}
        onXmlChange={onXmlChange}
      />,
    );

    await act(async () => {
      capturedOnDrop!([makePdf(), makeXml()]);
    });

    expect(onPdfChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "factura.pdf" }),
    );
    expect(onXmlChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "factura.xml" }),
    );
  });

  it("enters error state when a non-PDF/XML file is dropped", async () => {
    render(<FileDropZone token="test-token" />);

    await act(async () => {
      capturedOnDrop!([makeTxt()]);
    });

    expect(screen.getByText(/extensión no válida/i)).toBeInTheDocument();
    expect(screen.getByText(/notas\.txt/)).toBeInTheDocument();
  });

  it("enters error state when no valid files are provided", async () => {
    render(<FileDropZone token="test-token" />);

    await act(async () => {
      capturedOnDrop!([]);
    });

    expect(screen.getByText(/no se seleccionaron archivos válidos/i)).toBeInTheDocument();
  });

  it("shows a reset button after an error and can return to idle", async () => {
    render(<FileDropZone token="test-token" />);

    await act(async () => {
      capturedOnDrop!([makeTxt()]);
    });

    const retryButton = screen.getByText(/intentar de nuevo/i);
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(screen.getByText(/arrastra tus archivos aquí/i)).toBeInTheDocument();
  });

  it("has the correct aria-label for accessibility", () => {
    render(<FileDropZone token="test-token" />);
    expect(
      screen.getByRole("button", { name: /zona de carga/i }),
    ).toBeInTheDocument();
  });
});
