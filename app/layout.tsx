import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multi-Agent Content Marketing System",
  description: "Daily GitHub content pipeline powered by Claude",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 800, margin: "0 auto" }}>
        {children}
      </body>
    </html>
  );
}
