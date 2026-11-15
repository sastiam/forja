---
name: well-architected
description: "Revisa infraestructura AWS (CDK, CloudFormation, Terraform) con los 6 pilares del AWS Well-Architected Framework. Úsala al diseñar o cambiar un stack, antes de desplegar a una cuenta real, o con 'revisa la arquitectura', 'well-architected', 'WAR' o '¿esto escala / es seguro / cuánto cuesta?'."
status: complete
---

# well-architected

Revisión práctica y aterrizada a CDK de los 6 pilares. Para una revisión formal completa (todas las preguntas del framework), usa la skill `aws-well-architected-review` del plugin `aws-core` (Agent Toolkit for AWS) y esta como checklist rápido.

## Pasos
1. Lee el código de infraestructura (`lib/`, `bin/`, `cdk.json`) y `cdk synth` para ver la plantilla real. Usa Floci (`AWS_PROFILE=floci`, skill `project-flow`) para probar; nunca una cuenta real sin que el usuario lo diga.
2. Si el proyecto no lo tiene, propone `cdk-nag` (`AwsSolutionsChecks`) en el `App`: convierte buena parte de esta lista en errores de `synth`.
3. Recorre los pilares y anota hallazgos con riesgo **alto** (bloquea el despliegue), **medio** (antes de producción) o **bajo** (mejora).
4. Entrega una tabla `pilar | hallazgo | riesgo | arreglo (con el cambio en CDK)`. Si una decisión tiene alternativas con trade-offs, propón un ADR en `docs/adr/`.

## Checklist por pilar
**Excelencia operativa**
- Todo en IaC; nada creado a mano en la consola. Tags de `project`, `env` y `owner` en el `App` (`Tags.of(app).add`).
- Logs con retención (`logRetention`), alarmas de errores y latencia, dashboard mínimo.

**Seguridad**
- IAM de mínimo privilegio: `grant*` de CDK en lugar de `*` en acciones o recursos.
- Cifrado en reposo (S3, DynamoDB, RDS, SQS) y en tránsito (`enforceSSL` en buckets).
- `blockPublicAccess` en S3; sin secretos en el código ni en variables de entorno planas (Secrets Manager o SSM).
- Grupos de seguridad sin `0.0.0.0/0` salvo en balanceadores públicos.

**Fiabilidad**
- `removalPolicy: RETAIN` (o `SNAPSHOT`) en datos con estado; `DESTROY` solo en entornos efímeros.
- Point-in-time recovery en DynamoDB, backups en RDS, Multi-AZ donde el SLA lo pida.
- DLQ y reintentos con backoff en colas y Lambdas asíncronas; idempotencia en los consumidores.
- Timeouts explícitos y menores que el del llamador.

**Eficiencia de rendimiento**
- Lambda en `ARM_64`, memoria medida (no por defecto); provisioned concurrency solo con datos.
- Índices de DynamoDB según los patrones de acceso; caché (CloudFront, DAX) donde haya lecturas repetidas.

**Optimización de costes**
- Graviton/ARM, on-demand frente a provisionado según carga, ciclo de vida en S3 (IA, Glacier) y retención de logs.
- NAT Gateway: uno por entorno no productivo, o VPC endpoints. Etiquetas para el reparto de costes.

**Sostenibilidad**
- Escalado a cero cuando no hay carga; regiones y tamaños ajustados; borrar entornos efímeros (worktrees con Floci en lugar de cuentas).

## Reglas
- Números de capacidad, timeouts y retenciones como constantes con nombre (skill `no-magic-numbers`).
- Los cambios propuestos van con su test de aserciones de CDK (skill `tdd`).
- El mod `quality-guard` pide confirmación antes de `cdk deploy`/`aws` contra una cuenta real: no intentes rodearlo.
