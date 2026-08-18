import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

/*
 * Export an OPSEYE page exactly as it is rendered in the dashboard.
 *
 * The page component itself is the capture target, so the sidebar is never
 * included. We deliberately do NOT change the cloned browser width and we do
 * NOT use scrollWidth to size the PDF. Both of those behaviours can cause
 * responsive charts to reflow or make SVG labels extend the export canvas.
 */
export const exportElementToPdf = async ({
  element,
  filename = "OPSEYE-report.pdf",
  backgroundColor = "#f8fafc",
} = {}) => {
  if (!element) {
    throw new Error(
      "A printable dashboard element was not provided."
    );
  }

  /*
   * Give React/Recharts two paint cycles to finish drawing the current screen
   * before html2canvas reads it.
   */
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });

  const liveRect =
    element.getBoundingClientRect();

  if (
    !liveRect.width ||
    !liveRect.height
  ) {
    throw new Error(
      "The dashboard export area has no visible size."
    );
  }

  const captureScale = 2;

  const canvas = await html2canvas(
    element,
    {
      scale: captureScale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor,

      /*
       * Preserve the real browser viewport. Do not substitute the element's
       * scrollWidth as windowWidth: that can trigger different Tailwind
       * breakpoints and distort ResponsiveContainer/Recharts output.
       */
      windowWidth:
        window.innerWidth,
      windowHeight:
        window.innerHeight,

      scrollX:
        -window.scrollX,
      scrollY:
        -window.scrollY,

      /*
       * Screen-only controls should disappear from the PDF without changing
       * the surrounding layout. visibility:hidden preserves their occupied
       * space, unlike removing the node completely.
       */
      onclone: (clonedDocument) => {
        /*
         * `data-pdf-ignore` keeps the element's space but hides the element.
         * This is useful for the Export button in a header because removing it
         * could change the surrounding layout.
         */
        clonedDocument
          .querySelectorAll(
            '[data-pdf-ignore="true"]'
          )
          .forEach((node) => {
            node.style.visibility =
              "hidden";
          });

        /*
         * Filters and other interactive-only controls should not leave blank
         * gaps in the exported report, so these elements are removed entirely.
         */
        clonedDocument
          .querySelectorAll(
            '[data-pdf-remove="true"]'
          )
          .forEach((node) => {
            node.style.display =
              "none";
          });

        /*
         * Some information is useful only in the exported report. These nodes
         * stay hidden on the live dashboard and are revealed in the PDF clone.
         */
        clonedDocument
          .querySelectorAll(
            '[data-pdf-only="true"]'
          )
          .forEach((node) => {
            node.style.display =
              "block";
          });

        /*
         * Animations/transitions can leave a cloned dashboard between frames.
         * Freeze them for a stable, screen-faithful capture.
         */
        const style =
          clonedDocument.createElement(
            "style"
          );

        style.textContent = `
          *, *::before, *::after {
            animation: none !important;
            transition: none !important;
            caret-color: transparent !important;
          }
        `;

        clonedDocument.head.appendChild(
          style
        );
      },
    }
  );

  if (
    !canvas.width ||
    !canvas.height
  ) {
    throw new Error(
      "The dashboard could not be rendered for PDF export."
    );
  }

  /*
   * Derive the PDF dimensions from the rendered canvas itself. Dividing by
   * captureScale gives us the exact CSS-pixel proportions that were visible
   * in the browser, without picking up overflow from chart ticks or SVG text.
   */
  const renderedCssWidth =
    canvas.width /
    captureScale;

  const renderedCssHeight =
    canvas.height /
    captureScale;

  const CSS_PIXEL_TO_POINT =
    72 / 96;

  const pdfWidth =
    renderedCssWidth *
    CSS_PIXEL_TO_POINT;

  const pdfHeight =
    renderedCssHeight *
    CSS_PIXEL_TO_POINT;

  /*
   * One continuous custom-sized PDF page gives the same visual result as the
   * dashboard screen: no A4 slicing, no broken charts and no artificial gaps.
   */
  const pdf = new jsPDF({
    orientation:
      pdfWidth > pdfHeight
        ? "landscape"
        : "portrait",
    unit: "pt",
    format: [
      pdfWidth,
      pdfHeight,
    ],
    compress: true,
  });

  const imageData =
    canvas.toDataURL(
      "image/png"
    );

  pdf.addImage(
    imageData,
    "PNG",
    0,
    0,
    pdfWidth,
    pdfHeight,
    undefined,
    "FAST"
  );

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
 * OPSEYE_Energy_ministry_view_Overview_2026-08-18.pdf
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
    cleanPart(
      scopeName
    ),
    cleanPart(
      pageName
    ),
    dateLabel,
  ]
    .filter(Boolean)
    .join("_")
    .concat(".pdf");
};