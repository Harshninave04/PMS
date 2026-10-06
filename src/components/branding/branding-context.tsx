"use client";

import React, { createContext, useContext } from "react";
import { DEFAULT_SOFTWARE_BRANDING, type SoftwareBranding } from "@/lib/software-branding";

const BrandingContext = createContext<SoftwareBranding>(DEFAULT_SOFTWARE_BRANDING);

/**
 * Supplies the software metadata the server resolved for this request to the
 * client chrome (sidebar, header), so the product name and logo are correct on
 * first paint with no client fetch and no flash of the default brand.
 */
export function BrandingProvider({
  branding,
  children,
}: {
  branding: SoftwareBranding;
  children: React.ReactNode;
}) {
  return (
    <BrandingContext.Provider value={{ ...DEFAULT_SOFTWARE_BRANDING, ...branding }}>
      {children}
    </BrandingContext.Provider>
  );
}

/** The software metadata for the current request; defaults outside a provider. */
export function useBranding(): SoftwareBranding {
  return useContext(BrandingContext);
}

export default BrandingProvider;
