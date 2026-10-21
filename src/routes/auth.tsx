import { createFileRoute } from "@tanstack/react-router";
import SignIn from "@/pages/SignIn";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In & Registration | Connect Pro Fleet OS" },
      {
        name: "description",
        content:
          "Sign in to your Connect Pro Fleet OS account or register a new fleet organization.",
      },
      {
        property: "og:title",
        content: "Sign In & Registration | Connect Pro Fleet OS",
      },
      {
        property: "og:description",
        content:
          "Sign in to your Connect Pro Fleet OS account or register a new fleet organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});
