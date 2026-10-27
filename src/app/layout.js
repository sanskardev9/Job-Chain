import "./globals.css";
import LayoutShell from "../components/LayoutShell";

export const metadata = {
  title: "Job-Chain",
  description: "Find remote jobs, track your applications, and let JobPilot draft and send applications you approve.",
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
