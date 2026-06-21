import { redirect } from "next/navigation";

// The hub lives under /teams; the middleware handles the auth gate.
export default function Home() {
  redirect("/teams");
}
