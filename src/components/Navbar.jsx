import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="w-full flex items-center justify-between bg-zinc-950 p-4 shadow-md border-b border-zinc-800 text-white">
      <div className="flex items-center gap-3">
        <Image
          src="/chain.png"
          alt="JobChain logo"
          width={34}
          height={38}
          priority
        />
        <h1 className="text-1xl sm:text-2xl font-extrabold hover:text-purple-600 transition-colors tracking-wide hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] duration-300">
          <Link href="/">Job-Chain</Link>
        </h1>
      </div>

      <nav>
        <ul className="flex space-x-6 text-sm sm:text-lg font-semibold tracking-wide">
          <li>
            <Link
              href="/"
              className=" hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              href="/jobs"
              className="hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Jobs
            </Link>
          </li>
          <li>
            <Link
              href="/about"
              className="hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              About
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
