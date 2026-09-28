import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MovieForm from "@/components/forms/MovieForm";
import ActorForm from "@/components/forms/ActorForm";
import SeriesForm from "@/components/forms/SeriesForm";

export default function EntityEditDialog({ open, onOpenChange, entityType, entity, onSaved }) {
  const handleSaved = (r) => {
    onOpenChange(false);
    onSaved && onSaved(r);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wider">
            {entity ? `Edit ${entityType}` : `New ${entityType}`}
          </DialogTitle>
        </DialogHeader>
        {entityType === "movie" && <MovieForm movie={entity} onSaved={handleSaved} onCancel={() => onOpenChange(false)} />}
        {entityType === "actor" && <ActorForm actor={entity} onSaved={handleSaved} onCancel={() => onOpenChange(false)} />}
        {entityType === "series" && <SeriesForm series={entity} onSaved={handleSaved} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
