# git

Git moderno, conflictos con mergiraf + Sublime Merge, rerere, zdiff3.

Configuración global de git (zdiff3, rerere, histogram, delta) con driver de mergiraf y `smerge` como mergetool. La identidad vive en `~/.config/forja/local/git.local.gitconfig`, fuera del repo.

## En Linux (Fedora)

- **Sublime Merge** viene del repo oficial de Sublime HQ (un `.repo` por https). Es de terceros: añade a tu `profile.toml` `[fedora] trusted_repos = ["repofile:https://download.sublimetext.com/rpm/stable/x86_64/sublime-text.repo"]` (ADR 0017). Sin ello, `plan` lo indica y `apply` lo omite.
- **mergiraf** no está en Fedora ni en mise (BACKLOG). Mientras falte, el driver de fusión **no se declara** en `~/.config/git`: con el atributo `* merge=mergiraf` y el programa ausente, git fallaría en cualquier fusión a tres vías. Al instalarlo y volver a ejecutar `forja apply git`, se activa solo.
