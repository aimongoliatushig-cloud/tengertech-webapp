import type { Metadata } from "next";
import { Exo_2, IBM_Plex_Mono, IBM_Plex_Sans, Inter } from "next/font/google";

import { AppBadgeManager } from "@/app/_components/app-badge-manager";
import { GlobalLoadingProvider } from "@/app/_components/global-loading";
import { NotificationPermissionButton } from "@/app/_components/notification-permission-button";
import { UiContextPreserver } from "@/app/_components/ui-context-preserver";

import "./globals.css";

const display = Exo_2({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
});

const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

const EXTENSION_ATTRIBUTE_CLEANUP_SCRIPT = `
(() => {
  const attribute = "bis_skin_checked";
  const strip = (root) => {
    if (!root || !("nodeType" in root)) return;
    if (root.nodeType === Node.ELEMENT_NODE && root.hasAttribute?.(attribute)) {
      root.removeAttribute(attribute);
    }
    if ("querySelectorAll" in root) {
      root.querySelectorAll?.(\`[\${attribute}]\`).forEach((element) => element.removeAttribute(attribute));
    }
  };
  strip(document);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") {
        strip(mutation.target);
      }
      mutation.addedNodes.forEach(strip);
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [attribute],
    childList: true,
    subtree: true,
  });
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      strip(document);
      observer.disconnect();
    }, 3000);
  });
})();
`;

export const metadata: Metadata = {
  title: "Хот тохижилтын удирдлагын төв",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="mn"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} ${inter.variable}`}
    >
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_ATTRIBUTE_CLEANUP_SCRIPT }} />
        <AppBadgeManager />
        <NotificationPermissionButton />
        <UiContextPreserver />
        <GlobalLoadingProvider>{children}</GlobalLoadingProvider>
      </body>
    </html>
  );
}
