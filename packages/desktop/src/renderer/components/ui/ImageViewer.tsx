import React from "react";
import { useTheme } from "../../hooks/use-theme";

interface Props {
  src: string;
  onClose: () => void;
  filename?: string;
}

export function ImageViewer({ src, onClose, filename }: Props) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Fetch works for both data: URIs and http(s): URLs; blob download lets us
      // set a filename even when the source is a data URI.
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const extFromMime = blob.type.split("/")[1]?.split(";")[0] || "png";
      const name = (filename || `image-${Date.now()}`).replace(/\.[^.]+$/, "") + `.${extFromMime}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const btnStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "zoom-out",
      }}
    >
      <img
        src={src}
        alt="Receipt"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          borderRadius: borderRadius.md,
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          cursor: "default",
        }}
      />
      {/* Download button (top-right, left of the close button) */}
      <button
        onClick={handleDownload}
        title="Download image"
        style={{
          ...btnStyle,
          position: "fixed",
          top: 16,
          right: 64,
          fontSize: fontSize.md,
        }}
      >
        ↓
      </button>
      <button
        onClick={onClose}
        title="Close"
        style={{
          ...btnStyle,
          position: "fixed",
          top: 16,
          right: 16,
        }}
      >
        ×
      </button>
    </div>
  );
}
