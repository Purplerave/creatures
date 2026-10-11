# Fase 0 — Andamiaje y motor de bioquímica

Documento de desarrollo de la Fase 0 de **Creatures**: andamiaje TypeScript + Vite,
contratos entre módulos y el motor de bioquímica determinista.

## Cómo levantarlo

```bash
npm i          # instala typescript, vite y vitest (devDependencies)
npm run dev    # servidor de desarrollo con HMR (abre index.html)
npm test       # vitest run — suite completa
npm run typecheck  # tsc --noEmit — 0 errores
npm run build  # empaqueta en dist/
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
│   ├── main.ts           # arranque + render de prueba en <canvas>
│   ├── contracts/        # CONTRATOS (interfaces tipo acuerdo entre módulos)
│   │   ├── types.ts      # DriveId, DriveState, ChemicalId, TickResult
│   │   ├── ibrain.ts     # IBrain { think(inputs) → BrainOutput }
│   │   ├── ibiochem.ts   # IBiochem { tick, getDrive, getChemical }
│   │   └── ivisuals.ts   # IVisuals (placeholder: sin implementar)
│   ├── brain/
│   │   └── stub.ts       # stub desechable de IBrain (neutro)
│   └── biochem/          # MOTOR de bioquímica (Fase 0)
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
| `IBrain` (`src/contracts/ibrain.ts`) | **Tecnotron** (MLP + ε-exploración); hoy hay un stub desechable en `src/brain/stub.ts` | bucle principal: recibe `BrainInputs` (drives + químicos), devuelve `BrainOutput.actions` |
| `IVisuals` (`src/contracts/ivisuals.ts`) | **Tecnotron** (port de visuales de Bichito) — *placeholder, sin implementar aún* | `main.ts` le pasa snapshots; el render nunca toca la simulación |
| Genoma/mutación y palabras | **OpenCode** (futuro) | consumirá los mismos tipos de `contracts/types.ts` |

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

## Estado / siguientes pasos

- Fase 0 completo: andamiaje + motor de bioquímica + contratos.
- Pendiente (otros módulos): cerebro real (Tecnotron), visuales Bichito
  (Tecnotron, `IVisuals`), genoma/mutación y palabras (OpenCode).
