"use client";

import { useEffect, useState } from "react";
import { useRef, useCallback } from "react";
import axios from "../../lib/axios";

export default function JobsPage() {
  //States
  const [jobs, setJobs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleJobs, setVisibleJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  //Ref
  const observer = useRef();

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          "https://remotive.com/api/remote-jobs"
        );
        console.log(response);

        setJobs((prevJobs) => [...prevJobs, ...response.data.jobs]);
        setVisibleJobs((prevJobs) =>
          [...prevJobs, ...response.data.jobs].slice(0, 102)
        );
      } catch (error) {
        console.error("error fetching jobs", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  const loadMore = () => {
    const next = jobs.slice(visibleJobs.length, visibleJobs.length + 102);
    setVisibleJobs([...visibleJobs, ...next]);
  };

  const lastJobRef = useCallback(
    (node) => {
      if (loading) return; // don’t trigger if already loading

      if (observer.current) observer.current.disconnect(); // clear old observer

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          loadMore(); // trigger loading more jobs
        }
      });

      if (node) observer.current.observe(node); // attach observer to new last node
    },
    [loading, loadMore]
  );

  return (
    <div className="h-[82.5vh] overflow-auto bg-zinc-950 px-6 text-white">
      <div className="flex flex-col items-center justify-center w-content">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 sm:mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Job Listing
        </h1>
      </div>
      <div className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-lg py-6">
        <div className="max-w-xl mx-auto mb-0 sm:mb-2 ">
          <input
            type="text"
            placeholder="Search for title, company, location"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 text-sm sm:text-lg bg-zinc-900 border border-zinc-700 rounded-xl placeholder-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-purple-600 focus:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] duration-200"
          />
        </div>
      </div>

      <div>
        <div className="grid grid-cols-1 sm:cols-2 lg:grid-cols-3 gap-8 mt-6">
          {visibleJobs
            .filter(
              (jobs) =>
                jobs.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                jobs.company_name
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()) ||
                jobs.candidate_required_location
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase())
            )
            .map((job, index) => {
              const date = new Date(job.publication_date);
              const formattedDate = date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              const isLastJob = index === visibleJobs.length - 1;
              return (
                <div
                  key={job.id}
                  ref={isLastJob ? lastJobRef : null}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        {job.title}
                      </h2>
                      <p className="text-zinc-300 font-medium">
                        {job.company_name}
                      </p>
                    </div>
                  </div>
                  <p className="text-zinc-500 italic mb-2">
                    {job.candidate_required_location}
                  </p>
                  <p className="text-zinc-200">Posted on {formattedDate}</p>
                  <div className="mt-3 text-zinc-400 text-sm max-h-40 overflow-auto">
                    {" "}
                    {/* dangerouslySetInnerHTML={{_html: job.decription}} */}
                    <div className="flex justify-between">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener referrer"
                        className="inline-block mt-5 bg-white text-black hover:bg-purple-600 hover:text-white transition-colors duration-300 font-semibold px-5 py-2 rounded-lg shadow-md"
                      >
                        Apply Now
                      </a>
                      <div className="mt-10 text-right text-zinc-500 text-[11px] sm:text-sm">
                        Sourced from{" "}
                        <a
                          href="https://remotive.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-purple-400  hover:underline font-extrabold hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300"
                        >
                          Remotive
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        <div className="dummy-div"></div>
      </div>
    </div>
  );
}
