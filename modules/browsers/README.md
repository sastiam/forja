# browsers

Chrome y Dia (solo instala, sin flags no documentados).

Roles separados: Chrome para desarrollo y Dia como navegador asistido. Si ya estaban instalados a mano, `brew bundle` los **adopta** (`--adopt`): no se reinstalan ni se pierden perfiles. Desde entonces `brew upgrade` los actualiza y `drift` los ve.

## En Linux (Fedora)

Solo Chrome (Dia existe únicamente en macOS). Viene del repo oficial de Google, cuya definición Fedora empaqueta (deshabilitada) en `fedora-workstation-repositories`. Como es un repo de terceros, **forja solo lo habilita si confías en él** (ADR 0017):

```toml
[fedora]
trusted_repos = ["workstation:google-chrome"]
```
