import "./globals.css";

export const metadata = {
  title: "Laxey Super 6",
  description: "Friends-only football prediction league",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
