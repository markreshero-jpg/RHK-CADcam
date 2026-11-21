import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TutorialHost from "@/src/components/tutorial/TutorialHost";
import PresenceTracker from "@/src/components/PresenceTracker";
import ServiceWorkerSetup from "@/src/components/ServiceWorkerSetup";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RHK CADcam",
  description: "RHK cabinet CAD/CAM",
  // Home-screen icon on iPhone opens as its own app, starting at the main menu (app/manifest.ts).
  appleWebApp: { capable: true, title: "RHK CADcam", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.classList.add(t==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {/* Home-screen app: a fresh launch always starts on the main menu. An icon added
            from a job page (or before app/manifest.ts existed) keeps that job's address,
            so the phone reopened the same old job after the app was quit. First page of a
            new session + opened from the home screen + not arrived from a link = a launch.
            Skipped with no signal (the offline pages take over) and on login / share pages. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=sessionStorage;if(s.getItem('rhk.launched'))return;s.setItem('rhk.launched','1');var app=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;var p=location.pathname;if(app&&!document.referrer&&navigator.onLine!==false&&p!=='/'&&!/^\\/(login|offline|share)/.test(p))location.replace('/');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}<TutorialHost /><PresenceTracker /><ServiceWorkerSetup /></body>
    </html>
  );
}
