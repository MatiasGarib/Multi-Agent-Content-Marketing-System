export default function Home() {
  return (
    <main>
      <h1>Multi-Agent Content Marketing System</h1>
      <p>A daily GitHub content pipeline powered by Claude claude-sonnet-4-5.</p>

      <h2>API Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/cron/daily</code> — trigger the full pipeline
          (requires <code>x-cron-secret</code> header)
        </li>
        <li>
          <code>GET /api/runs</code> — list last 10 pipeline runs
        </li>
      </ul>

      <h2>Agent Architecture</h2>
      <h3>Research layer (sequential with data dependencies)</h3>
      <ol>
        <li>KeywordResearcherAgent — seed → keyword variations</li>
        <li>TopicPrioritizerAgent — keywords → top 3 topics</li>
        <li>BrandCheckerAgent — topics → brand validation</li>
      </ol>

      <h3>Generation layer (sequential)</h3>
      <ol>
        <li>ContentGeneratorAgent — approved topics → full drafts</li>
        <li>CriticReviewerAgent — drafts → scored reviews (max 2 revision cycles)</li>
        <li>EditorAgent — passed drafts → polished final content</li>
        <li>
          ChannelAdapterAgent — final content → blog / Twitter / LinkedIn /
          newsletter (Twitter, LinkedIn, newsletter adapted in parallel)
        </li>
      </ol>
    </main>
  );
}
