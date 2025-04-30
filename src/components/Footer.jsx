import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto w-full py-6 bg-zinc-950 text-zinc-400 border-t border-zinc-800">
      <div className="text-center">
        <p className="text-sm font-medium">&copy; 2025 JobChain. All Rights Reserved.</p>
        <div className="flex justify-center space-x-6 mt-3 text-sm">
          <Link
            href="https://twitter.com"
            className="font-bold"
          >
            Twitter
          </Link>
          <Link
            href="https://linkedin.com"
            className="font-bold"
          >
            LinkedIn
          </Link>
        </div>
      </div>
    </footer>
  );
}
