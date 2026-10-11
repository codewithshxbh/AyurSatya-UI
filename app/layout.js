import "./globals.css";

export const metadata = {
  title: "AyurSatya | Medicinal crop intelligence",
  description: "A calm workspace for understanding medicinal crop health.",
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon.ico?v=2", type: "image/svg+xml" }
    ],
    shortcut: "/favicon.svg?v=2"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="review-theme">{children}</body>
    </html>
  );
}
