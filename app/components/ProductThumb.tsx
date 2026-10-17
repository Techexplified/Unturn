import React, { useState } from "react";

interface ProductThumbProps {
  src?: string | null;
  alt: string;
  className?: string;
  size?: number;
}

export function ProductThumb({ src, alt, className = "", size = 36 }: ProductThumbProps) {
  const [hasError, setHasError] = useState(false);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        backgroundColor: "#f1f5f9",
        border: "1px solid #e2e8f0",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      className={className}
    >
      {src && !hasError ? (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <span style={{ fontSize: size > 40 ? 20 : 16, color: "#64748b" }}>📦</span>
      )}
    </div>
  );
}
