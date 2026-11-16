# Firma verificable (agentes)

Pasos únicos para activar el ADR 0008. Se hacen en tu terminal, fuera del sandbox.

## 1. Crear la clave de agentes

```sh
ssh-keygen -t ed25519 -N "" -C "forja agent signing" -f ~/.config/forja/agent-signing
```

Usa un archivo propio, distinto de tu clave personal.

## 2. Registrarla en GitHub solo como clave de firma

```sh
gh ssh-key add ~/.config/forja/agent-signing.pub --type signing --title "forja agent signing"
```

# VERIFICAR: que tu versión de `gh` admite `--type signing` (`gh ssh-key add --help`). Si no, añádela en Settings → SSH and GPG keys → New SSH key → *Signing Key*.

## 2b. Indicar la clave en tu perfil local

En `~/.config/forja/profile.toml` (nunca en el repo):

```toml
[signing]
agent_key = "~/.config/forja/agent-signing"
```

Desde ahí, `forja wt new <rama> --agent claude` activa la firma ssh solo en ese worktree, y `forja doctor` comprueba permisos 600, antigüedad (rotar a los 90 días) y FileVault.

## 3. Verificación local opcional

```sh
printf '%s %s\n' "<tu-email-de-git>" "$(cat ~/.config/forja/agent-signing.pub)" >> ~/.config/git/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
git log --show-signature -1
```

## 4. Proteger la rama principal

En el repo: Settings → Branches → regla para `main` con *Require signed commits*, *Require a pull request* y fusión *Squash*.

## 5. Publicar paquetes con procedencia

Solo desde CI, al empujar una etiqueta `v*.*.*`: permisos `id-token: write` y `attestations: write`, `npm publish --provenance` para paquetes y `actions/attest-build-provenance` para los artefactos de una release. Forja es `private`, así que esto aplica a los repos que sí publican.

## 6. Identidad y firma por repo (ADR 0014)

Tu config global de git es la laboral y manda por defecto. Los repos personales son excepciones que se declaran en `~/.config/forja/profile.toml`:

```toml
[git.identities.personal]
name = "Tu Nombre"
email = "ID+usuario@users.noreply.github.com"
signing_key = "~/.ssh/id_ed25519_personal.pub"   # commits humanos
# agent_key = "~/.config/forja/agent-signing"    # opcional; por defecto [signing] agent_key

[git.repos]            # por nombre de carpeta (o ruta con "/")
forja = "personal"
openspec-cascade = "personal"
```

Un repo que no aparece en `[git.repos]` conserva la identidad global. Para añadir otro repo, una línea.

Qué hace forja, sin intervención:

- `forja wt new` y `forja wt night` escriben la identidad del repo en su `.git/config` (`git config --local`). Los worktrees la heredan, los cree forja, Claude Code, openspec-cascade o `git worktree add`.
- Los worktrees de agentes añaden, solo en su `config.worktree`, la clave de agente **y el nombre y email de la identidad**, para que GitHub verifique el commit con la cuenta correcta.
- `wt night` reaplica todo al reutilizar un worktree existente.

Para repos y worktrees que ya existían:

```sh
forja git identity apply     # repo actual y todos sus worktrees
forja git identity check     # email y clave efectivos de cada worktree; sale con 2 si no cuadran
```
