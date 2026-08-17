import {
    useState,
  } from "react";
  
  import {
    Download,
    Loader2,
  } from "lucide-react";
  
  import {
    Button,
  } from "./Button";
  
  import {
    exportElementToPdf,
  } from "../../lib/pdf-export";
  
  /*
   * Shared PDF action for dashboard page headers.
   *
   * Each page provides the ref of the content that should be exported. Keeping
   * the capture target outside this component lets Overview, Operators, Reports,
   * Workforce and future tabs reuse the same button.
   */
  const ExportPdfButton = ({
    targetRef,
    filename = "OPSEYE-report.pdf",
    orientation = "portrait",
    disabled = false,
    className = "",
    onBeforeExport = null,
    onAfterExport = null,
    onExportError = null,
  }) => {
    const [
      exporting,
      setExporting,
    ] = useState(false);
  
    const handleExport =
      async () => {
        if (
          exporting ||
          disabled
        ) {
          return;
        }
  
        const targetElement =
          targetRef?.current;
  
        if (!targetElement) {
          const error =
            new Error(
              "The PDF export area is not available."
            );
  
          console.error(
            error
          );
  
          onExportError?.(
            error
          );
  
          return;
        }
  
        try {
          setExporting(
            true
          );
  
          await onBeforeExport?.();
  
          await exportElementToPdf({
            element:
              targetElement,
            filename,
            orientation,
          });
  
          await onAfterExport?.();
        } catch (error) {
          console.error(
            "Unable to export PDF:",
            error
          );
  
          onExportError?.(
            error
          );
        } finally {
          setExporting(
            false
          );
        }
      };
  
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={
          handleExport
        }
        disabled={
          disabled ||
          exporting
        }
        /*
         * The export control is useful on screen but should never appear inside
         * the exported document.
         */
        data-pdf-ignore="true"
        className={
          className
        }
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
  
        {exporting
          ? "Preparing PDF..."
          : "Export PDF"}
      </Button>
    );
  };
  
  export default ExportPdfButton;