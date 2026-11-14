# containers

Colima + Docker CLI + Floci + AWS CLI + CDK (AWS local).

Colima da el socket Docker que Floci necesita para Lambda/RDS/ECS. Es MIT, así que no requiere licencia en uso comercial. Es el único runtime: OrbStack ya no se usa (`docs/adr/0007-colima-por-defecto.md`), y `doctor` avisa si sigue instalado o si el contexto docker no es `colima`. El perfil `floci` es público; los perfiles SSO reales se añaden desde `aws.local.config`.

## Colima a medida de la máquina

`forja apply containers` arranca Colima si está parado, con un tamaño calculado a partir de `sysctl hw.ncpu hw.memsize`:

| Recurso | Regla | MacBook Pro 14 núcleos / 36 GB |
|---|---|---|
| CPU | la mitad de los núcleos (mínimo 2) | 7 |
| RAM | un cuarto de la RAM, entre 4 y 24 GB | 9 GB |
| Disco | 100 GB (solo puede crecer) | 100 GB |

```sh
colima start --vm-type vz --mount-type virtiofs --vz-rosetta --cpu 7 --memory 9 --disk 100
docker context use colima
```

Para cambiar el tamaño de una VM ya creada: `colima stop` y vuelve a ejecutar `forja apply containers` (o `colima start` con los flags nuevos).

`virtiofs` es lo que evita el I/O lento de sshfs en `pnpm install` y hot reload. Las rutas montadas en contenedores (worktrees, código de Lambdas) deben quedar bajo `$HOME`.

# VERIFICAR: si Floci no encuentra el socket, exporta `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`.
# VERIFICAR: que `host.docker.internal` resuelve desde los contenedores de Lambda.
