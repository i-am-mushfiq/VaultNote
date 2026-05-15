// ── Local Entity Extraction ───────────────────────────────────────────────────
// Pure regex + curated keyword matching — no ML model required.

export type EntityKind = 'hashtag' | 'mention' | 'tech' | 'date' | 'url' | 'concept';

export interface Entity {
  text: string;
  kind: EntityKind;
  count: number;
}

// Comprehensive tech & domain-specific term list
const TECH_TERMS = new Set([
  // Languages
  'JavaScript','TypeScript','Python','Rust','Go','Java','C#','C++','Ruby','Swift','Kotlin','PHP',
  'Scala','Haskell','Elixir','Clojure','R','MATLAB','Julia','Dart','Lua','Perl','Bash','Shell',
  // Frontend
  'React','Vue','Angular','Svelte','Next.js','Nuxt','Remix','Astro','Solid','Qwik','Vite',
  'Webpack','Rollup','Parcel','esbuild','Tailwind','CSS','HTML','SASS','SCSS','PostCSS',
  'Redux','Zustand','MobX','Jotai','Recoil','GraphQL','REST','tRPC','Apollo',
  // Backend
  'Node.js','Deno','Bun','Express','Fastify','NestJS','Django','Flask','FastAPI','Rails',
  'Spring','Laravel','Phoenix','Gin','Fiber','Actix','Axum','Rocket','Hono',
  // Databases
  'PostgreSQL','MySQL','SQLite','MongoDB','Redis','Cassandra','DynamoDB','Supabase',
  'PlanetScale','CockroachDB','Neo4j','Elasticsearch','ClickHouse','TimescaleDB',
  // Cloud & DevOps
  'AWS','GCP','Azure','Docker','Kubernetes','Terraform','Ansible','Pulumi','Vercel',
  'Netlify','Cloudflare','Railway','Fly.io','GitHub','GitLab','CI/CD','DevOps',
  'Linux','Nginx','Apache','Traefik','Caddy',
  // AI/ML
  'Machine Learning','Deep Learning','Neural Network','LLM','GPT','Claude','Gemini',
  'Llama','Mistral','Transformer','BERT','Diffusion','Stable Diffusion','RAG',
  'Embeddings','Vector Database','Pinecone','Weaviate','Chroma','FAISS',
  'PyTorch','TensorFlow','Keras','HuggingFace','scikit-learn','pandas','NumPy',
  'OpenAI','Anthropic','Ollama','LangChain','LlamaIndex',
  // Concepts
  'API','SDK','CLI','GUI','SPA','SSR','SSG','PWA','WebSocket','OAuth','JWT',
  'HTTPS','TCP','UDP','WebAssembly','WASM','gRPC','Protobuf','JSON','YAML','TOML',
  'Git','SSH','TLS','SSL','DNS','CDN','CORS','CSP','SEO','A11y','i18n',
  // System Design
  'Microservices','Monolith','Event-Driven','CQRS','Event Sourcing','DDD',
  'CAP Theorem','ACID','BASE','Sharding','Replication','Load Balancer','Cache',
  'Message Queue','Kafka','RabbitMQ','Redis Pub/Sub','Webhook',
]);

const DATE_RE   = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi;
const URL_RE    = /https?:\/\/[^\s)>\]"']+/g;
const HASHTAG_RE = /#([a-zA-Z][a-zA-Z0-9_-]{1,})\b/g;
const MENTION_RE = /@([a-zA-Z][a-zA-Z0-9_-]{1,})\b/g;
// Capitalised 2–4 word phrases (potential proper nouns)
const CONCEPT_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;

export function extractEntities(text: string): Entity[] {
  const counts = new Map<string, { kind: EntityKind; count: number }>();

  const add = (raw: string, kind: EntityKind) => {
    const key = raw.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { kind, count: 1 });
  };

  // Strip code blocks to avoid false positives
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '');

  // Hashtags
  for (const m of stripped.matchAll(HASHTAG_RE)) add(m[1], 'hashtag');
  // Mentions
  for (const m of stripped.matchAll(MENTION_RE)) add(m[1], 'mention');
  // Dates
  for (const m of stripped.matchAll(DATE_RE)) add(m[0], 'date');
  // URLs (domain only for display)
  for (const m of stripped.matchAll(URL_RE)) {
    try { add(new URL(m[0]).hostname, 'url'); } catch { /* skip */ }
  }
  // Tech terms (case-insensitive match, display as canonical)
  for (const term of TECH_TERMS) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(stripped)) add(term, 'tech');
  }
  // Multi-word proper nouns (skip if already captured as tech term)
  for (const m of stripped.matchAll(CONCEPT_RE)) {
    const lower = m[1].toLowerCase();
    if (!counts.has(lower)) add(m[1], 'concept');
  }

  return Array.from(counts.entries())
    .map(([text, { kind, count }]) => {
      // Display canonical case for tech terms
      const canonical = [...TECH_TERMS].find((t) => t.toLowerCase() === text) ?? text;
      return { text: canonical, kind, count };
    })
    .filter((e) => e.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 30); // cap at 30 entities per note
}
