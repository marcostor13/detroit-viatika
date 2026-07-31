# Plan de despliegue: monorepo en Coolify (develop + producción)

**Estado: ejecutado hasta el punto donde bloquea la infraestructura de Coolify. Ver sección 0.**

| | Antes | Después |
|---|---|---|
| Frontend | Netlify, repo `detroit-viatika` | Coolify, monorepo `detroit-viatika`, carpeta `viatika/` |
| Backend | Coolify (servidor viejo, otro host) | Coolify develop + producción, monorepo `detroit-viatika`, carpeta `viatika-back/` |
| Repos | 2 repos separados | 1 repo (`detroit-viatika`, reutilizado) con 2 carpetas |

---

## 0. Estado real (actualizado)

### Hecho
- **Monorepo restructurado y pusheado.** `main` = contenido de los `main` originales de cada repo; `develop` = contenido de trabajo actual (rama `marcos` de ambos repos al momento de la migración). Historial de commits del frontend preservado en `viatika/.git.bak` localmente (no en el repo); los 65 commits que solo existían en local ya están respaldados en `origin/marcos` de `detroit-viatika`.
- **Coolify** (`http://161.132.166.142:8000`, proyecto `l68ih0sk7lba2eury9b2sn6d` "My first project"): 4 apps creadas y completamente configuradas (repo, rama, Dockerfile, base directory, puerto, dominio, variables de entorno, auto-deploy nativo desactivado):
  | App | UUID | Dominio |
  |---|---|---|
  | viatika-frontend-develop | `hpthjhif64pglhrhnt1n239t` | qa-detroit-viatika.tecdidata.com |
  | viatika-backend-develop | `ceyhrauio16o1yn5hs4v3hhy` | qa-apidetroit-viatika.tecdidata.com |
  | viatika-frontend-main | `cyrw9v2hjyhqb78eeg59hbs7` | detroit.viatika.tecdidata.com |
  | viatika-backend-main | `e9e5t2mje9q9p6kq9ahphmp4` | apidetroit.viatika.tecdidata.com |
- **GitHub Actions**: 4 workflows con `paths:` filtrado, apuntando al endpoint de deploy de Coolify (`GET /api/v1/deploy?uuid=...` + `Authorization: Bearer`). 5 secrets ya cargados en el repo: `COOLIFY_API_TOKEN`, `COOLIFY_FRONTEND_DEVELOP_WEBHOOK_URL`, `COOLIFY_BACKEND_DEVELOP_WEBHOOK_URL`, `COOLIFY_FRONTEND_PROD_WEBHOOK_URL`, `COOLIFY_BACKEND_PROD_WEBHOOK_URL`.
- **Cloudflare DNS**: 4 registros A creados (DNS-only, sin proxy) apuntando a `161.132.166.142`. Zona `tecdidata.com` (id `11e92a4b421ed48ec43f0354eff0f312`). No se tocaron los registros existentes (`api.viatika...`, `app.viatika...`, `tema.viatika...` → apuntan a otro servidor/Netlify, fuera de este alcance).
- `COOLIFY_TOKEN_DEVELOP` (el de `.env.deploy`) es inválido (401). Se usó `COOLIFY_TOKEN_PRODUCTION` para todo, dado que solo hay un team/proyecto en esta instancia.

### Bloqueado — requiere que arregles el servidor
Los 2 intentos de deploy (`viatika-backend-develop`) fallaron con:
```
Deployment failed: ssh: connect to host host.docker.internal port 22: Operation timed out
```
El servidor "localhost" registrado en Coolify (el mismo host donde corre Coolify) no es alcanzable por SSH desde el contenedor de Coolify — confirmado con `POST /api/v1/servers/{uuid}/validate` (`is_reachable` pasó de `true` cacheado a `false` en vivo). Esto bloquea el deploy de las 4 apps por igual; no es un problema de configuración de la app.

**Para desbloquear**: en la VPS (161.132.166.142), verificar que `sshd` esté corriendo, que la clave pública de Coolify esté en `~/.ssh/authorized_keys` del usuario `root` (o el usuario configurado), y que el puerto 22 sea alcanzable desde el contenedor de Coolify hacia `host.docker.internal`. En Coolify: Servers → localhost → botón "Validate server" para reintentar el chequeo.

### Pendiente después de desbloquear
1. Disparar deploy de las 4 apps (manual desde Coolify o con `git push` una vez el workflow esté probado) y confirmar que build+healthcheck pasan.
2. Verificar TLS (Let's Encrypt) emitido en los 4 dominios.
3. Probar login, subida de comprobantes (S3), notificaciones por email en develop y producción.
4. Apagar Netlify (sección 5).
5. Archivar `detroit-viatika-back` en GitHub (Settings → Danger Zone → Archive).
6. Opcional: pedir a Coolify un `COOLIFY_TOKEN_DEVELOP` válido si se quiere aislar accesos por equipo/entorno más adelante.

---

## Config en el repo (ya en `main` y `develop`)
- `viatika/Dockerfile`, `viatika/nginx.conf`, `viatika/.dockerignore` — build de producción del frontend, ARGs `API_URL`/`GOOGLE_MAPS_API_KEY`/`STORAGE_KEY`/`STORAGE_PATH` consumidos por `scripts/set-env.js` en build time.
- `viatika-back/Dockerfile` — ya existía, sin cambios.
- `.github/workflows/deploy-{frontend,backend}-{develop,main}.yml` — dispara el deploy de Coolify solo cuando cambian archivos de su carpeta.
- `docker-compose.yml` (raíz) — solo para levantar front+back local con Docker; Coolify no lo usa.
- `.gitignore` (raíz) — incluye `.env.deploy`, `.git.bak`, `.codebase-memory`.

⚠️ **Nota puerto backend**: `viatika-back/Dockerfile` expone 3040; ya se seteó `PORT=3040` como variable de entorno en las 2 apps backend para que coincida.

⚠️ **Nota build args frontend**: el flag `inject_build_args_to_dockerfile` no existe en esta versión de Coolify (4.1.2) — devolvió 422. El Dockerfile del frontend ya declara los `ARG` necesarios; si tras el primer build exitoso `API_URL`/`GOOGLE_MAPS_API_KEY` no llegan al bundle (revisar `environment.prod.ts` generado o el bundle servido), avisar para ajustar la estrategia (por ejemplo, pasar los valores como `docker_compose_custom_build_command` o via `dockerfile` inline).

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
- [ ] SSH del servidor Coolify funcionando (bloqueado, ver sección 0).
- [ ] Las 4 apps responden en sus dominios con TLS válido.
- [ ] Push a `develop` solo con cambios en `viatika-back/**` → solo corre `deploy-backend-develop.yml` (probar una vez el deploy inicial funcione).
- [ ] Login, subida de comprobantes (S3) y notificaciones por email funcionan en ambos entornos.
- [ ] Netlify decomisionado.
- [ ] `detroit-viatika-back` archivado en GitHub.
