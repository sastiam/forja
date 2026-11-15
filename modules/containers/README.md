# containers

Colima + Docker CLI + Floci + AWS CLI + CDK (AWS local).

Colima da el socket Docker que Floci necesita para Lambda/RDS/ECS. Es MIT, así que no requiere licencia en uso comercial. Es el único runtime: OrbStack ya no se usa (`docs/adr/0007-colima-por-defecto.md`), y `doctor` avisa si sigue instalado o si el contexto docker no es `colima`. El perfil `floci` es público; los perfiles SSO reales se añaden desde `aws.local.config`.

## Colima a medida de la máquina

`forja apply containers` arranca Colima con un tamaño ligero calculado a partir de `sysctl hw.ncpu hw.memsize`. La RAM
se reserva entera mientras la VM está encendida y el disco virtual crece con el uso hasta su tope, así que los dos se
mantienen bajos:

| Recurso | Regla | MacBook Pro 14 núcleos / 48 GB |
|---|---|---|
| CPU | un tercio de los núcleos, entre 2 y 4 | 4 |
| RAM | un octavo de la RAM, entre 4 y 8 GB | 6 GB |
| Disco | 40 GB de tope | 40 GB |

```sh
colima start --vm-type vz --mount-type virtiofs --vz-rosetta --cpu 4 --memory 6 --disk 40
docker context use colima
```

Para fijar otro tamaño, en `~/.config/forja/local/profile.toml` (cualquiera de los tres):

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

`virtiofs` es lo que evita el I/O lento de sshfs en `pnpm install` y hot reload. Las rutas montadas en contenedores (worktrees, código de Lambdas) deben quedar bajo `$HOME`.

# VERIFICAR: si Floci no encuentra el socket, exporta `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`.
# VERIFICAR: que `host.docker.internal` resuelve desde los contenedores de Lambda.
