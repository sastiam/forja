# security

gitleaks (pre-commit), firewall de aplicaciones y check de FileVault.

- **gitleaks:** el repo de forja es público. `forja apply security` instala `.git/hooks/pre-commit` en el clon de forja, que ejecuta `gitleaks git --pre-commit --staged` con `.gitleaks.toml`. Si ya existe otro hook no se pisa: el plan lo indica y la línea se añade a mano. CI repite el escaneo (job `secrets`).
- **Firewall de aplicaciones:** se activa.
- **FileVault:** solo se comprueba, no se activa solo.
- **1Password CLI (`op`):** se instala en el módulo `core` (`cask "1password-cli"`); los secretos se leen con referencias `op://` y `op run`.
