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

En `~/.config/forja/local/profile.toml` (nunca en el repo):

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
