"use client";

import React from "react";
import {
  DEFAULT_HOSPITAL_TIME_ZONE,
  HOSPITAL_PROFILE_UPDATED_EVENT,
  type HospitalProfile,
} from "@/types/hospital-profile";

const HospitalProfileContext = React.createContext<HospitalProfile>({ timeZone: DEFAULT_HOSPITAL_TIME_ZONE });

export function HospitalProfileProvider({
  initialProfile,
  children,
}: {
  initialProfile: HospitalProfile;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = React.useState(initialProfile);

  React.useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<HospitalProfile>).detail;
      if (detail) setProfile(detail);
    };
    window.addEventListener(HOSPITAL_PROFILE_UPDATED_EVENT, update);
    return () => window.removeEventListener(HOSPITAL_PROFILE_UPDATED_EVENT, update);
  }, []);

  return <HospitalProfileContext.Provider value={profile}>{children}</HospitalProfileContext.Provider>;
}

export function useHospitalProfile(): HospitalProfile {
  return React.useContext(HospitalProfileContext);
}

export function publishHospitalProfile(profile: HospitalProfile) {
  window.dispatchEvent(new CustomEvent(HOSPITAL_PROFILE_UPDATED_EVENT, { detail: profile }));
}
