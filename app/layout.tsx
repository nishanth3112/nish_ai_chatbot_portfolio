import type { ReactNode } from "react";

type RootLayoutProps = {
  children: ReactNode;
};

export const metadata = {
  title: "NishAI Backend",
  description: "Backend service for the NishAI portfolio chatbot.",
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
