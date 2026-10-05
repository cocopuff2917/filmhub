import { useState } from "react";

export default function ImageWithFallback({ src, alt = "", className, fallback, ...imageProps }) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) return fallback ?? null;

  return (
    <img
      {...imageProps}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}