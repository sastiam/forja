# ADR 0008 — Firma verificable para commits de agentes

- **Estado:** aceptada
- **Fecha:** 2026-11-14

## Contexto

Los commits, los PR y los paquetes publicados deben ser verificables. Los agentes (loops, `night-run`, `forja wt new --agent`) commitean dentro de un sandbox que no debe tener acceso a la clave personal ni a su agente SSH: abrirlo daría acceso a todo lo que esa clave autentica.

## Decisión

1. **Clave de firma propia para agentes.** Una clave `ed25519` sin passphrase, registrada en GitHub solo como *signing key* (no de autenticación). Si se filtra, solo permite firmar, no hacer push ni entrar por SSH.
2. **Solo en worktrees de agentes.** `forja wt new --agent` activa `extensions.worktreeConfig` y fija, con `git config --worktree`, `gpg.format=ssh`, `user.signingkey` y `commit.gpgsign=true`. La configuración global y la clave personal no se tocan. La ruta de la clave es un dato personal: va en el perfil local (`[signing] agent_key`), nunca en el repo.
3. **PR.** Rama protegida con *Require signed commits* y fusión con squash desde la web (GitHub firma el commit resultante en `main`).
4. **Paquetes.** Solo se publican desde CI al empujar una etiqueta, con procedencia verificable: `npm publish --provenance` (OIDC, `id-token: write`) y `actions/attest-build-provenance` para los artefactos de una release. Ningún agente ni máquina local publica.

## Consecuencias

- La clave privada de agentes es legible desde el sandbox por diseño. El riesgo se limita registrándola solo para firma y rotándola si hace falta (`gh ssh-key delete`).
- Los commits de agentes se ven como verificados en GitHub, con `Co-Authored-By` indicando que los hizo un agente.
- Implementado: campo `[signing] agent_key` del perfil, cableado en `wt new` (solo si el dueño no es `human`) y checks en `forja doctor` (permisos 600, antigüedad > 90 días y FileVault).
- `user.signingkey` apunta a la clave **privada**: sin agente ssh, git solo firma con la ruta privada.
- Si un agente se crea sin `agent_key`, `wt new` avisa de que sus commits irán sin firmar.

## Plan B

Commits sin firmar en ramas `agent/*` y firma solo en la fusión con squash, si la protección de rama no exige firma en cada commit del PR.
