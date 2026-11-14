# agents

Claude Code (sandbox), OpenCode, Hermes y skills enlazadas.

Claude Code con sandbox obligatorio y `deny` de secretos. OpenCode solo con API key (nunca la suscripción). Hermes se instala con su instalador oficial tras mostrarlo y pedir confirmación; no se activa el gateway. Las skills de `skills/` se enlazan por symlink.

## Checks (`forja doctor`, `forja drift`)

- Skills enlazadas en `~/.claude/skills`.
- **OpenCode** instalado con brew. Si `opencode` resuelve a `~/.opencode/bin`, es la copia del instalador oficial y tapa la de brew: es un aviso (!). El arreglo: quita la línea `export PATH=~/.opencode/bin:$PATH` de `~/.zshrc` (`chezmoi apply` la restaura desde el repo) y ejecuta `rm -rf ~/.opencode`.
- `opencode --version` y `hermes --version` deben responder. Un binario instalado que falla es un fallo (✖). Si Hermes no está instalado es solo un aviso, porque es opcional.
