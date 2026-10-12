# Fase 0 — Andamiaje y motor de bioquímica

Documento de desarrollo de la Fase 0 de **Creatures**: andamiaje TypeScript + Vite,
contratos entre módulos y el motor de bioquímica determinista.

## Cómo levantarlo

```bash
npm ci              # instala exactamente lo fijado por package-lock.json
npm run dev         # servidor de desarrollo con HMR (abre index.html)
npm test            # suite Vitest completa
npm run typecheck   # tsc --noEmit — 0 errores
npm run build       # empaqueta en dist/
```

Requisitos: Node ≥ 20 (probado con v24). `package.json` usa `"type": "module"`.

## Mapa de carpetas

```
creatures/
├── index.html            # shell del canvas (entrada de Vite)
├── package.json          # scripts: dev / build / typecheck / test
├── tsconfig.json         # strict, moduleResolution: bundler, noEmit
├── vite.config.ts        # build → dist/
├── docs/FASE0.md         # este documento
├── src/
│   ├── main.ts           # composición del runtime, snapshots y UI de drives/vocabulario
│   ├── contracts/        # CONTRATOS (interfaces tipo acuerdo entre módulos)
│   │   ├── types.ts      # DriveId, DriveState, ChemicalId, TickResult
│   │   ├── ibrain.ts     # IBrain { think(inputs) → BrainOutput }
│   │   ├── ibiochem.ts   # IBiochem { tick, getDrive, getChemical }
│   │   ├── ivisuals.ts   # IVisuals (puerto Canvas de solo lectura)
│   │   ├── igenome.ts    # IGenome + PhenotypeConfig
│   │   └── ivocab.ts     # IVocab (palabra → estímulo, con olvido)
│   ├── brain/
│   │   ├── brainv05-types.ts # contrato estructural del modelo v0.5
│   │   ├── adapter.ts       # BrainV05Adapter: BrainInputs → BrainV05Like
│   │   ├── runtime.ts       # conecta Genome, fenotipo y adaptador
│   │   ├── brain-v05.ts     # CEREBRO REAL: MLP + ε-greedy + Hebbiano (docs/CEREBRO.md)
│   │   ├── actions.ts       # espacio de acciones (codebook escalar en [-1, 1])
│   │   ├── reward.ts        # malestar y recompensa por reducción de drive
│   │   └── placeholder-brain.ts # cerebro neutro, solo para tests
│   ├── genome/          # genes extensibles, PRNG, mutación y fenotipo
│   ├── vocab/            # Vocabulary implements IVocab
│   ├── visuals/
│   │   └── canvasVisuals.ts # paths de Bichito, estados de ánimo y animación procedural
│   └── biochem/          # MOTOR de bioquímica (Fase 0 + capa phenotype)
│       ├── driveTable.ts # tabla extensible de drives (los 8 + registerDrive)
│       ├── chemicals.ts  # registro de químicos (6 + registerChemical)
│       ├── reactions.ts  # reacciones A→B y acoplamientos drive↔chemical
│       ├── engine.ts     # BiochemEngine implements IBiochem
│       └── index.ts      # API pública
└── tests/                # vitest (corren con `npm test`)
```

## Contratos: quién consume qué

| Contrato | Quién lo implementa | Quién lo consume |
|---|---|---|
| `IBiochem` (`src/contracts/ibiochem.ts`) | **Yo (Fase 0)** → `biochem/engine.ts` | cerebro (inputs por tick) y visuales (snapshot para dibujar) |
| `IBrain` (`src/contracts/ibrain.ts`) | `BrainV05Adapter` sobre `BrainV05Like`; la app usa el cerebro real `BrainV05` (MLP + ε-greedy + Hebbiano) | `main.ts` le pasa snapshots de drives/químicos, mapea genes y lo refuerza (premio/castigo y reducción de malestar) |
| `IVisuals` (`src/contracts/ivisuals.ts`) | `visuals/canvasVisuals.ts` (`CanvasVisuals`) — port de Bichito a Canvas 2D | `main.ts` le pasa snapshots; el render nunca toca la simulación |
| Genoma y palabras | `Genome` (`src/genome/`) y `Vocabulary` (`src/vocab/`) | el runtime aplica fenotipo al motor; la UI enseña vocabulario; su codificación cerebral sigue pendiente |

Regla común: los contratos son interfaces pequeñas; cada módulo es sustituible
implementando su interfaz. El cerebro y el render **leen** snapshots; solo el
motor escribe estado de simulación.

## Motor de bioquímica

### Tabla extensible de drives (8 en Fase 0)

`src/biochem/driveTable.ts` — registro (`registerDrive`) con
`{ id, label, decayPerSecond, clamp, influences }`:

| id | deriva intrínseca/s | acoplamientos (gain × nivel del químico) |
|---|---|---|
| `hambre` | +0.03 | glucosa −2.5 (baja si glucosa alta) |
| `energia` | −0.02 | glucosa +2.0, adenosina −1.5 |
| `sueno` | +0.02 | adenosina +2.5 |
| `curiosidad` | −0.01 | dopamina +2.0, adenosina −0.5 |
| `vinculo` | −0.01 | oxitocina +2.0 |
| `aburrimiento` | +0.02 | dopamina −2.0, serotonina −0.5 |
| `miedo` | −0.03 | cortisol +2.5 |
| `confort` | −0.01 | serotonina +1.5, oxitocina +1.0, cortisol −1.0 |

**Añadir un drive = una llamada a `registerDrive({…})`** antes de construir
`BiochemEngine`. No se toca `engine.ts` (test: `tests/extensibility.test.ts`).

### Químicos (6)

`glucosa` (0.05), `adenosina` (0.08), `dopamina` (0.15), `cortisol` (0.12),
`oxitocina` (0.06), `serotonina` (0.04) — números son constantes de
decaimiento exponencial por segundo. Nivel siempre 0..1.

### Reacciones (`reactions.ts`), deterministas, sin aleatoriedad

Químicas (primer orden A→B, `Δ = A·(1 − e^(−k·dt))`):

- `dopamina → oxitocina` (k = 0.05)
- `oxitocina → serotonina` (k = 0.04)
- `adenosina → cortisol` (k = 0.03)

Acoplamientos drive↔chemical: los datos viven en `driveTable` (`influences`);
la función `couplingRate(drive, químicos)` calcula la derivada total
`derivaIntrínseca + Σ gain·nivel`. Ejemplos: hambre baja si glucosa alta,
curiosidad sube con dopamina, miedo sube con cortisol.

### Un tick (`BiochemEngine.tick(dt)`)

1. Reacciones A→B (transferencia exponencial acotada al reactivo).
2. Decaimiento exponencial de cada químico.
3. Cada drive: `nivel += couplingRate · dt` → clamp `[min, max]` (0..1);
   `target = clamp(nivel + couplingRate)` (proyección determinista a 1 s).

Puro y determinista: mismas condiciones iniciales + mismo `dt` ⇒ mismo
resultado (test: `tests/determinism.test.ts`). `dt < 0` lanza `RangeError`.

### API

```ts
import { BiochemEngine, registerDrive } from './src/biochem';

const engine = new BiochemEngine({
  initialChemicals: { glucosa: 0.8 },
  initialDrives: { energia: 0.7 },
});
const snapshot = engine.tick(1 / 60); // { dt, drives, chemicals }
engine.getDrive('hambre');             // { level, target }
engine.getChemical('dopamina');        // 0..1
```

Snapshot = copia: mutarlo no afecta al motor.

## Tests

`npm test` ejecuta `tests/`:

- `decay.test.ts` — caída exponencial de químicos y deriva de drives.
- `clamps.test.ts` — saturación 0..1 en drives, químicos y target.
- `determinism.test.ts` — dos secuencias idénticas ⇒ resultados idénticos.
- `extensibility.test.ts` — un drive nuevo registrado se recoge sin tocar el motor.
- `coupling.test.ts` — subir/quitar químico mueve el drive (hambre/miedo/curiosidad).
- `reactions.test.ts` — A→B, cadena completa y ley exponencial.

## Puerto visual de Canvas

`src/visuals/canvasVisuals.ts` implementa `IVisuals` sin escribir en el motor.
Los `d` de los paths del SVG de `bichito.html` se conservan como `Path2D`; el
hábitat y sus luces son CSS. La expresión se deriva de hambre, energía, sueño,
curiosidad, vínculo, aburrimiento, miedo y confort (`happy` / `sad` / `sleepy` /
`excited`). Respiración, parpadeo, brillo de antenas y salto se calculan de forma
periódica con el tiempo simulado, sin `Math.random()`.

## Runtime: genoma y vocabulario

`Genome.getPhenotype()` alimenta `BiochemEngine` y los knobs de la fábrica del
cerebro mediante `createBrainRuntime()`. El vector genómico de cuatro entradas
usa por ahora `[alerta, sociabilidad, resiliencia, metabolismo]`, una propuesta
inspirada en los rasgos del prototipo y pendiente de validación de Tecnotron.

`Vocabulary` avanza con el mismo tiempo simulado y se puede enseñar desde la UI.
La asociación de palabras todavía no forma parte de `BrainInputs`: falta acordar
cómo representar palabras en los tres canales de estímulo.

## Estado / siguientes pasos

- Fase 0 y port visual L1: implementados.
- Genoma y vocabulario: implementados; composición del runtime y UI de enseñanza disponibles.
- Cerebro real (Fase 3): implementado en `src/brain/brain-v05.ts` con su bucle de
  refuerzo en `main.ts` y panel propio en la UI. Modelo, fórmulas y pruebas en
  [`CEREBRO.md`](CEREBRO.md).
- Pendiente de validación con Tecnotron/CEO: el mapeo de los cuatro genes de
  entrada y de los tres estímulos químicos, cómo (o si) entra el vocabulario en
  `BrainInputs`, y el codebook escalar de la acción frente a la alternativa
  one-hot (que exigiría cambiar el adaptador aprobado).
- Siguiente frente natural: mundo y objetos (Fase 4) para que la recompensa por
  reducción de drive sea contingente con la acción, y persistencia (Fase 5) con
  el `serialize()` que ya tienen cerebro, genoma y vocabulario.
