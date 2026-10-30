import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { getHospitalProfile } from "@/services/hospital-profile.service";
import { HospitalProfileProvider } from "@/components/hospital-profile/hospital-profile-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const hospital = await getHospitalProfile();

  return {
    title: { default: hospital.name || "", template: hospital.name ? `%s | ${hospital.name}` : "%s" },
    description: hospital.name || "",
    ...(hospital.logo ? { icons: { icon: hospital.logo, apple: hospital.logo } } : { icons: {} }),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const hospitalProfile = await getHospitalProfile();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <HospitalProfileProvider initialProfile={hospitalProfile}>
          <Providers>{children}</Providers>
        </HospitalProfileProvider>
      </body>
    </html>
  );
}
