import { describe, expect, it } from 'vitest';
import { develop, parseGenome, printGenome, plantMesh, STARTERS, ELMSHADE, crownPoints, noneAllele, interpret, shootFrame, GENE_DEFAULTS } from '../src/podl';

const starters = () => STARTERS.map(s => parseGenome(s));

describe('PODL language', () => {
  it('parses every starter', () => {
    for (const g of starters()) expect(g.loci.length).toBeGreaterThan(10);
  });

  it('round-trips through printGenome', () => {
    for (const g of starters()) expect(parseGenome(printGenome(g))).toEqual(g);
  });

  it('reports the line of a syntax error', () => {
    expect(() => parseGenome('plant "X"\nchromosome 1\n  num A @1 : a/a\n    a = 1 +')).toThrow(/Line 4/);
  });
});

describe('development', () => {
  it('grows shoot, organs and roots for every starter', () => {
    for (const g of starters()) {
      const m = plantMesh(develop(g, { seed: 1 }));
      expect(m.stats.height, g.name).toBeGreaterThan(0.2);
      expect(m.stats.rootDepth, g.name).toBeGreaterThan(0.05);
      expect(Object.keys(m.stats.organs).length, g.name).toBeGreaterThan(1);
      expect(m.stats.truncated, g.name).toBe(false);
    }
  });

  it('is deterministic for a given seed', () => {
    const g = starters()[0];
    const a = plantMesh(develop(g, { seed: 7 })), b = plantMesh(develop(g, { seed: 7 }));
    expect(a.pos).toEqual(b.pos);
    expect(a.roots.pos).toEqual(b.roots.pos);
  });

  it('dominance decides the expressed allele', () => {
    // Fernwort leaf C/s: C (dom 2) is a compound chain of leaflets, s is a single scaled leaflet
    const g = starters()[0];
    const leaf = g.loci.find(l => l.name === 'leaf')!;
    const tris = () => develop(g, { seed: 1 }).templates.leaf!.mesh.idx.length;
    const het = tris();
    leaf.alleles = [leaf.alleles[1], leaf.alleles[1]];
    expect(tris()).toBeLessThan(het);
  });
});

describe('space colonization', () => {
  const elmshade = () => parseGenome(ELMSHADE);

  it('grows the crown into the attraction points and uses them up', () => {
    const d = develop(elmshade(), { seed: 1 });
    const all = crownPoints(d.gene, 1);
    expect(all.length).toBe(3000);
    expect(d.crown.length).toBeLessThan(all.length * 0.7);
    expect(Math.max(...d.segments.map(s => s.p1[1]))).toBeGreaterThan(6);
  });

  it('gives buds no space without a crown', () => {
    const g = elmshade();
    g.loci.find(l => l.name === 'CROWN_PTS')!.alleles = [noneAllele(), noneAllele()];
    const d = develop(g, { seed: 1 });
    expect(d.crown.length).toBe(0);
    expect(d.organs.filter(o => o.name === 'fruit').length).toBe(1); // the apex fruits atop the bole
  });

  it('> turns the heading toward the bud\'s free space', () => {
    const gene = (n: string) => GENE_DEFAULTS[n] ?? 0;
    const mod = (s: string, extra = {}) => ({ s, age: 9, order: 0, j: 0.5, j2: 0.5, ...extra });
    const sk = interpret([mod('>', { val: 1, dir: [1, 0, 0] }), mod('F', { val: 1 })], { ...shootFrame(gene), tropism: 0 }, gene);
    expect(sk.segments[0].p1[0]).toBeCloseTo(1);
    expect(sk.segments[0].p1[1]).toBeCloseTo(0);
  });

  it('is deterministic for a given seed', () => {
    const a = plantMesh(develop(elmshade(), { seed: 4 })), b = plantMesh(develop(elmshade(), { seed: 4 }));
    expect(a.pos).toEqual(b.pos);
  }, 30000);
});

describe('developmental clock', () => {
  const fern = () => parseGenome(STARTERS[0]);
  const setNum = (g: ReturnType<typeof fern>, name: string, src: string) => {
    const allele = { id: 'c', dom: 1, src };
    const l = g.loci.find(l => l.name === name);
    if (l) l.alleles = [allele, { ...allele }];
    else g.loci.push({ name, kind: 'num', chrom: '9', pos: g.loci.length, alleles: [allele, { ...allele }] });
  };

  it('reads the step count from $STEPS, capped by the host and overridden by options', () => {
    const g = fern();
    setNum(g, 'STEPS', '5');
    expect(develop(g).steps).toBe(5);
    setNum(g, 'STEPS', '500');
    expect(develop(g, { maxSteps: 7 }).steps).toBe(7);
    expect(develop(g, { steps: 3 }).steps).toBe(3);
  });

  it('$THICKEN 0 stops secondary thickening', () => {
    const g = fern();
    const base = () => develop(g, { seed: 1 }).segments[0].r0;
    const thick = base();
    setNum(g, 'THICKEN', '0');
    expect(base()).toBeLessThan(thick);
    expect(base()).toBeCloseTo(develop(g).gene('STEM_W'));
  });

  it('$MATURE sets how many steps an organ takes to reach full size', () => {
    const g = fern();
    setNum(g, 'MATURE', '1');
    const full = develop(g, { seed: 1 }).organs;
    setNum(g, 'MATURE', '10');
    const slow = develop(g, { seed: 1 }).organs;
    expect(slow.length).toBe(full.length);
    slow.forEach((o, i) => expect(o.s).toBeCloseTo(full[i].s * Math.min(1, (o.age + 1) / 10)));
  });
});
