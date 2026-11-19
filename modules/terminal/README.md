# terminal

Ghostty con integración de shell.

Terminal ligera, con notificaciones al terminar comandos largos y sin telemetría.

## En Linux (Fedora)

Ghostty no es un paquete oficial de Fedora. Viene del COPR comunitario `scottames/ghostty`, el que documenta [ghostty.org](https://ghostty.org/docs/install/binary), y **forja no lo habilita salvo que confíes en él** (ADR 0017). Añade a tu `profile.toml`:

```toml
[fedora]
trusted_repos = ["copr:scottames/ghostty"]
```

Sin esa línea, `forja plan` te dice qué añadir y `apply` lo omite. Si ya tienes el COPR habilitado, no hace falta: forja solo instala el paquete. La config pierde en Linux las claves exclusivas de macOS (`macos-option-as-alt`, `window-save-state`).
