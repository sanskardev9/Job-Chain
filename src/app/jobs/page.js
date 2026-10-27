import { redirect } from "next/navigation";

// The Remotive job list was removed; matching jobs now come from JobPilot.
export default function JobsRedirect() {
  redirect("/jobpilot?tab=jobs");
}
