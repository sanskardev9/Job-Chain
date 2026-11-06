import "./globals.css";
import LayoutShell from "../components/LayoutShell";

export const metadata = {
  title: "Job-Chain · Your next job, anywhere in Europe",
  description:
    "Fresh vacancies from every corner of Europe, checked against your skills, languages and visa needs. JobPilot writes the application email; you approve and send it.",
  applicationName: "Job-Chain",
  // Home Screen title on iPhone (the icon comes from src/app/apple-icon.png).
  appleWebApp: { capable: true, title: "Job-Chain", statusBarStyle: "default" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
