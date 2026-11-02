import { RunButton } from "../../run-button";
import { PageHeader } from "../../page-header";
import { GeoQuestions } from "./views";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default function AiSearchPage() {
  return (
    <main className="page">
      <PageHeader
        eyebrow="Trends · AI search · Japan"
        title="What buyers ask AI"
        description="The questions Japanese buyers ask ChatGPT, Gemini, Copilot and Perplexity about your services, grouped by topic cluster: who AI cites, whether we are cited, and how ready our page is."
        actions={<RunButton job="geo" label="Rebuild this week's check" force />}
      />
      <GeoQuestions />
    </main>
  );
}
