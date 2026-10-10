import "./globals.css";

export const metadata = {
  title: "AyurSatya | Medicinal crop intelligence",
  description: "A calm workspace for understanding medicinal crop health."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
