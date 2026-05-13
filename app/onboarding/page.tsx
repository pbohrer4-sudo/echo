// /onboarding root — leitet zum jeweils ersten noch offenen Schritt.

import { redirect } from "next/navigation";
import {
  getOnboardingProgress,
  isComplete,
  nextStep,
} from "@/lib/onboarding";

export default async function OnboardingIndex() {
  const progress = await getOnboardingProgress();
  if (isComplete(progress)) redirect("/heute");
  const step = nextStep(progress);
  redirect(`/onboarding/${step}`);
}
