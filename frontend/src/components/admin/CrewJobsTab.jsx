import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_JOBS = ["Director", "Writer", "Producer", "Cinematographer", "Composer", "Editor", "Makeup Artist"];

export default function CrewJobsTab() {
  const [jobs, setJobs] = useState([]);
  const [newJob, setNewJob] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/crew-jobs")
      .then((response) => setJobs(response.data?.length ? response.data : DEFAULT_JOBS))
      .catch(() => setJobs(DEFAULT_JOBS));
  }, []);

  const addJob = (event) => {
    event.preventDefault();
    const job = newJob.trim();
    if (!job) return;
    if (jobs.some((existing) => existing.toLowerCase() === job.toLowerCase())) {
      toast.error("That crew job already exists");
      return;
    }
    if (job.length > 80) {
      toast.error("Crew job names must be 80 characters or fewer");
      return;
    }
    setJobs((current) => [...current, job]);
    setNewJob("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.put("/crew-jobs", { jobs });
      setJobs(response.data);
      toast.success("Crew jobs saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save crew jobs");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-5" data-testid="crew-jobs-tab">
      <header>
        <h2 className="font-heading text-xl font-bold text-white">Crew jobs</h2>
      </header>
      <form onSubmit={addJob} className="flex gap-2">
        <Input
          value={newJob}
          onChange={(event) => setNewJob(event.target.value)}
          maxLength={80}
          placeholder="New crew job"
          className="border-white/10 bg-[#0d0f12] text-white"
          data-testid="crew-job-input"
        />
        <Button type="submit" disabled={!newJob.trim()} className="bg-amber-500 font-semibold text-black hover:bg-amber-600" data-testid="crew-job-add-btn">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </form>
      <ul className="divide-y divide-white/10 border-y border-white/10">
        {jobs.map((job) => (
          <li key={job} className="flex items-center gap-3 py-2.5" data-testid={`crew-job-${job.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <span className="flex-1 text-sm text-slate-200">{job}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title={`Remove ${job}`}
              aria-label={`Remove ${job}`}
              disabled={jobs.length === 1}
              onClick={() => setJobs((current) => current.filter((item) => item !== job))}
              className="text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
              data-testid={`crew-job-remove-${job.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" onClick={save} disabled={saving || jobs.length === 0} className="bg-emerald-500 font-semibold text-black hover:bg-emerald-600" data-testid="crew-jobs-save-btn">
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </section>
  );
}