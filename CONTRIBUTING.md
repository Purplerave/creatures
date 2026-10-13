# Contribuir a Creatures

¡Gracias por ayudar! El proyecto es experimental y de afición. Las decisiones de diseño abiertas (mapeos de genes/estímulos, acciones y vocabulario) están en [`docs/REVISIONES.md`](docs/REVISIONES.md); pregunta antes de cambiar contratos compartidos.

## Preparar el entorno

- Node.js 20 o superior.
- `npm ci`
- `npm run dev` para abrir la demo.

## Antes de enviar cambios

```bash
npm run typecheck
npm test
npm run build
```

Para cambios de UI, indica cómo reproducirlos manualmente y comprueba al menos el ancho móvil. Para cambios de simulación, añade o actualiza tests deterministas. Evita `Math.random()` en los módulos de simulación y mantén los efectos bioquímicos dentro de `BiochemEngine`.

## Pull requests

- Trabaja en una rama y explica el problema que resuelve el cambio.
- Incluye tests y actualiza la documentación/estado si cambia el comportamiento visible.
- No cambies contratos aprobados ni resuelvas mapeos provisionales unilateralmente; deja la decisión explícita para revisión.
- Declara limitaciones conocidas y los pasos exactos para probar la entrega.

## Licencia

El repositorio todavía no declara una licencia. No se debe asumir que el código o los recursos pueden reutilizarse o redistribuirse hasta que la persona propietaria elija una licencia.
