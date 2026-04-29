import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, ChevronUp, ChevronDown, Cpu, Database, HardDrive, Globe, Shield, Zap, RefreshCw, Check, Clock, AlertCircle, BarChart3, Play, Printer } from 'lucide-react';

// ============================================================
// THEME & FONTS
// ============================================================
const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
    .font-display { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; letter-spacing: -0.01em; }
    .font-body { font-family: 'DM Sans', system-ui, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'ss02', 'ss03'; }
    @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
    .cursor-blink { animation: blink 1s step-end infinite; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
    @keyframes pulse-dot { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    .pulse-dot { animation: pulse-dot 1.5s ease-in-out infinite; }
    .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 3px; }
    .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }
    .grid-bg {
      background-image:
        linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .text-3xs { font-size: 9px; line-height: 1.4; }
    .text-2xs { font-size: 10px; line-height: 1.4; }
    .text-mxs { font-size: 11px; line-height: 1.4; }
    .main-grid { height: calc(100vh - 57px); }
    .drawer-scroll { height: calc(100% - 2.5rem); }
    .timeline-dot { left: -5px; }

    @media screen { .print-only { display: none !important; } }
    @media print {
      @page { margin: 0.5in; size: letter; }
      body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      .print-break { page-break-after: always; }
      .print-avoid-break { page-break-inside: avoid; break-inside: avoid; }
      .print-section { margin-bottom: 18pt; }
    }
  `}</style>
);

// ============================================================
// SCENARIO — canned conversation demonstrating the flow
// ============================================================
const SCENARIO = {
  user1: "I need a scalable web app for ~500K monthly active users. Multi-AZ in us-east-1. Stateful, with a relational database.",
  agent1: "Understood — 500K MAU, multi-AZ in us-east-1, stateful with relational data. Before I match a pattern, three things materially change both architecture and cost. Let me confirm:\n\n1. **Consistency model** — strong (single writer) or can you tolerate eventual?\n2. **Compliance overlay** — HIPAA, PCI, FedRAMP, or none?\n3. **Read/write skew** — read-heavy, balanced, or write-heavy?\n\nI won't assume; these meaningfully change the recommendation.",
  user2: "Strong consistency, no compliance overlay, roughly 80/20 read/write.",
  agent2_pre: "Got it. Matching patterns now.",
  toolCalls: [
    { name: "match_pattern", input: { workload_type: "web_app", user_count: 500000, state: "stateful", consistency: "strong" }, duration: 340 },
    { name: "validate_sku", input: { service: "ec2", instance_type: "m6i.xlarge", region: "us-east-1" }, duration: 80 },
    { name: "validate_sku", input: { service: "rds", instance_class: "db.m6i.xlarge", region: "us-east-1" }, duration: 90 },
    { name: "validate_sku", input: { service: "elasticache", node_type: "cache.r7g.large", region: "us-east-1" }, duration: 70 },
    { name: "get_pricing", input: { components: 7, region: "us-east-1", term: "on_demand" }, duration: 410 },
    { name: "compute_cost", input: { architecture: "web-app-3tier@1.0.0" }, duration: 120 },
  ],
  agent2_final: "**Recommendation: 3-tier highly-available web application** (`web-app-3tier@1.0.0`)\n\nMatched against 3 candidates; this scored highest (0.92) because your workload is stateful with strong consistency at scale where serverless cold-starts and microservices coordination overhead aren't justified. Sized using rule `user_count_gte:50000`.\n\nKey trade-offs:\n• **Pros**: proven topology, multi-AZ failover, horizontal scaling, mature tooling\n• **Cons**: higher baseline than serverless; DB writes scale only vertically until you shard\n\nReserved 1-year (no upfront) on compute + RDS would save ~38%. Want me to model that?"
};

const PATTERN_CANDIDATES = [
  { id: "web-app-3tier", name: "3-tier HA web app", score: 0.92, selected: true },
  { id: "web-app-eks-microservices", name: "EKS microservices", score: 0.71, selected: false },
  { id: "web-app-serverless", name: "Serverless web app", score: 0.55, selected: false },
];

// ============================================================
// COMPONENT RATIONALE — why this instance / service / config
// ============================================================
const COMPONENT_RATIONALE = [
  {
    id: "compute",
    icon: "cpu",
    title: "EC2 m6i.xlarge × 8 (autoscale 4–30)",
    body: "General-purpose family — balanced vCPU/memory/network suited to typical web request handling. Sized via the pattern's user_count_gte:50000 rule; midpoint of the 4–30 ASG bound is modeled for cost. Considered and rejected: c6i (compute-optimized — would waste the memory needed for connection pools and request buffering) and t-series (burstable — production traffic is sustained, not bursty, so credits would deplete)."
  },
  {
    id: "rds",
    icon: "database",
    title: "RDS Postgres db.m6i.xlarge · Multi-AZ + 1 read replica",
    body: "Same family logic as compute. Multi-AZ is enforced by your availability_target — synchronous standby in a second AZ doubles cost but enables automatic failover in ~60s. The read replica is justified by your 80/20 read/write skew: without it the primary would handle 5× more reads than writes, becoming a CPU/IO bottleneck before write contention. 500 GB gp3 storage is the pattern default; tunable via data_volume_gb."
  },
  {
    id: "cache",
    icon: "zap",
    title: "ElastiCache Redis · cache.r7g.large × 3",
    body: "Memory-optimized r-family because Redis is memory-bound, not CPU-bound. Graviton (g suffix) delivers ~20% better price-performance than x86 for Redis workloads. Three nodes form a primary + 2 replica cluster across AZs for HA and read offload. Pattern assumes 70% cache hit ratio target; below that, RDS read pressure climbs."
  },
  {
    id: "alb",
    icon: "balance",
    title: "Application Load Balancer · Multi-AZ, L7",
    body: "Layer-7 routing with TLS termination at the edge — offloads cipher work from EC2 and centralizes certificate management via ACM. Health checks every 30s drain unhealthy targets in ~30s. Cost is base hourly + LCU charges (request rate, data, connection minutes, rule evaluations); LCU dominates at this scale."
  },
  {
    id: "cdn",
    icon: "globe",
    title: "CloudFront distribution",
    body: "Edge caching of static assets and HTML reduces origin load and shaves 50–200ms off TTFB for distant users. At 500K MAU, billing is dominated by request count rather than egress bytes for a typical web app. Includes AWS Shield Standard DDoS protection and integrates with WAF if compliance escalates."
  },
  {
    id: "s3",
    icon: "hd",
    title: "S3 Standard · assets and uploads",
    body: "Object storage for static assets, user uploads, and backups. Standard class assumed because access patterns are unknown — switch to Intelligent-Tiering once usage data exists if reads turn cold. Accessed via VPC gateway endpoint to avoid NAT egress charges."
  },
  {
    id: "secrets",
    icon: "shield",
    title: "Secrets Manager · 6 secrets",
    body: "DB credentials, API keys, JWT signing keys. Automatic rotation supported. Cost is trivial relative to the operational and security risk it removes — credentials never live in env vars or AMIs."
  },
];

const REQUEST_FLOW = [
  { step: 1, title: "Ingress", body: "User browser → CloudFront. Cacheable assets served from the nearest edge POP. Dynamic requests forwarded to the origin." },
  { step: 2, title: "Edge → Origin", body: "CloudFront → ALB (Multi-AZ). TLS terminated at the ALB; the ALB selects a healthy target across both AZs by round-robin." },
  { step: 3, title: "Application tier", body: "ALB → EC2 in the ASG. Auto Scaling Group scales 4–30 instances on CPU and request-count CloudWatch alarms." },
  { step: 4, title: "Read path", body: "EC2 checks ElastiCache first (cache-aside). On miss, reads from the RDS read replica. Writes go to the RDS primary; replica syncs asynchronously, so the application invalidates cache keys on writes to avoid stale reads." },
  { step: 5, title: "Static + uploads", body: "EC2 ↔ S3 via a VPC gateway endpoint — keeps S3 traffic on AWS's network and avoids NAT egress charges." },
  { step: 6, title: "Bootstrap & secrets", body: "On launch, EC2 instances assume an IAM role and fetch DB credentials from Secrets Manager. No long-lived credentials on disk." },
];

const HA_PROPERTIES = [
  "Two AZs minimum at every tier",
  "ALB drains failed targets in ~30s via health checks",
  "RDS Multi-AZ failover within ~60s (synchronous standby)",
  "ASG auto-replaces instances failing health checks",
  "Cache cluster: primary + 2 replicas spread across AZs",
];

// ============================================================
// COST MODEL — piecewise tiered, mirrors the real sizing rules
// ============================================================
function sizeForUsers(users) {
  if (users < 50000) {
    return {
      tier: "small",
      compute: { instance: "m6i.large", count: 3, hourly: 0.0960 },
      rds: { instance: "db.m6i.large", hourly: 0.342, storageGb: 100, replicas: 0 },
      cache: { node: "cache.t4g.medium", count: 2, hourly: 0.068 },
    };
  } else if (users < 1000000) {
    return {
      tier: "medium",
      compute: { instance: "m6i.xlarge", count: 8, hourly: 0.1920 },
      rds: { instance: "db.m6i.xlarge", hourly: 0.684, storageGb: 500, replicas: 1 },
      cache: { node: "cache.r7g.large", count: 3, hourly: 0.226 },
    };
  } else {
    return {
      tier: "large",
      compute: { instance: "m6i.2xlarge", count: 18, hourly: 0.3840 },
      rds: { instance: "db.r6i.2xlarge", hourly: 1.370, storageGb: 2000, replicas: 2 },
      cache: { node: "cache.r7g.xlarge", count: 6, hourly: 0.452 },
    };
  }
}

function computeCost(users) {
  const s = sizeForUsers(users);
  const HOURS = 730;
  const compute = s.compute.count * s.compute.hourly * HOURS;
  const rdsBase = s.rds.hourly * HOURS * (1 + s.rds.replicas);
  const rdsStorage = s.rds.storageGb * 0.115;
  const cache = s.cache.count * s.cache.hourly * HOURS;
  const alb = 16.20 + Math.min(35, users / 25000);
  const cf = Math.min(220, 0.0001 * users + users * 0.00012);
  const s3 = 12 + users * 0.000015;
  const secrets = 2.40;
  const dataTransfer = Math.min(180, users * 0.00009);

  const items = [
    { sku: `EC2 / ${s.compute.instance} × ${s.compute.count} avg`, category: "compute", amount: compute },
    { sku: `RDS / ${s.rds.instance} (Multi-AZ${s.rds.replicas ? ` + ${s.rds.replicas} replica${s.rds.replicas > 1 ? 's' : ''}` : ''})`, category: "compute", amount: rdsBase },
    { sku: `RDS / gp3 storage (${s.rds.storageGb}GB)`, category: "storage", amount: rdsStorage },
    { sku: `ElastiCache / ${s.cache.node} × ${s.cache.count}`, category: "compute", amount: cache },
    { sku: `ALB / base + LCU`, category: "network", amount: alb },
    { sku: `CloudFront / requests + egress`, category: "network", amount: cf },
    { sku: `S3 Standard / assets`, category: "storage", amount: s3 },
    { sku: `Secrets Manager / 6 secrets`, category: "mgmt", amount: secrets },
    { sku: `Data transfer out`, category: "network", amount: dataTransfer },
  ];
  const total = items.reduce((a, b) => a + b.amount, 0);
  return { items, total, sizing: s };
}

// ============================================================
// CHAT MESSAGE — handles streaming text rendering
// ============================================================
function StreamingText({ text, speed = 14, onDone }) {
  const [shown, setShown] = useState("");
  const idxRef = useRef(0);
  useEffect(() => {
    setShown("");
    idxRef.current = 0;
    const id = setInterval(() => {
      idxRef.current += 2;
      if (idxRef.current >= text.length) {
        setShown(text);
        clearInterval(id);
        if (onDone) onDone();
      } else {
        setShown(text.slice(0, idxRef.current));
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return <FormattedText text={shown} />;
}

function FormattedText({ text }) {
  // simple markdown-ish: **bold** and `code` and \n
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p === "\n") return <br key={i} />;
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="text-zinc-900">{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="font-mono text-xs text-amber-800 bg-amber-50 px-1 py-0.5 rounded">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ============================================================
// TOOL CALL CARD — appears in chat as agent invokes tools
// ============================================================
function ToolCallCard({ name, input, status, duration }) {
  return (
    <div className="fade-in-up font-mono text-mxs my-1.5 border border-zinc-200 rounded bg-zinc-50 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {status === "running" ? (
          <RefreshCw className="w-3 h-3 text-blue-700 animate-spin" />
        ) : (
          <Check className="w-3 h-3 text-emerald-600" />
        )}
        <span className="text-zinc-700">{name}</span>
        <span className="text-zinc-400 truncate flex-1">
          ({Object.entries(input).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")})
        </span>
        {status === "done" && <span className="text-zinc-500 tabular-nums">{duration}ms</span>}
      </div>
    </div>
  );
}

// ============================================================
// PATTERN CANDIDATES PANEL (renders inline in chat after match_pattern)
// ============================================================
function PatternCandidatesInline({ candidates }) {
  return (
    <div className="fade-in-up my-2 border border-zinc-200 rounded bg-zinc-50 p-2.5">
      <div className="text-2xs font-mono text-zinc-500 uppercase tracking-wider mb-1.5">match_pattern → 3 candidates</div>
      {candidates.map(c => (
        <div key={c.id} className="flex items-center gap-2 py-1 text-xs">
          <div className={`w-1.5 h-1.5 rounded-full ${c.selected ? "bg-amber-400" : "bg-zinc-300"}`} />
          <span className={`font-mono ${c.selected ? "text-amber-800" : "text-zinc-500"}`}>{c.id}</span>
          <span className={`flex-1 ${c.selected ? "text-zinc-700" : "text-zinc-400"}`}>{c.name}</span>
          <span className="font-mono tabular-nums text-zinc-500">{c.score.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// RATIONALE VIEW — why each component / instance was selected
// ============================================================
function RationaleView() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin px-6 py-5">
      <div className="max-w-2xl mx-auto">
        <div className="text-2xs font-mono uppercase tracking-wider text-zinc-500 mb-3">Component selection rationale</div>
        <div className="space-y-4">
          {COMPONENT_RATIONALE.map(r => (
            <div key={r.id} className="border-l-2 border-amber-400 pl-4 py-1">
              <div className="font-mono text-xs text-amber-700 mb-1">{r.title}</div>
              <div className="text-sm text-zinc-700 leading-relaxed">{r.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FLOW VIEW — how the components interact
// ============================================================
function FlowView() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin px-6 py-5">
      <div className="max-w-2xl mx-auto">
        <div className="text-2xs font-mono uppercase tracking-wider text-zinc-500 mb-3">Request flow</div>
        <ol className="space-y-3 mb-6">
          {REQUEST_FLOW.map(f => (
            <li key={f.step} className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 border border-amber-400 flex items-center justify-center font-mono text-xs text-amber-700">
                {f.step}
              </div>
              <div className="flex-1 pt-0.5">
                <div className="text-sm font-medium text-zinc-900 mb-0.5">{f.title}</div>
                <div className="text-sm text-zinc-600 leading-relaxed">{f.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="text-2xs font-mono uppercase tracking-wider text-zinc-500 mb-2 mt-6">High-availability properties</div>
        <ul className="space-y-1.5">
          {HA_PROPERTIES.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
              <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-1" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================
// ARCHITECTURE DIAGRAM — custom SVG, components fade in based on `placedCount`
// ============================================================
function ArchitectureDiagram({ placedCount, sizing }) {
  // Component definitions with positions
  const components = [
    { id: "users",   x: 220, y: 30,  w: 80,  h: 32, label: "Users",     icon: "users", kind: "external" },
    { id: "cf",      x: 200, y: 90,  w: 120, h: 38, label: "CloudFront", sub: "edge_cdn", icon: "globe" },
    { id: "alb",     x: 200, y: 170, w: 120, h: 38, label: "ALB",       sub: "Multi-AZ · L7", icon: "balance" },
    { id: "asg",     x: 50,  y: 260, w: 130, h: 56, label: "EC2 ASG",   sub: `${sizing.compute.instance} × ${sizing.compute.count}`, icon: "cpu" },
    { id: "rds",     x: 200, y: 260, w: 130, h: 56, label: "RDS Postgres", sub: `${sizing.rds.instance.replace('db.', '')}${sizing.rds.replicas ? ' +' + sizing.rds.replicas + 'rr' : ''}`, icon: "database" },
    { id: "cache",   x: 350, y: 260, w: 110, h: 56, label: "ElastiCache", sub: `Redis × ${sizing.cache.count}`, icon: "zap" },
    { id: "s3",      x: 50,  y: 360, w: 130, h: 38, label: "S3",        sub: "static + uploads", icon: "hd" },
    { id: "secrets", x: 350, y: 360, w: 110, h: 38, label: "Secrets",   sub: "Manager", icon: "shield" },
  ];

  // Edges (from -> to). Index in components array gates when they appear.
  const edges = [
    { from: "users", to: "cf",    appearsAt: 1 },
    { from: "cf",    to: "alb",   appearsAt: 2 },
    { from: "alb",   to: "asg",   appearsAt: 3 },
    { from: "asg",   to: "rds",   appearsAt: 4 },
    { from: "asg",   to: "cache", appearsAt: 5 },
    { from: "asg",   to: "s3",    appearsAt: 6 },
    { from: "asg",   to: "secrets", appearsAt: 7 },
  ];

  const compById = Object.fromEntries(components.map(c => [c.id, c]));
  const center = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

  function iconPath(kind) {
    switch (kind) {
      case "users":   return "M2,7 a3,3 0 1,1 6,0 a3,3 0 1,1 -6,0 M-2,18 a7,5 0 0,1 14,0";
      case "globe":   return "M0,7 a7,7 0 1,1 14,0 a7,7 0 1,1 -14,0 M0,7 h14 M7,0 q-5,7 0,14 q5,-7 0,-14";
      case "balance": return "M0,2 h14 M3,2 v3 q0,4 -3,5 q0,2 6,0 q-3,-1 -3,-5 v-3 M11,2 v3 q0,4 -3,5 q0,2 6,0 q-3,-1 -3,-5 v-3";
      case "cpu":     return "M0,4 v6 h14 v-6 z M3,7 h2 v0 M9,7 h2 v0 M-2,5 h2 M-2,9 h2 M14,5 h2 M14,9 h2 M5,-2 v2 M9,-2 v2 M5,14 v-2 M9,14 v-2";
      case "database":return "M0,2 a7,2 0 1,0 14,0 a7,2 0 1,0 -14,0 M0,2 v8 a7,2 0 0,0 14,0 v-8 M0,6 a7,2 0 0,0 14,0";
      case "zap":     return "M5,0 L0,8 L5,8 L3,14 L9,5 L4,5 L7,0 z";
      case "hd":      return "M0,2 h14 v10 h-14 z M2,5 h10 M2,8 h6";
      case "shield":  return "M7,0 L0,3 v6 q0,3 7,5 q7,-2 7,-5 v-6 z";
      default: return "";
    }
  }

  return (
    <svg viewBox="0 0 510 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#a1a1aa" />
        </marker>
        <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="#e4e4e7" />
        </pattern>
      </defs>

      {/* VPC boundary, appears once compute/db are placed */}
      {placedCount >= 4 && (
        <g className="fade-in-up">
          <rect x="20" y="240" width="470" height="170" rx="6" fill="none" stroke="#a1a1aa" strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
          <text x="32" y="234" fill="#71717a" fontSize="9" fontFamily="JetBrains Mono">VPC · us-east-1 · 2 AZs</text>
        </g>
      )}

      {/* Edges */}
      {edges.map((e, i) => {
        if (placedCount < e.appearsAt + 1) return null;
        const a = center(compById[e.from]);
        const b = center(compById[e.to]);
        return (
          <line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#a1a1aa" strokeWidth="1" markerEnd="url(#arrow)"
            opacity="0.7"
            className="fade-in-up"
          />
        );
      })}

      {/* Components */}
      {components.slice(0, placedCount).map((c, i) => {
        const isExt = c.kind === "external";
        return (
          <g key={c.id} className="fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
            <rect
              x={c.x} y={c.y} width={c.w} height={c.h}
              rx="4"
              fill={isExt ? "transparent" : "#ffffff"}
              stroke={isExt ? "#a1a1aa" : "#d97706"}
              strokeOpacity={isExt ? 1 : 0.55}
              strokeWidth="1.2"
            />
            {!isExt && (
              <g transform={`translate(${c.x + 10}, ${c.y + 12})`}>
                <path d={iconPath(c.icon)} stroke="#b45309" strokeWidth="1.2" fill="none" strokeOpacity="0.9" />
              </g>
            )}
            <text
              x={isExt ? c.x + c.w / 2 : c.x + 32}
              y={c.y + (c.sub ? 19 : c.h / 2 + 4)}
              fill={isExt ? "#52525b" : "#18181b"}
              fontSize="11"
              fontFamily="DM Sans"
              fontWeight="500"
              textAnchor={isExt ? "middle" : "start"}
            >
              {c.label}
            </text>
            {c.sub && (
              <text
                x={c.x + 32} y={c.y + 33}
                fill="#71717a" fontSize="9" fontFamily="JetBrains Mono"
              >
                {c.sub}
              </text>
            )}
          </g>
        );
      })}

      {placedCount === 0 && (
        <text x="255" y="210" textAnchor="middle" fill="#71717a" fontSize="11" fontFamily="DM Sans">
          Awaiting workload profile…
        </text>
      )}
    </svg>
  );
}

// ============================================================
// COST PANEL
// ============================================================
function CostPanel({ users, populated, term, setTerm }) {
  const cost = computeCost(users);
  const annual = cost.total * 12;
  const reservedSavings = cost.total * 0.38;

  const byCategory = cost.items.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + i.amount;
    return acc;
  }, {});
  const maxCat = Math.max(...Object.values(byCategory));

  if (!populated) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
        <div className="text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <div>Cost breakdown will appear<br />once architecture is resolved.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Total */}
      <div className="px-5 pt-5 pb-4 border-b border-zinc-200">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Estimated monthly</span>
          <div className="flex gap-0.5 text-2xs font-mono">
            {["on_demand", "reserved_1y"].map(t => (
              <button
                key={t}
                onClick={() => setTerm(t)}
                className={`px-1.5 py-0.5 rounded ${term === t ? "bg-amber-100 text-amber-700" : "text-zinc-500 hover:text-zinc-700"}`}
              >
                {t === "on_demand" ? "on-demand" : "1y reserved"}
              </button>
            ))}
          </div>
        </div>
        <div className="font-display text-5xl text-zinc-900 tabular-nums">
          ${(term === "reserved_1y" ? cost.total - reservedSavings : cost.total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs">
          <span className="text-zinc-500 tabular-nums">${(annual * (term === "reserved_1y" ? 0.62 : 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr</span>
          {term === "on_demand" && (
            <span className="text-emerald-700 tabular-nums">−${reservedSavings.toFixed(0)}/mo if reserved 1y</span>
          )}
        </div>
      </div>

      {/* By category bar */}
      <div className="px-5 py-4 border-b border-zinc-200">
        <div className="text-2xs uppercase tracking-wider text-zinc-500 font-mono mb-2">By category</div>
        {Object.entries(byCategory).map(([cat, amt]) => (
          <div key={cat} className="flex items-center gap-2 py-1">
            <span className="text-xs text-zinc-400 w-20 capitalize">{cat}</span>
            <div className="flex-1 h-1.5 bg-zinc-50 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${(amt / maxCat) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-zinc-400 tabular-nums w-14 text-right">${amt.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* Itemized — table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-5 pt-3 pb-1 text-2xs uppercase tracking-wider text-zinc-500 font-mono flex items-center justify-between">
          <span>Itemized · all SKUs validated</span>
          <span className="text-zinc-400 normal-case tracking-normal">{cost.items.length} lines</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 font-mono text-2xs uppercase tracking-wider border-b border-zinc-200">
              <th className="text-left font-normal px-5 py-2">Service / SKU</th>
              <th className="text-right font-normal px-2 py-2">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {cost.items.map((it, i) => (
              <tr key={i} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-5 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      it.category === "compute" ? "bg-amber-500" :
                      it.category === "storage" ? "bg-blue-500" :
                      it.category === "network" ? "bg-emerald-500" :
                      "bg-zinc-400"
                    }`} />
                    <div className="min-w-0">
                      <div className="font-mono text-mxs text-zinc-800 truncate">{it.sku}</div>
                      <div className="text-3xs text-zinc-500 capitalize mt-0.5">{it.category}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 pr-5 py-2 text-right">
                  <span className="font-mono text-zinc-900 tabular-nums">${it.amount.toFixed(2)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-50">
              <td className="px-5 py-2.5 text-2xs font-mono uppercase tracking-wider text-zinc-700">
                Monthly total
              </td>
              <td className="px-2 pr-5 py-2.5 text-right">
                <span className="font-mono text-sm text-zinc-900 tabular-nums font-semibold">
                  ${(term === "reserved_1y" ? cost.total - reservedSavings : cost.total).toFixed(2)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-zinc-200 text-2xs font-mono text-zinc-400 flex items-center justify-between">
        <span>price data · synced 2h ago</span>
        <span>effective 2026-04-29</span>
      </div>
    </div>
  );
}

// ============================================================
// DECISION RECORDS DRAWER
// ============================================================
const DECISION_RECORDS = [
  { type: "requirement_clarified", title: "Workload profile complete", body: "Asked for state, consistency, compliance, R/W skew. User confirmed: stateful · strong · none · 80/20.", confidence: "high" },
  { type: "pattern_matched", title: "3 candidates ranked", body: "web-app-3tier (0.92) · web-app-eks-microservices (0.71) · web-app-serverless (0.55). Scored on optimization_priority=balanced.", confidence: "high" },
  { type: "pattern_selected", title: "Selected web-app-3tier@1.0.0", body: "Highest score; user not requesting microservices; serverless cold-starts a risk at 500K MAU with strong consistency.", confidence: "high" },
  { type: "component_sized", title: "Applied sizing rule user_count_gte:50000", body: "Compute m6i.xlarge × 4–30 (avg 8 modeled). RDS db.m6i.xlarge + 1 read replica, 500GB gp3. Cache cache.r7g.large × 3.", confidence: "high" },
  { type: "sku_validated", title: "All 7 SKUs confirmed", body: "Validated against pricing store. effective_date 2026-04-29. All available in us-east-1.", confidence: "high" },
  { type: "price_fetched", title: "9 line items priced on-demand", body: "Pulled from local store (DuckDB/Parquet, synced 2h ago). Source: AWS Price List API offer files.", confidence: "high" },
  { type: "trade_off_evaluated", title: "Reserved 1y partial saves ~38%", body: "Applies to compute + RDS only. Spot not modeled (RDS/cache aren't spot-eligible). Surface to user as opt-in.", confidence: "medium" },
];

function DecisionDrawer({ open, onToggle, populated }) {
  return (
    <div className={`absolute bottom-0 left-0 right-0 bg-white border-t border-zinc-200 transition-all duration-300 ${open ? "h-80" : "h-10"} z-20 no-print`}>
      <button
        onClick={onToggle}
        className="w-full h-10 px-5 flex items-center justify-between text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Decision trace</span>
          {populated && <span className="text-zinc-400 normal-case tracking-normal">· {DECISION_RECORDS.length} records</span>}
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-5 pb-5 drawer-scroll overflow-y-auto scrollbar-thin">
          {!populated ? (
            <div className="text-zinc-400 text-sm py-8 text-center">No decisions yet — start a conversation.</div>
          ) : (
            <ol className="relative border-l border-zinc-200 ml-2">
              {DECISION_RECORDS.map((d, i) => (
                <li key={i} className="ml-6 mb-4 last:mb-0 fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="absolute timeline-dot mt-1.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-4 ring-white" />
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="font-mono text-2xs uppercase tracking-wider text-amber-700">{d.type}</span>
                    <span className={`text-2xs px-1.5 py-0 rounded ${d.confidence === "high" ? "text-emerald-700 bg-emerald-100" : "text-amber-700 bg-amber-100"}`}>
                      {d.confidence}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-800 mb-0.5">{d.title}</div>
                  <div className="text-xs text-zinc-500 leading-relaxed">{d.body}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PRINTABLE REPORT — full single-column layout for print/PDF
// ============================================================
function PrintableReport({ populated, userCount, term, sizing }) {
  if (!populated) return null;
  const cost = computeCost(userCount);
  const reservedSavings = cost.total * 0.38;
  const finalMonthly = term === "reserved_1y" ? cost.total - reservedSavings : cost.total;
  const finalAnnual = finalMonthly * 12;
  const today = new Date().toISOString().slice(0, 10);

  const byCategory = cost.items.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + i.amount;
    return acc;
  }, {});

  return (
    <div className="print-only" style={{ background: "white", color: "#18181b", fontFamily: "DM Sans, sans-serif", fontSize: "10pt", lineHeight: 1.5 }}>
      {/* Title */}
      <div className="print-section print-avoid-break" style={{ borderBottom: "2pt solid #18181b", paddingBottom: "10pt", marginBottom: "16pt" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div className="font-display" style={{ fontSize: "24pt", lineHeight: 1, marginBottom: "4pt" }}>Stratoscope</div>
            <div style={{ fontSize: "9pt", color: "#71717a", letterSpacing: "0.05em", textTransform: "uppercase" }}>AWS Architecture &amp; Cost Estimate</div>
          </div>
          <div style={{ textAlign: "right", fontSize: "9pt", color: "#52525b", fontFamily: "JetBrains Mono, monospace" }}>
            <div>Generated {today}</div>
            <div>Pricing effective 2026-04-29</div>
          </div>
        </div>
      </div>

      {/* Workload profile */}
      <div className="print-section print-avoid-break">
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "6pt", fontFamily: "JetBrains Mono, monospace" }}>Workload Profile</div>
        <table style={{ width: "100%", fontSize: "10pt", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={{ padding: "3pt 0", color: "#52525b", width: "40%" }}>Workload type</td><td>Web app · stateful · strong consistency</td></tr>
            <tr><td style={{ padding: "3pt 0", color: "#52525b" }}>Scale</td><td>{userCount.toLocaleString()} monthly active users · sizing tier <strong>{sizing.tier}</strong></td></tr>
            <tr><td style={{ padding: "3pt 0", color: "#52525b" }}>Region · availability</td><td>us-east-1 · multi-AZ</td></tr>
            <tr><td style={{ padding: "3pt 0", color: "#52525b" }}>Compliance</td><td>none specified</td></tr>
            <tr><td style={{ padding: "3pt 0", color: "#52525b" }}>Read/write skew</td><td>~80/20 (read-heavy)</td></tr>
            <tr><td style={{ padding: "3pt 0", color: "#52525b" }}>Pricing term modeled</td><td>{term === "reserved_1y" ? "1-year reserved (no upfront)" : "On-demand"}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Recommendation header */}
      <div className="print-section">
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "6pt", fontFamily: "JetBrains Mono, monospace" }}>Recommended Architecture</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10pt" }}>
          <div className="font-display" style={{ fontSize: "16pt" }}>3-Tier Highly-Available Web Application</div>
          <div style={{ fontSize: "9pt", fontFamily: "JetBrains Mono, monospace", color: "#52525b" }}>web-app-3tier@1.0.0</div>
        </div>

        {/* Diagram */}
        <div className="print-avoid-break" style={{ border: "1pt solid #d4d4d8", borderRadius: "4pt", padding: "12pt", background: "white" }}>
          <svg viewBox="0 0 510 420" style={{ width: "100%", maxHeight: "320pt" }} preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker id="parrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#71717a" />
              </marker>
            </defs>
            <PrintDiagramContent sizing={sizing} />
          </svg>
        </div>
      </div>

      {/* Component rationale */}
      <div className="print-section" style={{ marginTop: "18pt" }}>
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "8pt", fontFamily: "JetBrains Mono, monospace" }}>Component Selection Rationale</div>
        {COMPONENT_RATIONALE.map(r => (
          <div key={r.id} className="print-avoid-break" style={{ marginBottom: "10pt", paddingLeft: "10pt", borderLeft: "2pt solid #f59e0b" }}>
            <div style={{ fontSize: "10pt", fontWeight: 600, color: "#92400e", fontFamily: "JetBrains Mono, monospace", marginBottom: "3pt" }}>{r.title}</div>
            <div style={{ fontSize: "9.5pt", color: "#3f3f46", lineHeight: 1.5 }}>{r.body}</div>
          </div>
        ))}
      </div>

      {/* Request flow */}
      <div className="print-section print-avoid-break" style={{ marginTop: "16pt" }}>
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "8pt", fontFamily: "JetBrains Mono, monospace" }}>Request Flow</div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {REQUEST_FLOW.map(f => (
            <li key={f.step} style={{ marginBottom: "8pt", display: "flex", gap: "10pt" }}>
              <div style={{ flexShrink: 0, width: "20pt", height: "20pt", borderRadius: "50%", border: "1pt solid #f59e0b", background: "#fef3c7", color: "#92400e", fontFamily: "JetBrains Mono, monospace", fontSize: "9pt", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {f.step}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "10pt", marginBottom: "2pt" }}>{f.title}</div>
                <div style={{ fontSize: "9.5pt", color: "#3f3f46", lineHeight: 1.5 }}>{f.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* HA properties */}
      <div className="print-section print-avoid-break" style={{ marginTop: "10pt" }}>
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "6pt", fontFamily: "JetBrains Mono, monospace" }}>High-Availability Properties</div>
        <ul style={{ paddingLeft: "16pt", margin: 0 }}>
          {HA_PROPERTIES.map((p, i) => (
            <li key={i} style={{ fontSize: "9.5pt", color: "#3f3f46", marginBottom: "3pt" }}>{p}</li>
          ))}
        </ul>
      </div>

      {/* Cost summary */}
      <div className="print-section print-avoid-break" style={{ marginTop: "18pt", pageBreakBefore: "always" }}>
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "8pt", fontFamily: "JetBrains Mono, monospace" }}>Cost Estimate</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12pt", marginBottom: "16pt" }}>
          <div style={{ padding: "10pt", border: "1pt solid #d4d4d8", borderRadius: "4pt" }}>
            <div style={{ fontSize: "8pt", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3pt" }}>Monthly</div>
            <div className="font-display" style={{ fontSize: "20pt", lineHeight: 1 }}>${finalMonthly.toFixed(0)}</div>
          </div>
          <div style={{ padding: "10pt", border: "1pt solid #d4d4d8", borderRadius: "4pt" }}>
            <div style={{ fontSize: "8pt", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3pt" }}>Annual</div>
            <div className="font-display" style={{ fontSize: "20pt", lineHeight: 1 }}>${finalAnnual.toFixed(0)}</div>
          </div>
          <div style={{ padding: "10pt", border: "1pt solid #d4d4d8", borderRadius: "4pt" }}>
            <div style={{ fontSize: "8pt", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3pt" }}>Reserved 1y savings</div>
            <div className="font-display" style={{ fontSize: "20pt", lineHeight: 1, color: "#047857" }}>${reservedSavings.toFixed(0)}/mo</div>
          </div>
        </div>

        {/* Itemized table */}
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "6pt", fontFamily: "JetBrains Mono, monospace" }}>Itemized · {cost.items.length} line items · all SKUs validated against AWS Price List</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
          <thead>
            <tr style={{ borderBottom: "1pt solid #18181b" }}>
              <th style={{ textAlign: "left", padding: "5pt 6pt", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a", fontWeight: 500 }}>Service / SKU</th>
              <th style={{ textAlign: "left", padding: "5pt 6pt", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a", fontWeight: 500 }}>Category</th>
              <th style={{ textAlign: "right", padding: "5pt 6pt", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a", fontWeight: 500 }}>Monthly</th>
            </tr>
          </thead>
          <tbody>
            {cost.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "0.5pt solid #e4e4e7" }}>
                <td style={{ padding: "5pt 6pt", fontFamily: "JetBrains Mono, monospace", fontSize: "9pt" }}>{it.sku}</td>
                <td style={{ padding: "5pt 6pt", textTransform: "capitalize", color: "#52525b" }}>{it.category}</td>
                <td style={{ padding: "5pt 6pt", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums" }}>${it.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1.5pt solid #18181b", background: "#fafafa" }}>
              <td style={{ padding: "6pt", fontWeight: 600, fontSize: "9pt", textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly total ({term === "reserved_1y" ? "1y reserved" : "on-demand"})</td>
              <td></td>
              <td style={{ padding: "6pt", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: "11pt", fontVariantNumeric: "tabular-nums" }}>${finalMonthly.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {/* By category summary */}
        <div style={{ marginTop: "12pt", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "6pt", fontFamily: "JetBrains Mono, monospace" }}>Cost by Category</div>
        <table style={{ width: "60%", fontSize: "9.5pt", borderCollapse: "collapse" }}>
          <tbody>
            {Object.entries(byCategory).map(([cat, amt]) => (
              <tr key={cat}>
                <td style={{ padding: "3pt 0", textTransform: "capitalize", color: "#52525b", width: "40%" }}>{cat}</td>
                <td style={{ padding: "3pt 0", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontVariantNumeric: "tabular-nums" }}>${amt.toFixed(2)}</td>
                <td style={{ padding: "3pt 0 3pt 12pt", color: "#71717a", fontFamily: "JetBrains Mono, monospace" }}>{((amt / cost.total) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Decision trace */}
      <div className="print-section" style={{ marginTop: "18pt" }}>
        <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.1em", color: "#71717a", marginBottom: "8pt", fontFamily: "JetBrains Mono, monospace" }}>Decision Trace</div>
        <ol style={{ paddingLeft: "20pt", margin: 0 }}>
          {DECISION_RECORDS.map((d, i) => (
            <li key={i} className="print-avoid-break" style={{ marginBottom: "6pt", fontSize: "9.5pt" }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "8pt", color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: "6pt" }}>{d.type}</span>
              <strong>{d.title}</strong>
              <div style={{ color: "#52525b", marginTop: "2pt", lineHeight: 1.5 }}>{d.body}</div>
            </li>
          ))}
        </ol>
      </div>

      {/* Disclaimer */}
      <div className="print-section" style={{ marginTop: "20pt", paddingTop: "10pt", borderTop: "1pt solid #d4d4d8", fontSize: "8pt", color: "#71717a", lineHeight: 1.5 }}>
        <strong>Assumptions &amp; disclaimers.</strong> Cost estimates are derived from AWS Price List API data synced 2 hours prior to generation. Sizing reflects pattern defaults and the specified workload profile; actual usage will vary with traffic patterns, cache hit ratio, data growth, and region. Estimates exclude data transfer between availability zones, AWS Support tier charges, third-party software licensing, and any custom AMI/marketplace costs. Reserved-instance savings assume continuous utilization at modeled capacity. Generated by Stratoscope · web-app-3tier pattern v1.0.0.
      </div>
    </div>
  );
}

// Subcomponent: SVG content for the print diagram (always shows full topology)
function PrintDiagramContent({ sizing }) {
  const components = [
    { id: "users",   x: 220, y: 30,  w: 80,  h: 32, label: "Users",     kind: "external" },
    { id: "cf",      x: 200, y: 90,  w: 120, h: 38, label: "CloudFront", sub: "edge_cdn" },
    { id: "alb",     x: 200, y: 170, w: 120, h: 38, label: "ALB",       sub: "Multi-AZ · L7" },
    { id: "asg",     x: 50,  y: 260, w: 130, h: 56, label: "EC2 ASG",   sub: `${sizing.compute.instance} × ${sizing.compute.count}` },
    { id: "rds",     x: 200, y: 260, w: 130, h: 56, label: "RDS Postgres", sub: `${sizing.rds.instance.replace('db.', '')}${sizing.rds.replicas ? ' +' + sizing.rds.replicas + 'rr' : ''}` },
    { id: "cache",   x: 350, y: 260, w: 110, h: 56, label: "ElastiCache", sub: `Redis × ${sizing.cache.count}` },
    { id: "s3",      x: 50,  y: 360, w: 130, h: 38, label: "S3", sub: "static + uploads" },
    { id: "secrets", x: 350, y: 360, w: 110, h: 38, label: "Secrets", sub: "Manager" },
  ];
  const edges = [
    ["users", "cf"], ["cf", "alb"], ["alb", "asg"],
    ["asg", "rds"], ["asg", "cache"], ["asg", "s3"], ["asg", "secrets"]
  ];
  const compById = Object.fromEntries(components.map(c => [c.id, c]));
  const center = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

  return (
    <>
      <rect x="20" y="240" width="470" height="170" rx="6" fill="none" stroke="#a1a1aa" strokeWidth="1" strokeDasharray="3,3" />
      <text x="32" y="234" fill="#71717a" fontSize="9" fontFamily="JetBrains Mono">VPC · us-east-1 · 2 AZs</text>

      {edges.map((e, i) => {
        const a = center(compById[e[0]]);
        const b = center(compById[e[1]]);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a1a1aa" strokeWidth="1" markerEnd="url(#parrow)" />;
      })}

      {components.map(c => {
        const isExt = c.kind === "external";
        return (
          <g key={c.id}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="4"
              fill={isExt ? "transparent" : "#ffffff"}
              stroke={isExt ? "#a1a1aa" : "#d97706"}
              strokeOpacity={isExt ? 1 : 0.7}
              strokeWidth="1.2" />
            <text
              x={isExt ? c.x + c.w / 2 : c.x + 10}
              y={c.y + (c.sub ? 19 : c.h / 2 + 4)}
              fill={isExt ? "#52525b" : "#18181b"}
              fontSize="11" fontFamily="DM Sans" fontWeight="500"
              textAnchor={isExt ? "middle" : "start"}>
              {c.label}
            </text>
            {c.sub && (
              <text x={c.x + 10} y={c.y + 33} fill="#71717a" fontSize="9" fontFamily="JetBrains Mono">
                {c.sub}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [stage, setStage] = useState("initial"); // initial → user1 → agent1 → user2 → agent2_pre → tools → agent2_final → done
  const [chatItems, setChatItems] = useState([]); // {role, content, type}
  const [toolStatuses, setToolStatuses] = useState([]); // {idx, status, duration}
  const [placedCount, setPlacedCount] = useState(0);
  const [showCandidates, setShowCandidates] = useState(false);
  const [populated, setPopulated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userCount, setUserCount] = useState(500000);
  const [term, setTerm] = useState("on_demand");
  const [inputValue, setInputValue] = useState("");
  const [diagramView, setDiagramView] = useState("diagram"); // 'diagram' | 'rationale' | 'flow'
  const chatRef = useRef(null);

  // auto-scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatItems, toolStatuses, showCandidates, stage]);

  // SCENARIO ORCHESTRATION
  useEffect(() => {
    if (stage === "running_user1") {
      setChatItems(prev => [...prev, { role: "user", content: SCENARIO.user1 }]);
      setTimeout(() => setStage("running_agent1"), 400);
    }
    else if (stage === "running_agent1") {
      setChatItems(prev => [...prev, { role: "agent", content: SCENARIO.agent1, streaming: true }]);
      const dur = SCENARIO.agent1.length / 2 * 14 + 300;
      setTimeout(() => setStage("await_user2"), dur);
    }
    else if (stage === "running_user2") {
      setChatItems(prev => [...prev, { role: "user", content: SCENARIO.user2 }]);
      setTimeout(() => setStage("running_agent2_pre"), 400);
    }
    else if (stage === "running_agent2_pre") {
      setChatItems(prev => [...prev, { role: "agent", content: SCENARIO.agent2_pre, streaming: true }]);
      setTimeout(() => setStage("running_tools"), 800);
    }
    else if (stage === "running_tools") {
      // schedule tool calls
      const cumulative = [];
      let acc = 0;
      SCENARIO.toolCalls.forEach((tc, i) => {
        cumulative.push(acc);
        acc += tc.duration + 60;
      });
      // initial: all tools queued as 'running'
      SCENARIO.toolCalls.forEach((tc, i) => {
        // start each tool (mark running)
        setTimeout(() => {
          setToolStatuses(prev => [...prev, { idx: i, status: "running", duration: 0 }]);
          if (i === 0) setShowCandidates(false); // hide initially
        }, cumulative[i]);
        // finish each tool (mark done) and show side effects
        setTimeout(() => {
          setToolStatuses(prev => prev.map(s => s.idx === i ? { ...s, status: "done", duration: tc.duration } : s));
          if (tc.name === "match_pattern") {
            setShowCandidates(true);
            setPlacedCount(2); // users + cf
          }
          if (tc.name === "validate_sku") {
            setPlacedCount(p => Math.min(8, p + 1));
          }
          if (tc.name === "compute_cost") {
            setPopulated(true);
            setPlacedCount(8); // ensure all placed
          }
        }, cumulative[i] + tc.duration);
      });
      setTimeout(() => setStage("running_agent2_final"), acc + 200);
    }
    else if (stage === "running_agent2_final") {
      setChatItems(prev => [...prev, { role: "agent", content: SCENARIO.agent2_final, streaming: true }]);
      const dur = SCENARIO.agent2_final.length / 2 * 14 + 400;
      setTimeout(() => {
        setStage("done");
        setDrawerOpen(true);
      }, dur);
    }
  }, [stage]);

  const playScenario = () => {
    setChatItems([]);
    setToolStatuses([]);
    setPlacedCount(0);
    setShowCandidates(false);
    setPopulated(false);
    setDrawerOpen(false);
    setStage("running_user1");
  };

  const continueAfterClarify = () => {
    setStage("running_user2");
  };

  const reset = () => {
    setStage("initial");
    setChatItems([]);
    setToolStatuses([]);
    setPlacedCount(0);
    setShowCandidates(false);
    setPopulated(false);
    setDrawerOpen(false);
    setUserCount(500000);
  };

  const sizing = sizeForUsers(userCount);

  return (
    <div className="min-h-screen bg-white text-zinc-800 font-body relative overflow-hidden">
      <FontStyles />

      {/* HEADER */}
      <header className="border-b border-zinc-200 px-6 py-3 flex items-center justify-between bg-white relative z-10 no-print">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-zinc-950" />
            </div>
            <div>
              <div className="font-display text-lg leading-none">Stratoscope</div>
              <div className="font-mono text-3xs text-zinc-500 uppercase tracking-widest mt-0.5">cost · architecture · advisory</div>
            </div>
          </div>
          <div className="h-8 w-px bg-zinc-200" />
          <div className="flex items-center gap-1.5 text-2xs font-mono text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            <span>price data synced · 2h ago · effective 2026-04-29</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs font-mono text-zinc-400 uppercase tracking-wider">model</span>
          <span className="text-xs font-mono text-zinc-700">claude-opus-4-7</span>
          <button onClick={playScenario} disabled={stage !== "initial" && stage !== "done"} className="ml-3 px-3 py-1.5 text-xs font-mono bg-amber-100 hover:bg-amber-200 border border-amber-400 text-amber-700 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <Play className="w-3 h-3" />
            {stage === "done" ? "Replay" : "Play scenario"}
          </button>
          {populated && (
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-white rounded transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3 h-3" />
              Print report
            </button>
          )}
          {stage !== "initial" && (
            <button onClick={reset} className="px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-800 transition-colors">
              Reset
            </button>
          )}
        </div>
      </header>

      {/* MAIN — 3 columns */}
      <div className="grid grid-cols-12 main-grid" style={{ paddingBottom: drawerOpen ? "20rem" : "2.5rem" }}>
        {/* CHAT PANE */}
        <div className="col-span-4 border-r border-zinc-200 flex flex-col bg-white no-print">
          <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
            <span className="text-2xs font-mono uppercase tracking-wider text-zinc-500">Conversation</span>
            <span className="text-2xs font-mono text-zinc-400">{chatItems.length} turns</span>
          </div>

          <div ref={chatRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
            {stage === "initial" && (
              <div className="text-zinc-400 text-sm">
                <div className="mb-3 text-zinc-400">Welcome to Stratoscope.</div>
                <div className="text-xs leading-relaxed">
                  Describe a workload and the agent will gather requirements, match a curated AWS pattern, validate every SKU, and produce a defensible cost estimate.
                </div>
                <div className="mt-4 text-xs leading-relaxed text-zinc-500">
                  Click <span className="text-amber-600 font-mono">Play scenario</span> to see a complete run, or type below.
                </div>
              </div>
            )}

            {chatItems.map((m, i) => (
              <div key={i} className={`fade-in-up ${m.role === "user" ? "" : ""}`}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-2xs font-mono uppercase tracking-wider ${m.role === "user" ? "text-blue-700" : "text-amber-700"}`}>
                    {m.role === "user" ? "you" : "agent"}
                  </span>
                </div>
                <div className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
                  {m.streaming ? <StreamingText text={m.content} /> : <FormattedText text={m.content} />}
                </div>

                {/* render tool cards inline after the agent2_pre message */}
                {m.role === "agent" && i === chatItems.length - 1 && stage === "running_tools" && (
                  <div className="mt-3">
                    {toolStatuses.map(s => (
                      <ToolCallCard
                        key={s.idx}
                        name={SCENARIO.toolCalls[s.idx].name}
                        input={SCENARIO.toolCalls[s.idx].input}
                        status={s.status}
                        duration={s.duration}
                      />
                    ))}
                    {showCandidates && <PatternCandidatesInline candidates={PATTERN_CANDIDATES} />}
                  </div>
                )}
              </div>
            ))}

            {/* "Reply" button for the canned conversation */}
            {stage === "await_user2" && (
              <button
                onClick={continueAfterClarify}
                className="fade-in-up text-left w-full p-3 border border-dashed border-zinc-200 hover:border-amber-500 rounded transition-colors group"
              >
                <span className="text-2xs font-mono uppercase tracking-wider text-blue-600 group-hover:text-blue-700 block mb-1">click to reply →</span>
                <span className="text-sm text-zinc-400 group-hover:text-zinc-800 italic">"{SCENARIO.user2}"</span>
              </button>
            )}
          </div>

          {/* Input bar — disabled in mock mode */}
          <div className="border-t border-zinc-200 p-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded">
              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={stage === "initial" ? "Describe your workload, or click Play scenario above…" : "Type a follow-up… (mock — use Play scenario)"}
                className="flex-1 bg-transparent outline-none text-sm placeholder-zinc-400"
              />
              <button className="text-zinc-400 hover:text-zinc-400 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* DIAGRAM PANE */}
        <div className="col-span-5 border-r border-zinc-200 flex flex-col bg-white no-print">
          <div className="px-5 py-2.5 border-b border-zinc-200 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {[
                { id: "diagram", label: "Diagram" },
                { id: "rationale", label: "Rationale", disabled: !populated },
                { id: "flow", label: "Flow", disabled: !populated },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => !t.disabled && setDiagramView(t.id)}
                  disabled={t.disabled}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                    diagramView === t.id
                      ? "bg-amber-100 text-amber-700"
                      : t.disabled
                        ? "text-zinc-300 cursor-not-allowed"
                        : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {populated && (
              <div className="flex items-center gap-3 text-2xs font-mono text-zinc-500">
                <span className="text-amber-700">web-app-3tier@1.0.0</span>
                <span>·</span>
                <span>region us-east-1</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            {diagramView === "diagram" && (
              <div className="flex-1 grid-bg p-4 flex items-center justify-center min-h-0">
                <div className="w-full h-full max-w-2xl">
                  <ArchitectureDiagram placedCount={placedCount} sizing={sizing} />
                </div>
              </div>
            )}
            {diagramView === "rationale" && populated && <RationaleView />}
            {diagramView === "flow" && populated && <FlowView />}
          </div>

          {/* What-if slider — appears after population */}
          {populated && (
            <div className="border-t border-zinc-200 px-5 py-3 fade-in-up">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xs font-mono uppercase tracking-wider text-zinc-500">what-if · MAU</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-amber-700 text-sm tabular-nums">{userCount.toLocaleString()}</span>
                  <span className="text-2xs font-mono text-zinc-400">tier: {sizing.tier}</span>
                </div>
              </div>
              <input
                type="range"
                min="10000"
                max="5000000"
                step="10000"
                value={userCount}
                onChange={e => setUserCount(parseInt(e.target.value))}
                className="w-full accent-amber-600"
              />
              <div className="flex justify-between text-2xs font-mono text-zinc-400 mt-1">
                <span>10K</span>
                <span>1M</span>
                <span>5M</span>
              </div>
            </div>
          )}
        </div>

        {/* COST PANE */}
        <div className="col-span-3 flex flex-col bg-white no-print">
          <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
            <span className="text-2xs font-mono uppercase tracking-wider text-zinc-500">Cost estimate</span>
            {populated && <Check className="w-3 h-3 text-emerald-600" />}
          </div>
          <div className="flex-1 min-h-0">
            <CostPanel users={userCount} populated={populated} term={term} setTerm={setTerm} />
          </div>
        </div>
      </div>

      {/* DECISION DRAWER */}
      <DecisionDrawer open={drawerOpen} onToggle={() => setDrawerOpen(!drawerOpen)} populated={populated} />

      {/* Print-only report */}
      <PrintableReport populated={populated} userCount={userCount} term={term} sizing={sizing} />
    </div>
  );
}
