// Installed-app details (Add to Home Screen / Install app): name and PNG icons, so phones show
// the Job-Chain logo instead of a letter.
export default function manifest() {
  return {
    name: "Job-Chain",
    short_name: "Job-Chain",
    description: "Fresh vacancies from every corner of Europe, checked against your skills, languages and visa needs.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
