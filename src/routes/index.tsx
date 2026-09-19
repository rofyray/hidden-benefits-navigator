import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hidden Benefits Navigator — Texas benefits screening" },
      {
        name: "description",
        content:
          "Describe your situation and get a preliminary, source-backed screening for SNAP, EITC, CEAP, Medicare cost help, WIC and Lifeline in Texas.",
      },
      { property: "og:title", content: "Hidden Benefits Navigator — Texas benefits screening" },
      {
        property: "og:description",
        content:
          "A preliminary, source-backed look at six Texas assistance programs. Each program makes the final decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PROGRAMS = [
  { name: "SNAP", detail: "Help buying food" },
  { name: "Earned Income Tax Credit", detail: "A refund on your taxes" },
  { name: "CEAP", detail: "Help with energy bills" },
  { name: "Medicare cost help", detail: "Help with Medicare premiums and drug costs" },
  { name: "WIC", detail: "Food and nutrition help for young families" },
  { name: "Lifeline", detail: "A discount on phone or internet service" },
];

function Index() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Hidden Benefits Navigator</h1>
      <p className="text-muted-foreground mt-3 text-lg">
        Describe your situation in your own words and see which Texas assistance programs may be
        worth applying for.
      </p>

      <section aria-labelledby="programs-heading" className="mt-10">
        <h2 id="programs-heading" className="text-xl font-semibold">
          Programs we check
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROGRAMS.map((program) => (
            <li key={program.name} className="border-border rounded-lg border p-4">
              <p className="font-medium">{program.name}</p>
              <p className="text-muted-foreground text-sm">{program.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="status-heading" className="mt-10">
        <h2 id="status-heading" className="text-xl font-semibold">
          What works right now
        </h2>
        <p className="text-muted-foreground mt-3">
          This is the starting shell. Intake, screening and results are still being built, so no
          program results are available yet.
        </p>
        <p className="text-muted-foreground mt-3">
          Results here will always be preliminary. Each program makes the final decision.
        </p>
      </section>
    </main>
  );
}
