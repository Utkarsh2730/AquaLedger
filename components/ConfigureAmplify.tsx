"use client";

import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";

// Demo mode never talks to AWS (and may run with a placeholder outputs file).
if (process.env.NEXT_PUBLIC_DEMO_MODE !== "1") Amplify.configure(outputs);

export default function ConfigureAmplify() {
  return null;
}
