import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ImageUrlInput({ onAdd, disabled = false, testid, placeholder = "https://example.com/image.jpg" }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    let normalizedUrl;
    try {
      const parsed = new URL(url.trim());
      if (!(["http:", "https:"].includes(parsed.protocol))) throw new Error("Invalid protocol");
      normalizedUrl = parsed.href;
    } catch {
      toast.error("Enter a valid HTTP or HTTPS image URL");
      return;
    }

    setBusy(true);
    try {
      await onAdd(normalizedUrl);
      setUrl("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not add image URL");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={placeholder}
        aria-label="Image URL"
        disabled={disabled || busy}
        className="h-8 min-w-0 bg-[#0d0f12] border-white/10 text-white text-xs"
        data-testid={testid ? `${testid}-url-input` : undefined}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || busy || !url.trim()}
        className="h-8 flex-shrink-0 border-white/20 text-white hover:bg-white/10 hover:text-white"
        data-testid={testid ? `${testid}-url-add` : undefined}
      >
        <Link2 className="mr-1 h-3.5 w-3.5" /> Add URL
      </Button>
    </form>
  );
}