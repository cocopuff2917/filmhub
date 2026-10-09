import { useEffect, useRef, useState } from "react";

export default function ImageWithFallback({ src, fallbackSrc, resolveFallback, alt = "", className, fallback, referrerPolicy = "no-referrer", loading = "lazy", decoding = "async", ...imageProps }) {
  const [failedSources, setFailedSources] = useState([]);
  const [resolvedFallback, setResolvedFallback] = useState("");
  const [resolverAttempted, setResolverAttempted] = useState(false);
  const resolverRef = useRef(resolveFallback);
  resolverRef.current = resolveFallback;
  const sources = [src, fallbackSrc, resolvedFallback].filter(Boolean);
  const displaySrc = sources.find((source) => !failedSources.includes(source));

  useEffect(() => {
    setFailedSources([]);
    setResolvedFallback("");
    setResolverAttempted(false);
    if (!src && resolverRef.current) {
      setResolverAttempted(true);
      Promise.resolve()
        .then(() => resolverRef.current?.())
        .then((url) => { if (url) setResolvedFallback(url); })
        .catch(() => {});
    }
  }, [src]);

  if (!displaySrc || failedSources.includes(displaySrc)) return fallback ?? null;

  const handleError = () => {
    const nextFailedSources = [...new Set([...failedSources, displaySrc])];
    setFailedSources(nextFailedSources);
    if (
      sources.every((source) => nextFailedSources.includes(source))
      && !resolverAttempted
      && resolverRef.current
    ) {
      setResolverAttempted(true);
      Promise.resolve()
        .then(() => resolverRef.current?.())
        .then((url) => { if (url) setResolvedFallback(url); })
        .catch(() => {});
    }
  };

  return (
    <img
      {...imageProps}
      src={displaySrc}
      alt={alt}
      className={className}
      referrerPolicy={referrerPolicy}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  );
}