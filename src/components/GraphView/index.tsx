import { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '@/stores/graphStore';
import { useTabStore } from '@/stores/tabStore';
import { useEditorStore } from '@/stores/editorStore';
import { pathUtils } from '@/lib/pathUtils';
import { X, RefreshCw, Link2, Sparkles, Palette } from 'lucide-react';

interface Props { onClose: () => void; }

// ── Score → HSL color (red 0° → yellow 60° → green 120°) ──────────────────
// Uses a natural-log curve so that realistic mid-range scores (0.4 – 0.6)
// land in the yellow/green band rather than the orange/red zone.
// Mapping: log₁p(score × (e−1))  →  [0, 1] for score ∈ [0, 1]
//   0.0 → 0.00 (hue   0° — red)
//   0.3 → 0.42 (hue  50° — yellow-orange)
//   0.5 → 0.62 (hue  74° — yellow-green)
//   0.7 → 0.79 (hue  95° — green)
//   1.0 → 1.00 (hue 120° — pure green)
function scoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  const t = Math.log1p(clamped * (Math.E - 1)); // ln(1 + score*(e-1)), range [0,1]
  return `hsl(${Math.round(t * 120)}, 70%, 52%)`;
}

export default function GraphView({ onClose }: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const { nameToPath, edges } = useGraphStore();
  const { openTab, tabs, activeTabId } = useTabStore();
  const { loadFile } = useEditorStore();
  const activeTab = tabs.find(t => t.id === activeTabId);

  const [showWiki,     setShowWiki]     = useState(true);
  const [showSemantic, setShowSemantic] = useState(true);
  const [colorByScore, setColorByScore] = useState(false);
  // semThreshold: visual filter — only semantic edges ≥ this score are drawn
  const [semThreshold, setSemThreshold] = useState(0.3);

  const draw = useCallback(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const paths     = Array.from(nameToPath.values());
    const pathIndex = new Map(paths.map((p, i) => [p, i]));

    const nodes = paths.map((p) => ({
      id: p, x: 0, y: 0, vx: 0, vy: 0,
      fx: null as number | null, fy: null as number | null,
    }));

    // Filter edges: toggle state + semantic threshold
    const visibleEdges = edges.filter((e) => {
      if (!pathIndex.has(e.from) || !pathIndex.has(e.to)) return false;
      if (e.kind === 'wiki')     return showWiki;
      if (e.kind === 'semantic') return showSemantic && (e.score ?? 0) >= semThreshold;
      return false;
    });

    const links = visibleEdges.map((e) => ({
      source: pathIndex.get(e.from)!,
      target: pathIndex.get(e.to)!,
      kind:   e.kind,
      score:  e.score ?? 0,
    }));

    const width  = svgRef.current.clientWidth  || 900;
    const height = svgRef.current.clientHeight || 600;

    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).distance((d: any) => d.kind === 'semantic' ? 120 : 70).strength(0.4))
      .force('charge',    d3.forceManyBody().strength(-130))
      .force('center',    d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(20));

    const g = svg.append('g');

    // ── Zoom + pan ──────────────────────────────────────────────────────────
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 5])
        .on('zoom', (e) => g.attr('transform', e.transform)),
    );

    // ── SVG markers ─────────────────────────────────────────────────────────
    const defs = svg.append('defs');

    // Wiki arrow — fixed color
    defs.append('marker')
      .attr('id', 'arr-wiki').attr('viewBox', '0 -4 8 8')
      .attr('refX', 14).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'var(--border)');

    // Semantic arrow — context-stroke so it inherits each line's stroke color
    defs.append('marker')
      .attr('id', 'arr-sem').attr('viewBox', '0 -4 8 8')
      .attr('refX', 14).attr('refY', 0).attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'context-stroke');

    // ── Wiki edges ──────────────────────────────────────────────────────────
    const wikiLinks = links.filter((l) => l.kind === 'wiki');
    const semLinks  = links.filter((l) => l.kind === 'semantic');

    const wikiLine = g.append('g').selectAll('line').data(wikiLinks).join('line')
      .attr('stroke',         'var(--border)')
      .attr('stroke-width',   1.2)
      .attr('stroke-opacity', 0.55)
      .attr('marker-end',     'url(#arr-wiki)');

    // ── Semantic edges — color and width driven by score when colorByScore ──
    const semLine = g.append('g').selectAll('line').data(semLinks).join('line')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr('stroke', (d: any) => colorByScore ? scoreColor(d.score) : 'var(--accent)')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr('stroke-width', (d: any) => colorByScore ? 0.7 + d.score * 1.8 : 1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr('stroke-opacity', (d: any) => colorByScore ? 0.55 + d.score * 0.35 : 0.35)
      .attr('stroke-dasharray', '4 3')
      .attr('marker-end', 'url(#arr-sem)');

    // ── Nodes ───────────────────────────────────────────────────────────────
    const node = g.append('g').selectAll('circle').data(nodes).join('circle')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr('r',      (d: any) => d.id === activeTab?.path ? 9 : 6)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr('fill',   (d: any) => d.id === activeTab?.path ? 'var(--accent)' : 'var(--bg-elevated)')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .attr('stroke', (d: any) => d.id === activeTab?.path ? 'var(--accent-hover)' : 'var(--border)')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, d3.SimulationNodeDatum>()
          .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('click', async (_ev: any, d: any) => {
        const content = await loadFile(d.id);
        openTab(d.id, content);
        onClose();
      });

    // ── Labels ──────────────────────────────────────────────────────────────
    const label = g.append('g').selectAll('text').data(nodes).join('text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .text((d: any) => pathUtils.stem(d.id))
      .attr('font-size', 10).attr('fill', 'var(--text-secondary)')
      .attr('dy', -10).attr('text-anchor', 'middle').attr('pointer-events', 'none');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.append('title').text((d: any) => pathUtils.basename(d.id));

    sim.on('tick', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x1 = (d: any) => d.source.x, y1 = (d: any) => d.source.y;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x2 = (d: any) => d.target.x, y2 = (d: any) => d.target.y;
      wikiLine.attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      semLine .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node .attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      label.attr('x',  (d: any) => d.x).attr('y',  (d: any) => d.y);
    });
  }, [nameToPath, edges, activeTab?.path, loadFile, openTab, onClose,
      showWiki, showSemantic, colorByScore, semThreshold]);

  useEffect(() => { draw(); }, [draw]);

  // ── Counts for display ───────────────────────────────────────────────────
  const wikiCount    = edges.filter(e => e.kind === 'wiki').length;
  const allSemEdges  = edges.filter(e => e.kind === 'semantic');
  const visSemCount  = allSemEdges.filter(e => (e.score ?? 0) >= semThreshold).length;

  return (
    <div className="graph-overlay">

      {/* ── Header row 1: toggles + legend + actions ─────────────────────── */}
      <div className="graph-header">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Knowledge Graph</span>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 12 }}>
          {/* Wiki toggle */}
          <button
            onClick={() => setShowWiki(v => !v)}
            title={`Wiki-links (${wikiCount})`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              borderRadius: 4, border: '1px solid var(--border)',
              background: showWiki ? 'var(--bg-active)' : 'none',
              color: showWiki ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 11,
            }}
          >
            <Link2 size={11} /><span>Links</span>
            <span style={{ opacity: 0.6 }}>{wikiCount}</span>
          </button>

          {/* Semantic toggle */}
          <button
            onClick={() => setShowSemantic(v => !v)}
            title={`Semantic edges (${visSemCount}/${allSemEdges.length})`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              borderRadius: 4, border: '1px solid var(--border)',
              background: showSemantic ? 'var(--bg-active)' : 'none',
              color: showSemantic ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 11,
            }}
          >
            <Sparkles size={11} /><span>Semantic</span>
            <span style={{ opacity: 0.6 }}>{visSemCount}/{allSemEdges.length}</span>
          </button>

          {/* Color-by-score toggle — only useful when semantic is on */}
          {showSemantic && (
            <button
              onClick={() => setColorByScore(v => !v)}
              title="Color edges by similarity score (green = strong, red = weak)"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                borderRadius: 4, border: '1px solid var(--border)',
                background: colorByScore ? 'var(--bg-active)' : 'none',
                color: colorByScore ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11,
              }}
            >
              <Palette size={11} />
              <span>Color</span>
            </button>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center',
          fontSize: 10, color: 'var(--text-muted)',
        }}>
          {showWiki && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="20" height="8">
                <line x1="0" y1="4" x2="20" y2="4" stroke="var(--border)" strokeWidth="1.5"/>
              </svg>
              Wiki
            </span>
          )}
          {showSemantic && !colorByScore && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="20" height="8">
                <line x1="0" y1="4" x2="20" y2="4"
                  stroke="var(--accent)" strokeWidth="1.5"
                  strokeDasharray="4 3" strokeOpacity="0.7"/>
              </svg>
              Semantic
            </span>
          )}
          {showSemantic && colorByScore && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="52" height="8">
                <defs>
                  <linearGradient id="score-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="hsl(0,70%,52%)"/>
                    <stop offset="38%"  stopColor="hsl(60,70%,52%)"/>
                    <stop offset="100%" stopColor="hsl(120,70%,52%)"/>
                  </linearGradient>
                </defs>
                <line x1="0" y1="4" x2="52" y2="4"
                  stroke="url(#score-grad)" strokeWidth="2.5"
                  strokeDasharray="4 3"/>
              </svg>
              low → high
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
          <button className="icon-btn" onClick={draw} title="Redraw"><RefreshCw size={14}/></button>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={14}/></button>
        </div>
      </div>

      {/* ── Header row 2: threshold slider (only when semantic is enabled) ── */}
      {showSemantic && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '5px 14px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
        }}>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Min similarity
          </span>

          {/* Gradient track container */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 220, height: 18, display: 'flex', alignItems: 'center' }}>
            {/* Coloured background track */}
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2,
              background: 'linear-gradient(to right, hsl(0,70%,52%) 0%, hsl(60,70%,52%) 38%, hsl(120,70%,52%) 100%)',
              opacity: 0.85,
              pointerEvents: 'none',
            }} />
            <input
              type="range"
              min={0.1} max={0.99} step={0.01}
              value={semThreshold}
              onChange={e => setSemThreshold(Number(e.target.value))}
              className="graph-sem-slider"
              style={{ width: '100%', position: 'relative' }}
            />
          </div>

          {/* Current value badge — colored to match position on gradient */}
          <span style={{
            fontWeight: 700, fontSize: 12, minWidth: 32, textAlign: 'right',
            color: scoreColor(semThreshold),
          }}>
            {semThreshold.toFixed(2)}
          </span>

          {/* Edge count feedback */}
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {visSemCount} / {allSemEdges.length} edges
          </span>
        </div>
      )}

      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: showSemantic ? 'calc(100% - 76px)' : 'calc(100% - 44px)',
          background: 'var(--bg-base)',
        }}
      />
    </div>
  );
}
