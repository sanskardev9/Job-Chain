import { redirect } from "next/navigation";

// Drafts now live inside the JobPilot tab.
export default function DraftsRedirect() {
  redirect("/jobpilot?tab=drafts");
}
