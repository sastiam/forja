# containers

Colima + Docker CLI + Floci + AWS CLI + CDK (AWS local).

Colima da el socket Docker que Floci necesita para Lambda/RDS/ECS. Es MIT, así que no requiere licencia en uso comercial. Es el único runtime: OrbStack ya no se usa (`docs/adr/0007-colima-por-defecto.md`), y `doctor` avisa si sigue instalado o si el contexto docker no es `colima`. El perfil `floci` es público; los perfiles SSO reales se añaden desde `aws.local.config`.

## Colima a medida de la máquina

`forja apply containers` crea Colima con un tamaño ligero calculado a partir de `sysctl hw.ncpu hw.memsize`. La RAM
se reserva entera mientras la VM está encendida y el disco virtual crece con el uso hasta su tope, así que los dos se
mantienen bajos:

| Recurso | Regla | MacBook Pro 14 núcleos / 48 GB |
|---|---|---|
| CPU | un tercio de los núcleos, entre 2 y 4 | 4 |
| RAM | un octavo de la RAM, entre 4 y 8 GB | 6 GB |
| Disco | 40 GB de tope | 40 GB |

```sh
colima start --vm-type vz --mount-type virtiofs --vz-rosetta --cpu 4 --memory 6 --disk 40 --mount ~/code:w
docker context use colima
```

Para fijar otro tamaño, en `~/.config/forja/profile.toml` (cualquiera de los tres):

```toml
[containers]
cpu = 4
memory_gb = 8
disk_gb = 60
```

Con la VM ya creada, `forja apply containers` la reinicia si cambian la CPU o la RAM. El disco solo puede crecer: si la
VM tiene más disco que el tope, `plan` lo indica y para reducirlo hay que recrearla, lo que borra imágenes y volúmenes:

```sh
colima delete --force && forja apply containers
```

## Bajo demanda y Docker para agentes (ADR 0012)

La VM no está siempre encendida:

- **Arranca sola** cuando usas `docker`, `docker-compose`, `floci`, `cdk` o `sam`. En tu terminal lo hacen funciones de
  `~/.zshrc`; en Claude Code, el hook `PreToolUse` `~/.claude/hooks/colima-up.sh`. Los dos llaman a
  `~/.config/forja/bin/colima-ensure`.
- **Se apaga sola** tras 15 min sin contenedores ni Floci (LaunchAgent `dev.forja.colima-idle`, que mira cada 5 min).
- **Solo monta `~/code`.** Por eso los agentes pueden usar el socket de Docker desde el sandbox
  (`sandbox.network.allowUnixSockets`) sin ver `~/.ssh`, `~/.aws` ni el resto de `$HOME`.

Las rutas que montes en contenedores (worktrees, código de Lambdas) deben estar bajo `~/code`. Para cambiarlo, en el
perfil:

```toml
[containers]
mounts = ["~/code"]   # nunca vacío: [] sería $HOME entero
idle_minutes = 15     # 0 = no apagar nunca
```

`plan` con la VM apagada no marca nada; solo pide crearla o reiniciarla si cambian el tamaño o los montajes.
Si un proceso usa el socket sin pasar por esos comandos (por ejemplo, testcontainers en `pnpm test`), lanza antes
`docker info`.

## Rosetta 2

`--vz-rosetta` emula imágenes amd64 (muchas de Floci y de Lambda) con Rosetta 2, que una Mac con Apple Silicon no trae
de fábrica. En Apple Silicon, `plan` la marca pendiente si falta, `apply` la instala antes de arrancar Colima
(`sudo softwareupdate --install-rosetta --agree-to-license`) y reinicia la VM si ya estaba en marcha, y `doctor` avisa
si falta. Si la instalación falla, Colima arranca sin `--vz-rosetta`.

`virtiofs` es lo que evita el I/O lento de sshfs en `pnpm install` y hot reload.

# VERIFICAR: si Floci no encuentra el socket, exporta `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`.
# VERIFICAR: que `host.docker.internal` resuelve desde los contenedores de Lambda.
