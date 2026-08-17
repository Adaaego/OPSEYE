import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/*
 * Converts a dashboard page or section into a multi-page PDF.
 *
 * Each page passes the DOM element it wants exported. Elements marked with
 * `data-pdf-ignore="true"` are omitted from the capture.
 */
export const exportElementToPdf = async ({
  element,
  filename = "OPSEYE-report.pdf",
  orientation = "portrait",
  pageFormat = "a4",
  margin = 24,
  backgroundColor = "#f8fafc",
} = {}) => {
  if (!element) {
    throw new Error(
      "A printable dashboard element was not provided."
    );
  }

  /*
   * Wait for two paint cycles so charts and recently-filtered UI finish
   * rendering before the PDF capture begins.
   */
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });

  const canvas = await html2canvas(
    element,
    {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor,
      logging: false,

      ignoreElements: (node) =>
        node?.getAttribute?.(
          "data-pdf-ignore"
        ) === "true",

      /*
       * Capture the full dashboard area rather than only the visible browser
       * viewport so long pages can continue across several PDF pages.
       */
      windowWidth:
        element.scrollWidth,
      windowHeight:
        element.scrollHeight,
    }
  );

  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: pageFormat,
    compress: true,
  });

  const pageWidth =
    pdf.internal.pageSize.getWidth();

  const pageHeight =
    pdf.internal.pageSize.getHeight();

  const usableWidth =
    pageWidth -
    margin * 2;

  const usableHeight =
    pageHeight -
    margin * 2;

  const renderedWidth =
    usableWidth;

  /*
   * Convert the printable PDF height into source-canvas pixels. The captured
   * dashboard can then be sliced into readable A4-sized pages.
   */
  const sourcePageHeight =
    (
      usableHeight *
      canvas.width
    ) /
    renderedWidth;

  let sourceY = 0;
  let pageIndex = 0;

  while (
    sourceY <
    canvas.height
  ) {
    const sliceHeight =
      Math.min(
        sourcePageHeight,
        canvas.height -
          sourceY
      );

    const pageCanvas =
      document.createElement(
        "canvas"
      );

    pageCanvas.width =
      canvas.width;

    pageCanvas.height =
      Math.ceil(
        sliceHeight
      );

    const context =
      pageCanvas.getContext(
        "2d"
      );

    if (!context) {
      throw new Error(
        "The browser could not prepare the PDF canvas."
      );
    }

    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const imageData =
      pageCanvas.toDataURL(
        "image/jpeg",
        0.95
      );

    const sliceRenderedHeight =
      (
        sliceHeight *
        renderedWidth
      ) /
      canvas.width;

    if (
      pageIndex >
      0
    ) {
      pdf.addPage();
    }

    pdf.addImage(
      imageData,
      "JPEG",
      margin,
      margin,
      renderedWidth,
      sliceRenderedHeight,
      undefined,
      "FAST"
    );

    sourceY +=
      sliceHeight;

    pageIndex +=
      1;
  }

  const resolvedFilename =
    filename
      .toLowerCase()
      .endsWith(".pdf")
      ? filename
      : `${filename}.pdf`;

  pdf.save(
    resolvedFilename
  );
};

/*
 * Produces consistent filenames across OPSEYE.
 *
 * Example:
 * OPSEYE_Shell_Western_Region_Operators_2026-08-17.pdf
 */
export const buildPdfFilename = ({
  pageName = "Report",
  scopeName = "",
  date = new Date(),
} = {}) => {
  const dateValue =
    date instanceof Date
      ? date
      : new Date(date);

  const safeDate =
    Number.isNaN(
      dateValue.getTime()
    )
      ? new Date()
      : dateValue;

  const dateLabel =
    safeDate
      .toISOString()
      .slice(
        0,
        10
      );

  const cleanPart = (
    value
  ) =>
    String(value || "")
      .trim()
      .replace(
        /[^a-zA-Z0-9]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );

  return [
    "OPSEYE",
    cleanPart(scopeName),
    cleanPart(pageName),
    dateLabel,
  ]
    .filter(Boolean)
    .join("_")
    .concat(".pdf");
};