import { useEffect } from "react";

const DEFAULT_TITLE = "Filmhub | Movies, TV Series, and Cast";
const DEFAULT_DESCRIPTION = "Discover movies and TV series, explore cast and crew, and build your watchlist on Filmhub.";

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export default function PageMetadata({ title, description, image, schemaType = "WebPage", datePublished, genres = [] }) {
  useEffect(() => {
    const pageTitle = `${title} | Filmhub`;
    const pageDescription = (description || DEFAULT_DESCRIPTION).replace(/\s+/g, " ").trim().slice(0, 160);
    const pageUrl = `${window.location.origin}${window.location.pathname}`;
    const imageUrl = image ? new URL(image, window.location.origin).href : "";

    document.title = pageTitle;
    setMeta("name", "description", pageDescription);
    setMeta("property", "og:title", pageTitle);
    setMeta("property", "og:description", pageDescription);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", pageUrl);
    setMeta("property", "og:image", imageUrl);
    setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", pageTitle);
    setMeta("name", "twitter:description", pageDescription);
    setMeta("name", "twitter:image", imageUrl);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = pageUrl;

    const schema = {
      "@context": "https://schema.org",
      "@type": schemaType,
      name: title,
      description: pageDescription,
      url: pageUrl,
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(datePublished ? { datePublished } : {}),
      ...(genres.length ? { genre: genres } : {}),
    };
    let structuredData = document.getElementById("page-structured-data");
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.id = "page-structured-data";
      structuredData.type = "application/ld+json";
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify(schema);

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta("name", "description", DEFAULT_DESCRIPTION);
      ["og:title", "og:description", "og:type", "og:url", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image"].forEach((key) => {
        setMeta(key.startsWith("og:") ? "property" : "name", key, null);
      });
      canonical?.remove();
      structuredData?.remove();
    };
  }, [title, description, image, schemaType, datePublished, genres]);

  return null;
}