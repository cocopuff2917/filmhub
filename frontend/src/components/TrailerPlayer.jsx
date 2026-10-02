import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { parseYouTubeId } from "@/components/VideosSection";

/**
 * Opens an in-site YouTube iframe player instead of redirecting to youtube.com.
 * Props:
 *  - url: YouTube URL
 *  - title: optional for aria-label
 *  - children: trigger element (expected to accept onClick)
 */
export default function TrailerPlayer({ url, title = "Trailer", children, testId = "trailer-player" }) {
  const [open, setOpen] = useState(false);
  const vid = parseYouTubeId(url);

  const handleTrigger = (e) => {
    if (!vid) return; // fall through to default link behavior if we can't parse
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  // Clone the single child element and inject onClick + role
  const trigger = (
    <span onClick={handleTrigger} role="button" data-testid={`${testId}-trigger`} className="contents">
      {children}
    </span>
  );

  if (!vid) return <>{children}</>;

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="bg-[#0b0d10] border-white/10 text-white max-w-4xl w-[92vw] p-0 overflow-hidden"
          data-testid={`${testId}-dialog`}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="aspect-video w-full bg-black">
            {open && (
              <iframe
                key={vid}
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                data-testid={`${testId}-iframe`}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
