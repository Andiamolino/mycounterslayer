/* eslint-disable @typescript-eslint/no-explicit-any -- tests feed foreign-shaped data */
import defaultProjectJson from '#lib/data/defaultProject.json';
import type { Project, Tray } from '#lib/types/project.js';
import { buildPartPackage, validatePartPackage } from '#lib/utils/partPackage.js';
import {
  collectReferences,
  findDeadReferences,
  mapTrayReferences,
  resolveDefinitionId
} from '#lib/utils/partReferences.js';
import { describe, expect, it } from 'vitest';

// F1.5a/b edge cases: real start project, frozen/proxy input, JSON text, broken packages
const NOW = new Date('2026-11-06T10:00:00.000Z');

function startProject(): Project {
  return JSON.parse(JSON.stringify(defaultProjectJson)) as Project;
}

function allTrays(project: Project): Tray[] {
  return project.layers.flatMap((layer) => [...layer.looseTrays, ...layer.boxes.flatMap((box) => box.trays)]);
}

function build(project: Project, id: string) {
  const built = buildPartPackage(project, { kind: 'tray', id }, NOW);
  if (!built.ok) throw new Error(built.error.message);
  return built;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function projectWith(tray: Tray, extra: Partial<Project> = {}): Project {
  return {
    ...startProject(),
    layers: [{ id: 'l', name: 'L', boxes: [], looseTrays: [tray] }] as unknown as Project['layers'],
    ...extra
  };
}

describe('start project roundtrip (all tray types)', () => {
  const project = startProject();
  const trays = allTrays(project);

  it('covers all 6 tray types', () => {
    expect(new Set(trays.map((t) => t.type)).size).toBe(6);
  });

  it.each(trays.map((t) => [t.type, t.name, t.id]))(
    '%s "%s": build -> JSON text -> validate gives same package',
    (_t, _n, id) => {
      const built = build(project, id as string);
      expect(built.warnings).toEqual([]);
      const text = JSON.stringify(built.package);
      const validated = validatePartPackage(JSON.parse(text));
      expect(validated).toEqual({ ok: true, package: JSON.parse(text) });
      // no game container size, no unused definitions
      expect(text).not.toContain('gameContainer');
      const deps = built.package.dependencies;
      const used = new Set(collectReferences(built.package.part as Tray).map((r) => r.id));
      for (const d of [...deps.counterShapes, ...deps.cardSizes, ...deps.standees]) expect(used.has(d.id)).toBe(true);
    }
  );

  it('does not mutate the start project', () => {
    const copy = JSON.stringify(project);
    trays.forEach((t) => build(project, t.id));
    expect(JSON.stringify(project)).toBe(copy);
  });
});

describe('frozen and proxy input', () => {
  it('builds from a deeply frozen project', () => {
    const frozen = deepFreeze(startProject());
    for (const t of allTrays(frozen)) expect(() => build(frozen, t.id)).not.toThrow();
  });

  it('builds from a Proxy-wrapped project', () => {
    const wrap = <T extends object>(o: T): T =>
      new Proxy(o, {
        get(target, key, receiver) {
          const v = Reflect.get(target, key, receiver);
          return typeof v === 'object' && v !== null ? wrap(v) : v;
        }
      });
    const proxied = wrap(startProject());
    for (const t of allTrays(proxied)) {
      const built = build(proxied, t.id);
      expect(validatePartPackage(JSON.parse(JSON.stringify(built.package))).ok).toBe(true);
    }
  });

  it('validates a frozen raw package without changing it', () => {
    const project = startProject();
    const pkg = deepFreeze(JSON.parse(JSON.stringify(build(project, allTrays(project)[0].id).package)));
    expect(validatePartPackage(pkg).ok).toBe(true);
  });

  it('mapTrayReferences leaves a frozen tray untouched and returns a distinct copy', () => {
    const tray = deepFreeze(allTrays(startProject()).find((t) => t.type === 'counter')!);
    const before = JSON.stringify(tray);
    const copy = mapTrayReferences(tray, (r) => `x-${r.id}`);
    expect(JSON.stringify(tray)).toBe(before);
    expect(copy).not.toBe(tray);
    expect(copy.params).not.toBe(tray.params);
  });
});

describe('references edge cases', () => {
  const cardDivider = (id: string) =>
    ({
      id: 'd',
      name: 'D',
      color: '#fff',
      type: 'cardDivider',
      params: { stacks: [{ cardSizeId: id, count: 3 }], wallThickness: 2 }
    }) as unknown as Tray;

  it('cardDivider referencing a card size by name is dead (ID only)', () => {
    const project = projectWith(cardDivider('Standard'));
    const built = build(project, 'd');
    expect(built.warnings).toEqual([{ kind: 'cardSize', id: 'Standard', path: 'params.stacks[0].cardSizeId' }]);
    expect((built.package.part as any).params.stacks[0].cardSizeId).toBe('Standard');
    expect(built.package.dependencies.cardSizes).toEqual([]);
    const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
    expect(!validated.ok && validated.error.code).toBe('missingDefinition');
  });

  it('cardWell referencing by name is dead and cell missing is reported', () => {
    const tray = {
      id: 'w',
      name: 'W',
      color: '#fff',
      type: 'cardWell',
      params: { layout: { columns: [['a']] }, stacks: [{ id: 's', cellId: 'zzz', cardSizeId: 'Standard', count: 1 }] }
    } as unknown as Tray;
    const dead = findDeadReferences(tray, startProject());
    expect(dead.map((d) => d.kind).sort()).toEqual(['cardSize', 'cell']);
  });

  it('a definition used by two stacks and two trays appears once', () => {
    const project = startProject();
    const std = project.cardSizes[0].id;
    const tray = cardDivider(std);
    (tray as any).params.stacks.push({ cardSizeId: std, count: 1 }, { cardSizeId: 'Standard', count: 1 });
    const built = build(projectWith(tray, { cardSizes: project.cardSizes }), 'd');
    expect(built.package.dependencies.cardSizes).toHaveLength(1);
  });

  it('counter: same shape in top and edge stacks is one dependency', () => {
    const project = startProject();
    const id = project.counterShapes[0].id;
    const tray = {
      id: 'c',
      name: 'C',
      color: '#fff',
      type: 'counter',
      params: {
        topLoadedStacks: [
          [id, 1, 'A'],
          [id, 2]
        ],
        edgeLoadedStacks: [[project.counterShapes[0].name, 3, 'Horizontal']]
      }
    } as unknown as Tray;
    const built = build(projectWith(tray, { counterShapes: project.counterShapes }), 'c');
    expect(built.package.dependencies.counterShapes.map((s) => s.id)).toEqual([id]);
    expect((built.package.part as any).params.edgeLoadedStacks[0][0]).toBe(id);
  });

  it('ID wins over a name that is the ID of another definition', () => {
    const defs = {
      counterShapes: [
        { id: 'A', name: 'B' },
        { id: 'B', name: 'A' }
      ],
      cardSizes: [],
      standees: []
    } as any;
    expect(resolveDefinitionId(defs, 'counterShape', 'A')).toBe('A');
    expect(resolveDefinitionId(defs, 'counterShape', 'B')).toBe('B');
  });

  it('duplicate names resolve to the first definition', () => {
    const defs = {
      counterShapes: [
        { id: '1', name: 'X' },
        { id: '2', name: 'X' }
      ],
      cardSizes: [],
      standees: []
    } as any;
    expect(resolveDefinitionId(defs, 'counterShape', 'X')).toBe('1');
  });

  it('names are exact: whitespace and case matter, unicode works', () => {
    const defs = {
      counterShapes: [
        { id: '1', name: 'Größe ✓ 六角' },
        { id: '2', name: ' pad ' }
      ],
      cardSizes: [],
      standees: []
    } as any;
    expect(resolveDefinitionId(defs, 'counterShape', 'Größe ✓ 六角')).toBe('1');
    expect(resolveDefinitionId(defs, 'counterShape', 'größe ✓ 六角')).toBeNull();
    expect(resolveDefinitionId(defs, 'counterShape', ' pad ')).toBe('2');
    expect(resolveDefinitionId(defs, 'counterShape', 'pad')).toBeNull();
    expect(resolveDefinitionId(defs, 'counterShape', ' ')).toBeNull(); // whitespace is not "empty"
  });

  it('name ref equal to Object.prototype keys is dead, not a crash', () => {
    const defs = { counterShapes: [], cardSizes: [], standees: [] } as any;
    for (const key of ['__proto__', 'constructor', 'toString']) {
      expect(resolveDefinitionId(defs, 'counterShape', key)).toBeNull();
    }
  });

  it('malformed trays do not throw in the visitor', () => {
    const odd: any[] = [
      { type: 'counter', params: null },
      { type: 'counter', params: { topLoadedStacks: 'x', edgeLoadedStacks: [null, 5, []] } },
      { type: 'cardDivider', params: { stacks: [null, 'a', 3] } },
      { type: 'cardWell', params: { stacks: {} } },
      { type: 'cardWell', params: { layout: null, stacks: [{ cellId: 'a' }] } },
      { type: 'standee' },
      { type: 'cup', params: {} }
    ];
    for (const t of odd) {
      expect(() => collectReferences(t)).not.toThrow();
      expect(() => findDeadReferences(t, startProject())).not.toThrow();
    }
  });

  it('empty reference stays empty and creates no dependency or warning', () => {
    const tray = { id: 's', name: 'S', color: '#fff', type: 'standee', params: { standeeId: '' } } as unknown as Tray;
    const built = build(projectWith(tray), 's');
    expect(built.warnings).toEqual([]);
    expect(built.package.dependencies.standees).toEqual([]);
    expect(validatePartPackage(JSON.parse(JSON.stringify(built.package))).ok).toBe(true);
  });
});

describe('names and unicode', () => {
  it.each([
    ['  Spaced  ', '  Spaced  '],
    ['', 'Unnamed tray'],
    ['\t\n', 'Unnamed tray'],
    ['Ärger 🎲 六角', 'Ärger 🎲 六角']
  ])('tray name %j -> %j', (input, expected) => {
    const project = projectWith({ ...allTrays(startProject()).find((t) => t.type === 'cup')!, id: 'u', name: input });
    const built = build(project, 'u');
    expect((built.package.part as Tray).name).toBe(expected);
    const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
    expect(validated.ok && (validated.package.part as Tray).name).toBe(expected);
  });

  it('non-string name in project does not throw', () => {
    const tray = { ...allTrays(startProject())[0], id: 'n', name: 42 } as unknown as Tray;
    expect((build(projectWith(tray), 'n').package.part as Tray).name).toBe('Unnamed tray');
  });
});

describe('broken packages (validatePartPackage)', () => {
  const base = () => {
    const project = startProject();
    return JSON.parse(JSON.stringify(build(project, allTrays(project).find((t) => t.type === 'cardWell')!.id).package));
  };

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['number', 5],
    ['empty object', {}]
  ])('top level %s is rejected without throwing', (_n, raw) => {
    expect(validatePartPackage(raw).ok).toBe(false);
  });

  it.each([
    ['part null', (p: any) => (p.part = null)],
    ['part array', (p: any) => (p.part = [])],
    ['part string', (p: any) => (p.part = 'x')],
    ['params null', (p: any) => (p.part.params = null)],
    ['params array', (p: any) => (p.part.params = [])],
    ['id empty', (p: any) => (p.part.id = '  ')],
    ['name number', (p: any) => (p.part.name = 1)],
    ['color missing', (p: any) => delete p.part.color],
    ['type unknown', (p: any) => (p.part.type = 'card')],
    ['type __proto__', (p: any) => (p.part.type = '__proto__')],
    ['type constructor', (p: any) => (p.part.type = 'constructor')],
    ['stacks object', (p: any) => (p.part.params.stacks = {})],
    ['stack null', (p: any) => (p.part.params.stacks = [null])],
    ['columns missing', (p: any) => delete p.part.params.layout.columns],
    ['column with number', (p: any) => (p.part.params.layout.columns = [[1]])],
    ['rotation 45', (p: any) => (p.part.params.stacks[0].rotation = 45)],
    ['wallThickness string', (p: any) => (p.part.params.wallThickness = '2')],
    ['wallThickness Infinity', (p: any) => (p.part.params.wallThickness = Infinity)],
    ['dependencies array', (p: any) => (p.dependencies = [])],
    ['dependencies null', (p: any) => (p.dependencies = null)],
    ['cardSizes object', (p: any) => (p.dependencies.cardSizes = {})]
  ])('%s -> ok:false, never throws', (_n, mutate) => {
    const pkg = base();
    mutate(pkg);
    let result: ReturnType<typeof validatePartPackage> | undefined;
    expect(() => (result = validatePartPackage(pkg))).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it('JSON text with duplicate dependency IDs is rejected', () => {
    const pkg = base();
    pkg.dependencies.cardSizes.push({ ...pkg.dependencies.cardSizes[0] });
    const r = validatePartPackage(JSON.parse(JSON.stringify(pkg)));
    expect(!r.ok && r.error.code).toBe('invalidDependencies');
  });

  it('__proto__ key in JSON text does not pollute and does not crash', () => {
    const text = JSON.stringify(base()).replace('"params":{', '"params":{"__proto__":{"polluted":true},');
    const r = validatePartPackage(JSON.parse(text));
    expect(({} as any).polluted).toBeUndefined();
    if (r.ok) expect(({} as any).polluted).toBeUndefined();
  });

  it('package with functions/symbols is invalidData', () => {
    const pkg = base();
    pkg.part.fn = () => 1;
    const r = validatePartPackage(pkg);
    expect(!r.ok && r.error.code).toBe('invalidData');
  });

  it('layer packages stay unsupported', () => {
    const r = validatePartPackage({ ...base(), kind: 'layer' });
    expect(!r.ok && r.error.code).toBe('unsupportedKind');
    expect(buildPartPackage(startProject(), { kind: 'layer', id: 'x' }, NOW)).toMatchObject({ ok: false });
  });

  it('cup tree depth boundary: 100 ok, 101+ rejected', () => {
    const tree = (depth: number): any => {
      let node: any = { type: 'cup', id: 'leaf' };
      for (let i = 0; i < depth; i++)
        node = { type: 'split', direction: 'vertical', ratio: 0.5, first: node, second: { type: 'cup', id: 'c' } };
      return node;
    };
    const cupPkg = (depth: number) => {
      const project = startProject();
      const pkg = JSON.parse(
        JSON.stringify(build(project, allTrays(project).find((t) => t.type === 'cup')!.id).package)
      );
      pkg.part.params.layout.root = tree(depth);
      return pkg;
    };
    expect(validatePartPackage(cupPkg(100)).ok).toBe(true);
    expect(validatePartPackage(cupPkg(101)).ok).toBe(false);
    for (const depth of [2000, 20000]) {
      let r: ReturnType<typeof validatePartPackage> | undefined;
      expect(() => (r = validatePartPackage(cupPkg(depth))), `depth ${depth}`).not.toThrow();
      expect(r!.ok).toBe(false);
    }
  });

  it('numbers: 0, negative and huge values pass the structure check (no range check)', () => {
    for (const value of [0, -5, 1e300]) {
      const pkg = base();
      pkg.part.params.wallThickness = value;
      expect(validatePartPackage(pkg).ok, String(value)).toBe(true);
    }
  });

  it('null numeric params (JSON of NaN) are tolerated', () => {
    const pkg = base();
    pkg.part.params.wallThickness = null;
    expect(validatePartPackage(pkg).ok).toBe(true);
  });
});

describe('buildPartPackage never throws', () => {
  it.each([
    ['empty layers', { layers: [] }],
    ['layers undefined', {}],
    ['null layer/box/tray entries', { layers: [null, { boxes: [null, { trays: [null] }], looseTrays: [null] }] }],
    ['boxes undefined', { layers: [{ looseTrays: [] }] }]
  ])('%s -> notFound', (_n, partial) => {
    const r = buildPartPackage({ ...startProject(), ...partial } as any, { kind: 'tray', id: 'x' }, NOW);
    expect(!r.ok && r.error.code).toBe('notFound');
  });

  it('tray with null params still builds', () => {
    const tray = { id: 't', name: 'T', color: '#fff', type: 'counter', params: null } as unknown as Tray;
    expect(() => build(projectWith(tray), 't')).not.toThrow();
  });
});
