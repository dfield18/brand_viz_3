# AI Brand Visibility Analyzer

A Next.js app that measures how AI platforms (ChatGPT, Gemini, Claude, Perplexity) talk about brands. It sends prompts to each model, then analyzes the responses for brand mentions, competitor positioning, narrative sentiment, source citations, and topic coverage.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Database**: PostgreSQL via Prisma 7
- **Styling**: Tailwind CSS 4, shadcn/ui, Radix UI
- **Charts**: Recharts
- **AI SDKs**: OpenAI (`openai`), Google Generative AI (`@google/generative-ai`), SerpAPI (Google AI Overviews)

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── jobs/               # Create analysis jobs (POST)
│   │   ├── backfill/           # Backfill historical data across weeks (POST)
│   │   ├── prompts/            # CRUD for brand prompts (GET/POST)
│   │   ├── visibility/         # Brand mention rates, rank, prominence (GET)
│   │   ├── narrative/          # Sentiment, themes, strengths/weaknesses (GET)
│   │   ├── competition/        # Competitor share, win/loss, prompt matrix (GET)
│   │   ├── topics/             # Topic-level brand metrics (GET)
│   │   ├── sources/            # Citation/URL analysis (GET)
│   │   ├── responses/          # Raw AI responses browser (GET)
│   │   └── overview/           # Summary dashboard metrics (GET)
│   └── entity/[slug]/          # Brand pages with tab routing
│       ├── layout.tsx          # Tab navigation wrapper
│       ├── overview/
│       ├── visibility/
│       ├── narrative/
│       ├── competition/
│       ├── topics/
│       ├── sources/
│       ├── responses/
│       ├── recommendations/    # Placeholder
│       ├── site-audit/         # Placeholder
│       └── reports/            # Placeholder
├── components/
│   ├── AnalyzeRunner.tsx       # Runs analysis jobs with per-model progress
│   ├── BrandSelector.tsx       # Brand search/selection
│   ├── PromptManager.tsx       # Manage prompts per brand
│   ├── TabNav.tsx              # Tab navigation bar
│   └── [tab-specific]/        # Tab UI components (visibility/, narrative/, etc.)
├── lib/
│   ├── apiPipeline.ts          # Shared data-fetching pipeline (fetchBrandRuns)
│   ├── brand.ts                # findOrCreateBrand with race-condition handling
│   ├── utils.ts                # titleCase, computeRangeCutoff
│   ├── constants.ts            # VALID_MODELS, VALID_RANGES, MODEL_LABELS
│   ├── extractAnalysis.ts      # Structured entity extraction from AI responses
│   ├── aggregateAnalysis.ts    # Aggregate analysis across runs
│   ├── promptService.ts        # Prompt template management
│   ├── prisma.ts               # Prisma client singleton
│   ├── openai.ts               # OpenAI client
│   ├── gemini.ts               # Gemini client
│   ├── hash.ts                 # SHA-256 hashing for request dedup
│   ├── useCachedFetch.ts       # Client-side fetch hook with caching
│   ├── visibility/
│   │   └── brandMention.ts     # isBrandMentioned, computeBrandRank
│   ├── competition/
│   │   └── computeCompetition.ts # Shared metrics (mentionRate, avgRank, rank1Rate, etc.)
│   ├── narrative/
│   │   ├── extractNarrative.ts # Sentiment, themes, claims extraction
│   │   ├── drift.ts            # Theme drift over time
│   │   └── themeTaxonomy.ts    # Theme classification taxonomy
│   ├── topics/
│   │   ├── extractTopic.ts     # Prompt topic classification
│   │   ├── topicRollups.ts     # Topic-level metric aggregation
│   │   └── topicTaxonomy.ts    # Topic taxonomy definitions
│   ├── sources/
│   │   ├── parseUrls.ts        # URL extraction from responses
│   │   ├── computeSources.ts   # Source domain metrics
│   │   └── attributeEntity.ts  # Attribute sources to entities
│   └── prominence/
│       ├── prominence.ts       # Prominence scoring algorithm
│       └── persistProminence.ts # Save EntityResponseMetric records
└── types/                      # Shared TypeScript types
```

## Data Model

**Brand** -> **Job** (per model+range run) -> **Run** (per prompt response) -> **EntityResponseMetric** (per entity per response)

- **Prompts** are categorized by `cluster` (direct/related/comparative/network) and `intent` (informational/high-intent)
- **Runs** store raw AI response text plus structured `analysisJson` and `narrativeJson`
- **EntityResponseMetric** tracks prominence, rank position, and frequency for each entity mentioned in a response
- **SourceOccurrence** tracks URLs/citations found in responses

## Key Patterns

- **Shared pipeline**: All read-only API routes use `fetchBrandRuns()` from `lib/apiPipeline.ts` which handles brand lookup, job resolution, run fetching, and deduplication
- **Shared metrics**: `computeMentionRate`, `computeAvgRank`, `computeRank1Rate`, `computeAvgProminence` in `lib/competition/computeCompetition.ts`
- **Brand detection**: `isBrandMentioned()` and `computeBrandRank()` in `lib/visibility/brandMention.ts`
- **Find-or-create**: `findOrCreateBrand()` in `lib/brand.ts` handles concurrent creation races (P2002)
- **Run dedup**: When model="all", dedup by `model|promptId`; when single model, dedup by `promptId` (latest run wins)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Lint
npx tsc --noEmit     # Type check
npm test             # Run tests
```

## Models

The app queries five AI models: `chatgpt`, `gemini`, `claude`, `perplexity`, `google`. The `google` model uses SerpAPI to fetch Google AI Overviews (the AI-generated summary Google shows at the top of search results). Model filtering is supported across all tabs via query params (`?model=chatgpt`). Range filtering uses `?range=7|30|90`.

## Environment Variables

Requires `DATABASE_URL`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, and `SERPAPI_API_KEY` in `.env`.
