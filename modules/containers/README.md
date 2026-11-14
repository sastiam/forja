# containers

Colima + Docker CLI + Floci + AWS CLI + CDK (AWS local).

Colima da el socket Docker que Floci necesita para Lambda/RDS/ECS. Es MIT, así que no requiere licencia en uso comercial. OrbStack queda como alternativa (ver `docs/adr/0007-colima-por-defecto.md`). El perfil `floci` es público; los perfiles SSO reales se añaden desde `aws.local.config`.

## Arrancar Colima

```sh
colima start --vm-type vz --mount-type virtiofs --vz-rosetta --cpu 4 --memory 8 --disk 60
docker context use colima
```

`virtiofs` es lo que evita el I/O lento de sshfs en `pnpm install` y hot reload. Las rutas montadas en contenedores (worktrees, código de Lambdas) deben quedar bajo `$HOME`.

# VERIFICAR: si Floci no encuentra el socket, exporta `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`.
# VERIFICAR: que `host.docker.internal` resuelve desde los contenedores de Lambda.
