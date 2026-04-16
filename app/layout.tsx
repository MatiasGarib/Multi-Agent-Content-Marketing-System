import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GitHub Content Marketing Pipeline",
  description: "Multi-agent daily content pipeline powered by Claude",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0f172a" }}>{children}</body>
    </html>
  );
}
