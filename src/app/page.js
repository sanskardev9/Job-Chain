"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [jobSearch, setJobSearch] = useState("");

  const handleSearch = () => {
    console.log(`Searching for ${jobSearch}`);
  };

  return (
    <div className="h-[82.5vh] bg-zinc-950 text-white flex flex-col items-center  px-6 py-20">
      {/* Main Content */}
      <main className="text-center w-full max-w-3xl">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Image
            className="animate-bounce"
            src="/chain.png"
            alt="Job-Chain logo"
            width={70}
            height={38}
            priority
          />
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight transition duration-300 hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)]">
            Welcome to Job-Chain!
          </h2>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold mt-6 sm:mt-25 text-zinc-200">
          Find Your Dream Job With the Power of Blockchain
        </h2>

        {/* Job Search */}
        <div className="flex justify-center items-center">
          <div className="relative w-full max-w-md mt-5 mx-auto">
            <p className="text-md text-zinc-400 italic mb-2 sm:text-lg">
              {/* Apply, Prove and Track it — On-Chain. */}“ Search. Apply.
              Prove it — All On-Chain.”
            </p>

            <Link
              className="block ml-4 w-8/9 sm:ml-23.5 sm:w-3/5 mt-5 bg-white text-black font-semibold py-3 rounded-xl shadow-md focus:outline-none hover:scale-105  hover:bg-purple-600 hover:text-white transition duration-200"
              href={"/jobs"}
            >
              Let The Hunt Begin
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

{
  /* <div>
            <Search
              className="absolute left-3 top-15.5 transform -translate-y-1/2 text-zinc-500 "
              size={20}
            />
            <input
              type="text"
              placeholder="Search for Jobs"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              className="w-full p-3 pr-20 pl-10 text-lg bg-zinc-900 border border-zinc-700 rounded-xl placeholder-zinc-500 text-white shadow focus:outline-none focus:ring-2 focus:ring-purple-600 focus:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] duration-200"
            />
          </div> */
}
