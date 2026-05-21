# Metron - Implementation Plan

Este documento ordena el desarrollo por bloques chicos y verificables. La idea es que cada bloque pueda trabajarse en una sesion distinta sin depender de tener todo el contexto cargado.

## Estado actual resumido

Metron ya tiene una base funcional de finanzas personales:

- Backend Fastify + Prisma + Postgres + Redis.
- Frontend React + Vite PWA.
- Auth multiusuario con access token y refresh token.
- Cuentas, categorias, grupos y transacciones.
- Soporte ARS/USD con montos duales por transaccion.
- Tipo de cambio blue/oficial/MEP.
- Tarjetas de credito con cierre, vencimiento y deuda por resumen.
- Reportes base con series mensuales y patrimonio neto.
- PWA instalable desde navegador.

Esto ya se acerca mas a un MVP web/PWA que a un esqueleto. No hace falta un emulador Android para avanzar el MVP actual: primero conviene cerrar bien la PWA responsive. Un emulador o app nativa recien entra si decidimos empaquetar mobile con Expo/React Native o Capacitor.

## Criterio de MVP real

El MVP debe permitir que una persona use Metron durante un mes completo sin tocar la base de datos ni pedir ayuda tecnica.

Debe incluir:

- Registro, login, sesion persistente y logout confiables.
- Alta, edicion y baja de cuentas.
- Alta, edicion, baja, filtros y repeticion de transacciones.
- Categorias y grupos administrables.
- Dashboard que responda preguntas basicas: cuanto tengo, cuanto gaste, cuanto entra, cuanto vence.
- Reportes mensuales simples y comparables.
- Ajustes de perfil funcionales.
- Validacion manual end-to-end en local y produccion.

No es necesario para MVP:

- App nativa Android/iOS.
- IA.
- WhatsApp completo.
- Portfolio de inversiones avanzado.
- Simuladores financieros complejos.

## Bloque 0 - Auditoria y estabilizacion

Objetivo: confirmar que la base actual corre limpia antes de agregar mas features.

Entregables:

- `backend` typecheck y build OK.
- `frontend` typecheck y build OK.
- Smoke test manual: registro, login, crear cuenta, crear transaccion, editar transaccion, borrar transaccion.
- Verificacion visual rapida de Dashboard, Transactions, Accounts, Reports y Settings.
- Lista de bugs bloqueantes detectados, si aparecen.

Criterios de aceptacion:

- No hay errores TypeScript.
- La app levanta en local.
- El flujo principal se puede completar desde UI.

Comandos sugeridos:

```bash
cd backend
pnpm typecheck
pnpm build

cd ../frontend
pnpm typecheck
pnpm build
```

## Bloque 1 - Cierre de Settings y perfil

Objetivo: convertir Settings en una pantalla funcional, no solo informativa.

Entregables:

- Formulario para editar telefono.
- Selector de moneda preferida.
- Toggle `fiftyThirtyTwenty`.
- Input para `liquidityAlertThreshold`.
- Guardado contra `PATCH /api/auth/me`.
- Actualizacion del usuario en el contexto de auth sin reloguear.
- Estados de loading, exito y error.

Criterios de aceptacion:

- Los datos editados persisten al refrescar la pagina.
- La moneda preferida puede sincronizarse con el toggle global ARS/USD.
- Valores vacios de telefono y umbral quedan como `null`.

Archivos probables:

- `backend/src/modules/auth/routes.ts`
- `backend/src/modules/auth/schemas.ts`
- `frontend/src/lib/auth.tsx`
- `frontend/src/hooks/queries.ts`
- `frontend/src/pages/Settings.tsx`

## Bloque 2 - Dashboard accionable

Objetivo: que el dashboard sea la pantalla principal de decision diaria.

Entregables:

- Cards de patrimonio, ingresos, gastos y balance del mes.
- Widget de deuda de tarjetas separado ARS/USD.
- Cashflow de proximos 30 dias.
- Banner de alerta de liquidez si el saldo proyectado baja del umbral configurado.
- Accesos rapidos a cargar transaccion, pagar tarjeta, ver reportes y ajustes.

Criterios de aceptacion:

- La pantalla responde "como estoy este mes" sin ir a otras paginas.
- Si no hay datos, muestra estados vacios utiles.
- Todos los montos respetan el toggle ARS/USD cuando corresponde.

Archivos probables:

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/hooks/queries.ts`
- `frontend/src/lib/reporting.ts`
- `backend/src/modules/transactions/routes.ts`

## Bloque 3 - Reportes MVP

Objetivo: dejar una pagina de reportes suficiente para analisis mensual basico.

Entregables:

- Selector de mes.
- Comparativa vs mes anterior.
- Grafico ingresos vs gastos 12 meses.
- Grafico patrimonio neto 12 meses.
- Donut de gastos por categoria.
- Tabla/resumen de categorias con monto y porcentaje.
- Estado vacio cuando no hay datos.

Criterios de aceptacion:

- Los reportes cargan con datos reales del usuario autenticado.
- No se rompen con meses sin transacciones.
- Las series usan Decimal/string y no floats para calculo financiero critico.

Archivos probables:

- `backend/src/modules/reports/*`
- `backend/src/modules/transactions/*`
- `frontend/src/pages/Reports.tsx`
- `frontend/src/components/reports/Charts.tsx`
- `frontend/src/lib/reporting.ts`

## Bloque 4 - UX de transacciones

Objetivo: hacer que cargar y revisar movimientos sea rapido, claro y tolerante a errores.

Entregables:

- Formulario con validaciones visibles.
- Edicion clara de transacciones existentes.
- Filtros por mes, tipo, categoria, cuenta, grupo y estado.
- Indicador de recurrente.
- Accion de repetir transaccion.
- Confirmacion antes de borrar.
- Totales segun filtros activos.

Criterios de aceptacion:

- Un usuario puede cargar movimientos diarios en menos de un minuto.
- Editar o borrar ajusta balances correctamente.
- Los filtros no ocultan el estado vacio ni confunden los totales.

Archivos probables:

- `backend/src/modules/transactions/*`
- `frontend/src/pages/Transactions.tsx`
- `frontend/src/hooks/queries.ts`

## Bloque 5 - Validacion PWA y mobile web

Objetivo: que el MVP sea usable desde celular sin app nativa.

Entregables:

- Revision responsive en ancho mobile.
- Manifest e iconos PWA finales.
- Service worker revisado para no cachear datos obsoletos de forma peligrosa.
- Prueba de instalacion como PWA.
- Checklist de navegacion tactil.

Criterios de aceptacion:

- Se puede usar desde Chrome Android/Safari iOS como web app.
- No hay texto cortado ni controles imposibles de tocar.
- La app sigue funcionando tras refresh y reabrir sesion.

Archivos probables:

- `frontend/vite.config.ts`
- `frontend/public/icons/*`
- `frontend/src/components/Layout.tsx`
- `frontend/src/index.css`

## Bloque 6 - Produccion y release MVP

Objetivo: dejar una version desplegable y verificable.

Entregables:

- Variables de entorno revisadas.
- Migraciones aplicadas.
- Smoke test contra produccion.
- README actualizado con flujo real de deploy.
- Checklist de rollback basico.

Criterios de aceptacion:

- Backend y frontend deployan sin pasos manuales ambiguos.
- Registro/login funcionan en el dominio final.
- Cookies/token refresh funcionan despues de cerrar y abrir el navegador.

Archivos probables:

- `README.md`
- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`

## Bloque 7 - Post-MVP: planning financiero

Objetivo: sumar funciones de planificacion una vez que el MVP diario esta estable.

Entregables:

- Metas de ahorro / wishlist.
- Proyeccion de gastos por categoria.
- Tracker 50/30/20.
- Health score mensual.
- Simulador cuotas vs contado.

Criterios de aceptacion:

- Cada feature aporta una decision concreta.
- No bloquea el uso diario si falta informacion.
- Los calculos son explicables en UI.

## Bloque 8 - Post-MVP: inversiones

Objetivo: administrar patrimonio invertido sin mezclarlo con el MVP transaccional.

Entregables:

- CRUD de inversiones. [implementado]
- Valuacion manual inicial. [implementado]
- Precios externos en una segunda iteracion.
- Allocation por tipo de activo. [implementado]
- Performance vs dolar blue. [parcial: performance ARS/USD manual]

Criterios de aceptacion:

- El usuario puede registrar una posicion y ver su valor actual estimado.
- La feature no rompe patrimonio/cashflow existente.

## Bloque 9 - Post-MVP: automatizaciones e IA

Objetivo: agregar inteligencia y captura automatica cuando la base ya sea confiable.

Entregables:

- Insight mensual guardado en `MonthlySummary`.
- Deteccion de gastos inusuales.
- Integracion WhatsApp via n8n usando el webhook existente.
- Parser de mensajes para cargar transacciones.

Criterios de aceptacion:

- La IA no recalcula ni duplica insights en cada carga.
- Toda transaccion generada automaticamente se puede revisar/corregir.
- Los errores de integracion no afectan el uso manual.

## Orden recomendado inmediato

1. Bloque 0: validar que el estado actual corre.
2. Bloque 1: cerrar Settings funcional.
3. Bloque 2: mejorar Dashboard accionable.
4. Bloque 3: terminar Reportes MVP.
5. Bloque 5: revisar mobile web/PWA.
6. Bloque 6: release MVP.

## Checklist por sesion

Antes de empezar:

- Leer este archivo.
- Revisar `git status --short`.
- Identificar si hay cambios previos del usuario.
- Elegir un solo bloque o sub-bloque.

Durante:

- Mantener cambios acotados.
- No mezclar refactors con features.
- Validar inputs con Zod en backend.
- Mantener calculos de dinero con Decimal/string.

Antes de cerrar:

- Correr typecheck/build segun el area tocada.
- Anotar pendientes reales.
- Actualizar este plan si cambia el alcance.

## Estado actualizado tras inicio de Phase 3

Primer sub-bloque de planning financiero implementado:

- CRUD backend de metas de ahorro en `GET/POST/PUT/DELETE /api/goals`.
- Pantalla `/goals` con alta, edicion, baja, progreso, estado, fecha objetivo y ahorro mensual estimado.
- Navegacion principal actualizada con "Metas".

Pendientes de Phase 3:

- Simulador cuotas vs contado.
- Health score financiero.

## Estado actualizado tras proyecciones por categoria

Segundo sub-bloque de planning financiero implementado:

- Endpoint `GET /api/reports/category-projections`.
- Proyeccion del proximo mes por categoria usando promedio de los ultimos 3 meses cerrados.
- Desvio/variabilidad por categoria para clasificar la estimacion como estable, variable, volatil o nueva.
- La proyeccion respeta el filtro de grupo compartido/persona igual que Panel y Reportes.
- Seccion "Proyeccion de gastos" agregada en `/reports`.

Pendientes de Phase 3:

- Simulador cuotas vs contado.
- Health score financiero.

## Estado actualizado tras inicio de inversiones

Primer sub-bloque de portfolio implementado:

- Endpoint `GET/POST/PUT/DELETE /api/investments`.
- Endpoint `GET /api/investments/summary`.
- Migracion para precio actual manual por posicion: `currentPriceArs`, `currentPriceUsd`, `lastPriceUpdatedAt`.
- Pantalla `/investments` con alta, edicion, baja, totales invertidos, valor actual, resultado y retorno.
- Tipos soportados: CEDEAR, cripto, bono, accion, FCI, plazo fijo y otros.
- Valuacion manual ARS/USD usando precio de compra y precio actual opcional.

Pendientes de inversiones:

- Aplicar precios externos para cripto/acciones/CEDEARs/bonos cuando el proveedor quede definido.
- Mejorar modelo de splits, compras parciales y ventas.
- Comparar performance vs dolar blue por activo.

## Estado actualizado tras grupos compartidos

Se agrego colaboracion basica sobre grupos de transacciones:

- Los grupos pueden tener miembros e invitaciones por email.
- El owner puede invitar desde Ajustes > Grupos.
- El usuario invitado ve invitaciones pendientes y puede aceptar o rechazar.
- Al filtrar movimientos por un grupo compartido, se ven los movimientos asociados por otros miembros.

Pendiente para una segunda iteracion:

- Envio real de email con proveedor SMTP/Resend/Postmark.
- Roles mas finos, remocion de miembros y abandonar grupo.
