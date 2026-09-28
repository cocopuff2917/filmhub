import { useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

export default function ImageUpload({ value, onChange, testid, shape = "square" }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(r.data.path);
      toast.success("Uploaded");
    } catch {
      toast.error("Upload failed");
    }
    setBusy(false);
    e.target.value = "";
  };

  const roundedCls = shape === "circle" ? "rounded-full" : "rounded-lg";
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className={`relative w-16 h-16 overflow-hidden bg-[#1e2430] border border-white/10 ${roundedCls}`}>
          <img src={fileUrl(value)} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className={`w-16 h-16 bg-[#1e2430] border border-white/10 flex items-center justify-center text-slate-600 ${roundedCls}`}>
          <Upload className="w-5 h-5" />
        </div>
      )}
      <input type="file" accept="image/*" ref={ref} onChange={handle} className="hidden" />
      <Button type="button" variant="outline" onClick={() => ref.current.click()} disabled={busy}
        className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={testid}>
        {busy ? "Uploading..." : value ? "Replace" : "Upload"}
      </Button>
      {value && (
        <Button type="button" variant="ghost" onClick={() => onChange("")} className="text-slate-400 hover:text-white hover:bg-white/5">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export function GalleryUpload({ value, onChange, testid }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const list = value || [];

  const add = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    const paths = [];
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        paths.push(r.data.path);
      } catch { toast.error(`Upload failed for ${f.name}`); }
    }
    onChange([...list, ...paths]);
    setBusy(false);
    e.target.value = "";
  };

  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));

  return (
    <div>
      <input type="file" accept="image/*" multiple ref={ref} onChange={add} className="hidden" />
      <div className="flex flex-wrap gap-2">
        {list.map((p, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-[#1e2430] border border-white/10 group">
            <img src={fileUrl(p)} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => remove(i)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => ref.current.click()} disabled={busy}
          className="w-20 h-20 rounded-lg border-2 border-dashed border-white/15 flex items-center justify-center text-slate-500 hover:border-amber-500/40 hover:text-amber-400 transition"
          data-testid={testid}>
          {busy ? "..." : <Upload className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
