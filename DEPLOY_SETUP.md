# Plan de despliegue: monorepo en Coolify (develop + producción)

**Estado: las 4 apps están desplegadas y responden en sus dominios con TLS. Ver sección 0.**

| | Antes | Después |
|---|---|---|
| Frontend | Netlify, repo `detroit-viatika` | Coolify, monorepo `detroit-viatika`, carpeta `viatika/` |
| Backend | Coolify (servidor viejo, otro host) | Coolify develop + producción, monorepo `detroit-viatika`, carpeta `viatika-back/` |
| Repos | 2 repos separados | 1 repo (`detroit-viatika`, reutilizado) con 2 carpetas |

---

## 0. Estado real (actualizado)

### Hecho
- **Monorepo restructurado y pusheado.** `main` = contenido de los `main` originales de cada repo; `develop` = contenido de trabajo actual (rama `marcos` de ambos repos al momento de la migración). Historial de commits del frontend preservado en `viatika/.git.bak` localmente (no en el repo); los 65 commits que solo existían en local ya están respaldados en `origin/marcos` de `detroit-viatika`.
- **Coolify** (`http://190.102.150.169:8000`, proyecto `l68ih0sk7lba2eury9b2sn6d` "My first project"): 4 apps creadas y completamente configuradas (repo, rama, Dockerfile, base directory, puerto, dominio, variables de entorno, auto-deploy nativo desactivado):
  | App | UUID | Dominio |
  |---|---|---|
  | viatika-frontend-develop | `hpthjhif64pglhrhnt1n239t` | qa-detroit-viatika.tecdidata.com |
  | viatika-backend-develop | `ceyhrauio16o1yn5hs4v3hhy` | qa-apidetroit-viatika.tecdidata.com |
  | viatika-frontend-main | `cyrw9v2hjyhqb78eeg59hbs7` | detroit.viatika.tecdidata.com |
  | viatika-backend-main | `e9e5t2mje9q9p6kq9ahphmp4` | apidetroit.viatika.tecdidata.com |
- **GitHub Actions**: 4 workflows con `paths:` filtrado, apuntando al endpoint de deploy de Coolify (`GET /api/v1/deploy?uuid=...` + `Authorization: Bearer`). 5 secrets ya cargados en el repo: `COOLIFY_API_TOKEN`, `COOLIFY_FRONTEND_DEVELOP_WEBHOOK_URL`, `COOLIFY_BACKEND_DEVELOP_WEBHOOK_URL`, `COOLIFY_FRONTEND_PROD_WEBHOOK_URL`, `COOLIFY_BACKEND_PROD_WEBHOOK_URL`.
- **Cloudflare DNS**: 4 registros A creados (DNS-only, sin proxy) apuntando al servidor de Coolify. Zona `tecdidata.com` (id `11e92a4b421ed48ec43f0354eff0f312`). No se tocaron los registros existentes (`api.viatika...`, `app.viatika...`, `tema.viatika...` → apuntan a otro servidor/Netlify, fuera de este alcance).
- `COOLIFY_TOKEN_DEVELOP` (el de `.env.deploy`) es inválido (401). Se usó `COOLIFY_TOKEN_PRODUCTION` para todo, dado que solo hay un team/proyecto en esta instancia.

### ⚠️ El servidor cambió de IP (5-Ago-2026): `161.132.166.142` → `190.102.150.169`

Entre el 3-Ago 18:06 UTC y el 4-Ago 18:09 UTC la instancia de Coolify pasó a
`190.102.150.169`. Es **la misma instancia** (mismos UUIDs de app, mismo
`COOLIFY_TOKEN_PRODUCTION` válido), solo cambió la IP. El DNS de Cloudflare se
actualizó, pero los secrets de GitHub Actions no: los 4
`COOLIFY_*_WEBHOOK_URL` seguían apuntando a la IP vieja, donde el puerto 8000
ya está filtrado (los paquetes se dropean, no hay RST).

Resultado: **todos** los deploys —develop y producción— fallaron desde el 4-Ago
con `curl: (28) Connection timed out after 30002 milliseconds` / exit code 28.
Las apps seguían sirviendo la versión vieja, así que desde afuera parecía que
todo estaba bien: QA quedó congelado en el estado de PR #32 y no recibió PR #33
(multimoneda PEN/USD) ni PR #34.

Los 4 secrets ya fueron reescritos con la IP nueva.

**Cómo diagnosticar esto si vuelve a pasar** (el síntoma es "el deploy no llega",
no un error visible en la app):

```bash
# 1. ¿Los workflows están fallando?  Buscar conclusion=failure.
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/marcostor13/detroit-viatika/actions/runs?per_page=20" \
  | jq -r '.workflow_runs[] | "\(.created_at) \(.name) \(.head_branch) \(.conclusion)"'

# 2. ¿Coolify responde donde creemos?  Debe devolver "OK".
curl -s --max-time 10 http://190.102.150.169:8000/api/v1/health

# 3. ¿A dónde apunta el DNS hoy?  Debe coincidir con el host de Coolify.
nslookup qa-detroit-viatika.tecdidata.com
```

**Pendiente recomendado**: crear un A record `coolify.tecdidata.com` (DNS-only)
y usar ese hostname en los secrets en vez de la IP pelada. La próxima migración
se resolvería con un cambio de DNS en vez de reescribir 4 secrets.

### Resuelto — SSH de Coolify
El bloqueo de SSH (`ssh: connect to host host.docker.internal port 22: Operation timed out`) que impedía cualquier deploy ya no está presente: `POST /api/v1/servers/{uuid}/validate` confirma `is_reachable: true` y un deploy real de prueba completó el ciclo build+run. No quedó registro de qué lo arregló (probablemente se resolvió del lado de la VPS entre la sesión anterior y esta); si vuelve a aparecer, revisar `sshd` y `~/.ssh/authorized_keys` del usuario `root` en la VPS.

### Bugs reales encontrados y arreglados (no eran infraestructura)
Una vez destrabado el SSH, las 4 apps seguían sin funcionar por dos bugs de código/repo, no de Coolify:

1. **Backend crasheaba en loop de reinicio** (`restarting:unknown` en Coolify): `AccountingEntriesService` tiraba `Error: DEEPSEEK_API_KEY no configurada` en el constructor, y `AccountingEntriesModule` se importa eagerly en `AppModule` — tumbaba toda la app en cada boot, en develop y en main. El código ya tenía un fallback try/catch ("deducible" por defecto si la IA falla) que nunca se alcanzaba porque el crash ocurría antes. Fix: `openai` pasa a ser `OpenAI | null`, se loguea un warning si falta la key en vez de tirar, y el call site cae al fallback existente. Commits `6d82f31` (develop) y `e146eb8` (main, aplicado directo por ser historias de git independientes — ver nota abajo).
2. **`frontend-main` no compilaba**: a `main` nunca le llegaron `viatika/Dockerfile`, `viatika/nginx.conf` ni `viatika/.dockerignore` — solo existían en `develop`. Error: `failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory`. Fix: copiados a `main` (commit `8c86b8e`), idénticos a los de `develop`.

**Nota histórica (ya no vigente)**: durante la migración `main` y `develop`
quedaron como historiales de git **independientes** (dos monorepos fusionados
por separado), y por eso los fixes de arriba se aplicaron como cambio puntual en
cada rama en vez de mergear. Eso se terminó con el **PR #35** (`21c1e2c`,
5-Ago-2026), que mergeó `develop` en `main`: hoy `git merge-base --is-ancestor
origin/develop origin/main` da verdadero, o sea `main` contiene todo `develop`.
De acá en más el flujo normal `develop → main` por PR funciona y no hace falta
cherry-pick.

### Pendiente
1. Probar login, subida de comprobantes (S3), notificaciones por email en develop y producción.
2. Apagar Netlify (sección 5).
3. Archivar `detroit-viatika-back` en GitHub (Settings → Danger Zone → Archive).
4. Opcional: pedir a Coolify un `COOLIFY_TOKEN_DEVELOP` válido si se quiere aislar accesos por equipo/entorno más adelante.
5. Opcional: documentar `DEEPSEEK_API_KEY` en `viatika-back/.env.example` (u otra variable equivalente) para que quede claro que es opcional y qué feature depende de ella.

---

## Config en el repo (ya en `main` y `develop`)
- `viatika/Dockerfile`, `viatika/nginx.conf`, `viatika/.dockerignore` — build de producción del frontend, ARGs `API_URL`/`GOOGLE_MAPS_API_KEY`/`STORAGE_KEY`/`STORAGE_PATH` consumidos por `scripts/set-env.js` en build time.
- `viatika-back/Dockerfile` — ya existía, sin cambios.
- `.github/workflows/deploy-{frontend,backend}-{develop,main}.yml` — dispara el deploy de Coolify solo cuando cambian archivos de su carpeta.
- `docker-compose.yml` (raíz) — solo para levantar front+back local con Docker; Coolify no lo usa.
- `.gitignore` (raíz) — incluye `.env.deploy`, `.git.bak`, `.codebase-memory`.

⚠️ **Nota puerto backend**: `viatika-back/Dockerfile` expone 3040; ya se seteó `PORT=3040` como variable de entorno en las 2 apps backend para que coincida.

✅ **Build args frontend confirmados**: pese al 422 de `inject_build_args_to_dockerfile`, Coolify pasa `API_URL`/`GOOGLE_MAPS_API_KEY` correctamente como `--build-arg` (verificado grepeando el bundle servido en ambos dominios: apunta a `tecdidata.com`, no al dominio viejo `apiviatika.marcostorresalarcon.com` que es el fallback silencioso de `scripts/set-env.js` cuando `API_URL` no está seteada).

---

## 5. Decomisionar Netlify (pendiente, hacer después de validar los deploys)

1. Confirmar que `frontend-main` y `frontend-develop` en Coolify sirven correctamente en sus dominios antes de tocar nada.
2. En Netlify: quitar el dominio custom del sitio (o pausar el sitio).
3. Eliminar el sitio de Netlify cuando esté confirmado que no hay tráfico.
4. `viatika/netlify.toml` puede eliminarse del repo (ya no se usa).

---

## Checklist de verificación

- [x] `git log` en `main` y `develop` del monorepo muestra ambas carpetas.
- [x] 4 apps creadas en Coolify con config correcta.
- [x] Secrets de GitHub Actions cargados.
- [x] DNS de Cloudflare apuntando a Coolify.
- [x] SSH del servidor Coolify funcionando.
- [x] Las 4 apps responden en sus dominios con TLS válido.
- [x] Push a `develop` con cambios en `viatika-back/**` disparó solo `deploy-backend-develop.yml` (confirmado en este ciclo).
- [x] Secrets `COOLIFY_*_WEBHOOK_URL` apuntando a la IP vigente del servidor (`190.102.150.169`).
- [ ] `coolify.tecdidata.com` creado en Cloudflare y usado en los secrets en vez de la IP.
- [ ] Login, subida de comprobantes (S3) y notificaciones por email funcionan en ambos entornos.
- [ ] Netlify decomisionado.
- [ ] `detroit-viatika-back` archivado en GitHub.
