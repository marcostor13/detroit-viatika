## Registro de nuevo cliente con usuario y configuración SUNAT

Este documento describe el endpoint para registrar un **nuevo cliente**, crear su **usuario administrador inicial** (con contraseña temporal) y guardar su **configuración SUNAT**, enviando al final un correo de bienvenida con las credenciales de acceso.

---

## Endpoint

- **Método**: `POST`
- **URL**: `/api/client/register-with-user`
- **Auth**: Requiere JWT válido
- **Roles permitidos**: `SUPER_ADMIN`

Controlador: `ClientController`  
Servicio orquestador: `ClientOnboardingService`

---

## Payload (body)

```json
{
  "client": {
    "comercialName": "Viatika SAC",
    "businessName": "Viatika Servicios Empresariales SAC",
    "businessId": "20123456789",
    "address": "Av. Siempre Viva 123",
    "phone": "999888777",
    "email": "contacto@viatika.com",
    "logo": "https://mi-cdn.com/logos/viatika.png"
  },
  "adminUser": {
    "name": "Juan Pérez",
    "email": "juan.perez@viatika.com",
    "roleId": "<ID_DEL_ROLE_ADMIN>"
  },
  "sunatConfig": {
    "clientIdSunat": "cliente_extranet_sunat_id",
    "clientSecret": "secreto_sunat",
    "isActive": true
  }
}
```

### Desglose de objetos

- **client** (`CreateClientDto`)
  - `comercialName` (string, requerido)
  - `businessName` (string, requerido)
  - `businessId` (string, requerido) → RUC
  - `address` (string, requerido)
  - `phone` (string, requerido)
  - `email` (string, requerido)
  - `logo` (string, opcional)

- **adminUser**
  - `name` (string, requerido)
  - `email` (string, requerido, email válido)
  - `roleId` (string, requerido, ObjectId de rol, por ejemplo rol ADMIN del cliente)

- **sunatConfig**
  - `clientIdSunat` (string, requerido) → client_id de SUNAT
  - `clientSecret` (string, requerido)
  - `isActive` (boolean, opcional, por defecto `true`)

---

## Flujo interno

1. **Transacción Mongoose**
   - Se inicia una sesión de Mongoose y una transacción.
2. **Crear cliente**
   - Se inserta un documento en la colección `clients` (`ClientService.create` con `session`).
3. **Crear usuario administrador**
   - Se genera una **contraseña temporal** aleatoria.
   - Se crea un usuario en la colección `users` (`UserService.create`), que se encarga de hashear la contraseña.
   - El usuario queda asociado al `clientId` recién creado y al `roleId` enviado.
   - El usuario se crea por defecto con `isActive: false` (queda inactivo hasta que se active explícitamente).
4. **Crear configuración SUNAT**
   - Se inserta un documento en la colección `sunatconfigs` (`SunatConfigService.create` con `session`), asociado al `clientId` recién creado.
   - Se valida que no exista ya una configuración SUNAT para ese cliente.
5. **Commit / rollback**
   - Si todo lo anterior es exitoso, se hace `commit` de la transacción.
   - Si algo falla, se hace `abort` y no se persiste ningún dato parcial.
6. **Correo de bienvenida**
   - Fuera de la transacción, se envía un correo de bienvenida al email de `adminUser`.
   - Se utiliza `EmailService.sendProviderWelcomeEmail`, con:
     - Nombre(s) y apellido(s) del usuario.
     - Contraseña temporal generada.
     - Link de acceso: `http://app.viatika.tecdidata.com/login`.

---

## Respuesta exitosa (`200 OK`)

```json
{
  "message": "Cliente registrado correctamente con usuario y configuración SUNAT",
  "client": {
    "_id": "675f0c4d9a2c3a4f1a234567",
    "comercialName": "Viatika SAC",
    "businessName": "Viatika Servicios Empresariales SAC",
    "businessId": "20123456789",
    "address": "Av. Siempre Viva 123",
    "phone": "999888777",
    "email": "contacto@viatika.com",
    "logo": "https://mi-cdn.com/logos/viatika.png",
    "createdAt": "2025-12-23T10:15:30.000Z",
    "updatedAt": "2025-12-23T10:15:30.000Z"
  },
  "adminUser": {
    "_id": "675f0c4d9a2c3a4f1a298765",
    "email": "juan.perez@viatika.com",
    "name": "Juan Pérez",
    "role": {
      "_id": "671234abcd5678ef90123456",
      "name": "ADMIN"
    },
    "isActive": true
  },
  "sunatConfig": {
    "_id": "675f0c4d9a2c3a4f1a212345",
    "clientId": "675f0c4d9a2c3a4f1a234567",
    "clientIdSunat": "cliente_extranet_sunat_id",
    "clientSecret": "********",
    "isActive": true
  }
}
```

> Nota: la contraseña **no** se devuelve en la respuesta; solo se envía por correo al usuario administrador.

---

## Ejemplo de llamada desde frontend (Angular)

Ejemplo usando `HttpClient`:

```ts
// client-onboarding.service.ts (frontend)
import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'

export interface CreateClientPayload {
  client: {
    comercialName: string
    businessName: string
    businessId: string
    address: string
    phone: string
    email: string
    logo?: string
  }
  adminUser: {
    name: string
    email: string
    roleId: string
  }
  sunatConfig: {
    clientIdSunat: string
    clientSecret: string
    isActive?: boolean
  }
}

@Injectable({ providedIn: 'root' })
export class ClientOnboardingApiService {
  private readonly baseUrl = '/api/client'

  constructor(private http: HttpClient) {}

  registerClientWithUserAndSunat(payload: CreateClientPayload) {
    return this.http.post(`${this.baseUrl}/register-with-user`, payload)
  }
}
```

Uso en un componente:

```ts
this.clientOnboardingApiService
  .registerClientWithUserAndSunat(formValue)
  .subscribe({
    next: response => {
      // Mostrar mensaje de éxito, redirigir, etc.
    },
    error: err => {
      // Manejo de errores en UI
    },
  })
```

---

## Errores comunes

- `401 Unauthorized` / `403 Forbidden`
  - Token inválido o usuario sin rol `SUPER_ADMIN`.
- `400 Bad Request`
  - Payload inválido (validaciones de `class-validator` fallan).
- `409 Conflict` / `400` genérico desde servicios internos
  - Ya existe una configuración SUNAT para ese cliente.
  - El email del usuario ya está registrado en el sistema.
- `500 Internal Server Error`
  - Error inesperado en la transacción o en la lógica interna.

La creación de cliente, usuario y configuración SUNAT es **atómica**: si alguna parte falla durante la transacción, no se guarda nada en la base de datos.
