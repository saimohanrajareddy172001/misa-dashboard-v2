import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { RestaurantProvider } from "@/lib/restaurant";
import Shell from "@/components/Shell";

export const metadata = { title: "Invoice Dashboard" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <RestaurantProvider>
            <Shell>{children}</Shell>
          </RestaurantProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
