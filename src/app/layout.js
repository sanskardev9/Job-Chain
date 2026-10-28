import "./globals.css";
import LayoutShell from "../components/LayoutShell";

export const metadata = {
  title: "Job-Chain · Your next job, anywhere in Europe",
  description:
    "Fresh vacancies from every corner of Europe, checked against your skills, languages and visa needs. JobPilot writes the application email; you approve and send it.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
