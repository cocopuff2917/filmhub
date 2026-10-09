import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AvailabilityEditor({ value = [], onChange, disabled = false }) {
  const update = (index, key, nextValue) => onChange(value.map((entry, row) => row === index ? { ...entry, [key]: nextValue } : entry));
  const add = () => onChange([...value, { provider: "", url: "", availability_type: "stream" }]);
  const remove = (index) => onChange(value.filter((_, row) => row !== index));

  return (
    <div className="space-y-3" data-testid="availability-editor">
      <div className="text-sm text-slate-400">Add official links to stream, rent, or buy this title.</div>
      {value.map((entry, index) => (
        <div key={`${entry.provider}-${entry.url}-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,0.7fr)_120px_minmax(0,1.2fr)_auto] sm:items-center" data-testid={`availability-row-${index}`}>
          <Input
            value={entry.provider || ""}
            onChange={(event) => update(index, "provider", event.target.value)}
            maxLength={80}
            disabled={disabled}
            placeholder="Service, e.g. Netflix"
            aria-label={`Availability provider ${index + 1}`}
            className="bg-white border-slate-300 text-slate-900"
            data-testid={`availability-provider-${index}`}
          />
          <div>
            <Label htmlFor={`availability-type-${index}`} className="sr-only">Availability type</Label>
            <select
              id={`availability-type-${index}`}
              value={entry.availability_type || "buy"}
              onChange={(event) => update(index, "availability_type", event.target.value)}
              disabled={disabled}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
              data-testid={`availability-type-${index}`}
            >
              <option value="stream">Stream</option>
              <option value="rent">Rent</option>
              <option value="buy">Buy</option>
            </select>
          </div>
          <Input
            type="url"
            value={entry.url || ""}
            onChange={(event) => update(index, "url", event.target.value)}
            maxLength={2048}
            disabled={disabled}
            placeholder="https://…"
            aria-label={`${entry.provider || "Provider"} availability URL`}
            className="bg-white border-slate-300 text-slate-900"
            data-testid={`availability-url-${index}`}
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => remove(index)} disabled={disabled} aria-label={`Remove ${entry.provider || "availability link"}`} className="text-slate-500 hover:text-rose-500" data-testid={`availability-remove-${index}`}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add} disabled={disabled || value.length >= 20} className="border-slate-300 text-slate-700 hover:bg-slate-100 h-8" data-testid="availability-add-btn">
        <Plus className="mr-1 h-4 w-4" /> Add service
      </Button>
    </div>
  );
}
