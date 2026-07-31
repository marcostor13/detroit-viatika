# Plan de despliegue: monorepo en Coolify (develop + producción)

Estado actual vs. destino:

| | Antes | Después |
|---|---|---|
| Frontend | Netlify, repo `detroit-viatika` (rama `marcos`/`main`) | Coolify, monorepo `detroit-viatika`, carpeta `viatika/` |
| Backend | Coolify develop, repo `detroit-viatika-back` (rama `develop`) | Coolify develop + producción, monorepo `detroit-viatika`, carpeta `viatika-back/` |
| Repos | 2 repos separados | 1 repo (`detroit-viatika`, reutilizado) con 2 carpetas |

Config ya preparada en este repo (no requiere tocar GitHub/Coolify/Cloudflare):
- `viatika/Dockerfile`, `viatika/nginx.conf`, `viatika/.dockerignore` — build de producción del frontend servido por nginx.
- `viatika-back/Dockerfile` — ya existía, sin cambios.
- `.github/workflows/deploy-{frontend,backend}-{develop,main}.yml` — 4 workflows, cada uno dispara un webhook de Coolify solo cuando cambian archivos de su carpeta (`paths:`), para no redeployar el backend por un cambio de frontend y viceversa.
- `docker-compose.yml` (raíz) — solo para levantar front+back localmente con Docker; Coolify no lo usa, construye cada app por separado desde su Dockerfile.
- `.gitignore` (raíz) — incluye `.env.deploy`.

Todo lo de abajo requiere las credenciales de `.env.deploy` (GitHub, Coolify, Cloudflare) y no se ha ejecutado — son los pasos a correr cuando confirmes el plan.

---

## 1. Restructurar a monorepo (local)

`C:\Marcos\Proyectos\Detroit\viatika` (esta carpeta) pasa a ser la raíz del repo único. `viatika/` y `viatika-back/` son hoy dos repos git independientes (remotos `detroit-viatika` y `detroit-viatika-back`); hay que quitarles el `.git` propio y convertir la carpeta padre en el único repo.

**Decisión tomada**: se reutiliza el repo `detroit-viatika` (mismo nombre, mismo remoto). El historial de commits del frontend **se conserva** (no se hace force-push destructivo de su historial); el backend entra como carpeta nueva sin importar su historial de commits (monorepo limpio, según lo acordado). El repo `detroit-viatika-back` queda intacto en GitHub como archivo histórico, sin más commits.

```bash
cd C:\Marcos\Proyectos\Detroit\viatika

# 1. Quitar el remoto/historial propio de viatika-back (no se pierde el código,
#    solo se deja de trackear como repo independiente)
rm -rf viatika-back/.git

# 2. Usar el repo de viatika/ (con su historial) como base del monorepo:
#    mover su .git a la raíz.
mv viatika/.git .git
git checkout main   # o la rama que corresponda; frontend hoy está en "marcos"

# 3. Añadir el backend y los archivos nuevos de la raíz
git add viatika-back .github docker-compose.yml .gitignore
git add viatika/Dockerfile viatika/nginx.conf viatika/.dockerignore
git commit -m "Convertir a monorepo: agregar viatika-back/, workflows de deploy y Docker del frontend"

# 4. Repetir el mismo commit (cherry-pick o rebase) sobre develop
git checkout develop
git merge main --no-edit   # o cherry-pick del commit anterior
```

Después de esto, `git status` en la raíz debe mostrar un único repo con `viatika/` y `viatika-back/` como carpetas normales (sin `.git` anidados). Verificar con `git log --oneline -1` en ambas ramas antes de continuar.

---

## 2. GitHub

Repo ya existe (`marcostor13/detroit-viatika`), solo hace falta:

1. Push del monorepo restructurado:
   ```bash
   git push origin main
   git push origin develop
   ```
2. Confirmar que `main` es la rama por defecto en GitHub (Settings → Branches).
3. Agregar 4 **Repository secrets** (Settings → Secrets and variables → Actions), con las URLs de webhook que Coolify genera al crear cada app (paso 3):
   - `COOLIFY_FRONTEND_DEVELOP_WEBHOOK_URL`
   - `COOLIFY_BACKEND_DEVELOP_WEBHOOK_URL`
   - `COOLIFY_FRONTEND_PROD_WEBHOOK_URL`
   - `COOLIFY_BACKEND_PROD_WEBHOOK_URL`
4. Repo `detroit-viatika-back`: archivar (Settings → Danger Zone → Archive) o al menos desactivar su Actions (`deploy.yml` ya apunta a Coolify develop; si se deja activo y alguien pushea ahí por error, redeployaría el backend viejo standalone). Recomendado: archivar.

---

## 3. Coolify — crear 4 apps

Mismo servidor Coolify (`COOLIFY_URL`), pero cada entorno usa un token distinto (`COOLIFY_TOKEN_DEVELOP` / `COOLIFY_TOKEN_PRODUCTION`) — probablemente proyectos/equipos separados dentro de la misma instancia. Crear:

| App | Token | Rama | Base directory | Dockerfile | Puerto | Dominio |
|---|---|---|---|---|---|---|
| viatika-frontend-develop | DEVELOP | `develop` | `/viatika` | `Dockerfile` | 80 | `FRONTEND_DOMAIN_DEVELOP` |
| viatika-backend-develop | DEVELOP | `develop` | `/viatika-back` | `Dockerfile` | 3040 | `BACKEND_DOMAIN_DEVELOP` |
| viatika-frontend-main | PRODUCTION | `main` | `/viatika` | `Dockerfile` | 80 | `FRONTEND_DOMAIN_PROD` |
| viatika-backend-main | PRODUCTION | `main` | `/viatika-back` | `Dockerfile` | 3040 | `BACKEND_DOMAIN_PROD` |

Para cada una (UI de Coolify: New Resource → Application → Public/Private Git Repository):

1. Repository: `https://github.com/marcostor13/detroit-viatika`, branch según tabla.
2. Build Pack: **Dockerfile**. Base Directory: según tabla (esto es lo que hace posible el monorepo — Coolify solo usa esa subcarpeta como contexto de build).
3. Port: según tabla (el frontend expone 80 dentro del contenedor vía nginx; el backend expone 3040).
4. **Automatic deployment on push**: desactivar el auto-deploy nativo de Coolify (para que el disparo lo controlen los 4 GitHub Actions con `paths:` y no se redeploye por cambios ajenos a la carpeta). En su lugar, copiar la **Webhook URL** de cada app (Settings → Webhooks) y pegarla como el secret de GitHub correspondiente (paso 2.3).
5. Variables de entorno:
   - **Backend** (`viatika-back/.env.example` tiene la lista completa): `MONGO_URI`, `CLIENT_ID`, `CLIENT_SECRET`, `PORT=3040` (⚠️ ver nota abajo), `PASSRAMDOM`, `JWT_SECRET`, `EMAIL_PROVIDER`, `USER_EMAIL`, `PASSWORD_EMAIL`, `EMAILS_ENABLED`, `OPENAI_API_KEY`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `GHP_TOKEN`, `SCHEDULER_TEST_KEY`. Valores distintos para develop vs. main (Mongo/S3 separados si aplica).
   - **Frontend**: marcar como **Build Variables** (no runtime — se consumen en build time vía `scripts/set-env.js`/Docker `ARG`): `API_URL` (develop → `BACKEND_DOMAIN_DEVELOP`, main → `BACKEND_DOMAIN_PROD`, con `https://` y sufijo `/api`), `GOOGLE_MAPS_API_KEY`, opcional `STORAGE_KEY`/`STORAGE_PATH`.
6. Domains: agregar el dominio de la tabla; Coolify emite el certificado TLS automáticamente (Let's Encrypt) una vez el DNS resuelva (paso 4).
7. Health check: backend no tiene endpoint `/health` explícito revisado — usar `GET /api` o desactivar health check si responde 404; frontend usa el default de nginx (200 en `/`).

⚠️ **Nota puerto backend**: `viatika-back/Dockerfile` hace `EXPOSE 3040` y el `CMD` corre `dist/main` que escucha en `process.env.PORT ?? 3000`. Definir `PORT=3040` como variable de entorno en Coolify para que coincida con el puerto expuesto/mapeado (si se deja el default de `.env.example`, 3016, Coolify enrutaría al puerto equivocado).

---

## 4. Cloudflare DNS

Con `CLOUDFLARE_API_TOKEN`, crear/actualizar 4 registros (tipo A o CNAME, según si Coolify usa IP fija o proxy) apuntando al servidor de Coolify (`161.132.166.142`), con proxy de Cloudflare **desactivado** (DNS only) si Coolify gestiona su propio TLS vía Let's Encrypt, para evitar conflicto de certificados:

- `apidetroit.viatika.tecdidata.com` → backend-main
- `detroit.viatika.tecdidata.com` → frontend-main
- `qa-apidetroit-viatika.tecdidata.com` → backend-develop
- `qa-detroit-viatika.tecdidata.com` → frontend-develop

---

## 5. Decomisionar Netlify

1. Confirmar que `frontend-main` y `frontend-develop` en Coolify sirven correctamente en sus dominios QA antes de tocar nada en producción.
2. En Netlify: quitar el dominio custom del sitio (o pausar el sitio) una vez el DNS de Cloudflare apunte a Coolify.
3. Eliminar el sitio de Netlify (o dejarlo desconectado del repo) cuando esté confirmado que no hay tráfico.
4. `viatika/netlify.toml` puede quedar en el repo sin efecto (no se usa fuera de Netlify) o eliminarse — recomendado eliminarlo para que no confunda a futuro.

---

## 6. Checklist de verificación

- [ ] `git log` en `main` y `develop` del monorepo muestra ambas carpetas.
- [ ] Push a `develop` solo con cambios en `viatika-back/**` → solo corre `deploy-backend-develop.yml`.
- [ ] Push a `develop` solo con cambios en `viatika/**` → solo corre `deploy-frontend-develop.yml`.
- [ ] Las 4 apps en Coolify responden en sus dominios con TLS válido.
- [ ] Frontend develop apunta a backend develop (`API_URL` correcto), frontend prod a backend prod.
- [ ] Login, subida de comprobantes (S3) y notificaciones por email funcionan en ambos entornos.
- [ ] Netlify decomisionado y DNS solo apunta a Coolify.
- [ ] `detroit-viatika-back` archivado en GitHub.

---

## Pendiente de tu confirmación antes de ejecutar

Este documento es el plan; nada de lo anterior se ha ejecutado (no se crearon repos, apps de Coolify ni registros DNS). Cuando confirmes, se ejecuta en este orden: (1) restructurar y pushear el monorepo, (2) crear las 4 apps en Coolify, (3) DNS, (4) verificar, (5) apagar Netlify y archivar el repo viejo.
