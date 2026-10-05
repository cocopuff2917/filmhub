import { useState } from "react";

export default function ImageWithFallback({ src, fallbackSrc, alt = "", className, fallback, ...imageProps }) {
  const [failedSources, setFailedSources] = useState([]);
  const displaySrc = failedSources.includes(src) && fallbackSrc ? fallbackSrc : src;

  if (!displaySrc || failedSources.includes(displaySrc)) return fallback ?? null;

  return (
    <img
      {...imageProps}
      src={displaySrc}
      alt={alt}
      className={className}
      onError={() => setFailedSources((sources) => sources.includes(displaySrc) ? sources : [...sources, displaySrc])}
    />
  );
}