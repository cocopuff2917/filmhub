import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ImageUpload, { GalleryUpload } from "@/components/ImageUpload";

export default function ActorForm({ actor, onSaved, onCancel }) {
  const empty = { name: "", bio: "", photo_url: "", birth_date: "", death_date: "", place_of_birth: "", place_of_death: "", gallery: [] };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (actor) {
      setForm({
        name: actor.name || "",
        bio: actor.bio || "",
        photo_url: actor.photo_url || "",
        birth_date: actor.birth_date || "",
        death_date: actor.death_date || "",
        place_of_birth: actor.place_of_birth || "",
        place_of_death: actor.place_of_death || "",
        gallery: actor.gallery || [],
      });
    } else {
      setForm(empty);
    }
    // eslint-disable-next-line
  }, [actor]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      let result;
      if (actor?.id) {
        result = (await api.patch(`/actors/${actor.id}`, form)).data;
        toast.success("Actor updated");
      } else {
        result = (await api.post("/actors", form)).data;
        toast.success("Actor created");
      }
      onSaved && onSaved(result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label className="text-slate-300">Full name</Label>
        <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-name-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300">Birth date</Label>
          <Input type="date" value={form.birth_date || ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-birthdate-input" />
        </div>
        <div>
          <Label className="text-slate-300">Death date (if deceased)</Label>
          <Input type="date" value={form.death_date || ""} onChange={(e) => setForm({ ...form, death_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-deathdate-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300">Place of birth</Label>
          <Input value={form.place_of_birth} onChange={(e) => setForm({ ...form, place_of_birth: e.target.value })} placeholder="City, Country" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-pob-input" />
        </div>
        <div>
          <Label className="text-slate-300">Place of death</Label>
          <Input value={form.place_of_death} onChange={(e) => setForm({ ...form, place_of_death: e.target.value })} placeholder="City, Country" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-pod-input" />
        </div>
      </div>
      <div>
        <Label className="text-slate-300">Bio</Label>
        <Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-bio-input" />
      </div>
      <div>
        <Label className="text-slate-300 block mb-2">Headshot</Label>
        <ImageUpload value={form.photo_url} onChange={(v) => setForm({ ...form, photo_url: v })} testid="actor-photo-upload" />
      </div>
      <div>
        <Label className="text-slate-300 block mb-2">Gallery ({(form.gallery || []).length} images)</Label>
        <GalleryUpload value={form.gallery} onChange={(v) => setForm({ ...form, gallery: v })} testid="actor-gallery-upload" />
      </div>
      <div className="flex gap-2 pt-4 border-t border-white/10">
        <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="actor-submit-btn">
          {actor ? "Update Actor" : "Create Actor"}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>}
      </div>
    </form>
  );
}
