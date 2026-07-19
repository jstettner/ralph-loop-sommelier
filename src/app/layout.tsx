import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wine Trainer",
  description: "A conversational sommelier tutor for every palate at the table.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <div className="scanlines" aria-hidden="true" data-testid="scanlines" />
      </body>
    </html>
  );
}
