"use client";

import { memo, useEffect, useState } from "react";
import { Bookmark } from "lucide-react";

const STATUS_STYLES = {
  applied: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  interview: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  offer: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  rejected: "bg-red-500/20 text-red-300 border-red-500/40",
};

function JobCardBase({
  job,
  tracked,
  isSaved,
  isSaving,
  isLast,
  lastJobRef,
  onToggleSave,
  onApply,
}) {
  const date = new Date(job.publication_date);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const status = tracked?.status;
  const currentStatus = status || "applied";
  const [pulseBookmark, setPulseBookmark] = useState(false);

  useEffect(() => {
    if (!pulseBookmark) return;
    const timer = setTimeout(() => setPulseBookmark(false), 260);
    return () => clearTimeout(timer);
  }, [pulseBookmark]);

  return (
    <div
      ref={isLast ? lastJobRef : null}
      className="relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300"
    >
      <button
        type="button"
        disabled={isSaving}
        onClick={() => {
          setPulseBookmark(true);
          onToggleSave(job);
        }}
        aria-label={isSaved ? "Remove bookmark" : "Bookmark job"}
        className={`absolute top-0 right-0 transition disabled:opacity-50 cursor-pointer ${
          isSaved ? "text-purple-500" : "text-zinc-400 hover:text-purple-400"
        } ${pulseBookmark ? "scale-125 -rotate-6" : "scale-100 rotate-0"}`}
      >
        <Bookmark
          size={30}
          className={`transition-all duration-200 ${isSaved ? "fill-current drop-shadow-[0_0_10px_rgba(168,85,247,0.7)]" : ""}`}
        />
      </button>

      <div className="flex items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{job.title}</h2>
          <p className="text-zinc-300 font-medium">{job.company_name}</p>
        </div>
      </div>

      <p className="text-zinc-500 italic mb-2">{job.candidate_required_location}</p>
      <p className="text-zinc-200">Posted on {formattedDate}</p>

      <div className="mt-auto text-zinc-400 text-sm">
        <div className="flex justify-between items-end gap-4">
          <button
            type="button"
            onClick={() => onApply(job)}
            disabled={isSaving || !!tracked?.applied_at}
            className={`inline-block mt-5 font-semibold px-4 py-2 rounded-lg shadow-md cursor-pointer disabled:opacity-50 border ${
              tracked?.applied_at
                ? STATUS_STYLES[currentStatus]
                : "bg-zinc-800 text-white border-zinc-700 hover:bg-purple-600 hover:text-white hover:border-purple-500"
            }`}
          >
            {tracked?.applied_at
              ? `${currentStatus.charAt(0).toUpperCase()}${currentStatus.slice(1)}`
              : "Apply"}
          </button>
          <div className="mt-10 text-right text-zinc-500 text-[11px] sm:text-sm">
            Sourced from{" "}
            <a
              href="https://remotive.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-purple-400 hover:underline font-extrabold hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300"
            >
              Remotive
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const JobCard = memo(JobCardBase);

export default JobCard;
