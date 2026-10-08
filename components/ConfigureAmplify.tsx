"use client";

import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import { BACKEND_READY, DEMO } from "@/lib/client";

// Demo mode never talks to AWS; without a deployed backend there is nothing to configure.
if (!DEMO && BACKEND_READY) Amplify.configure(outputs);

export default function ConfigureAmplify() {
  return null;
}
