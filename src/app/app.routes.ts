import { Routes } from '@angular/router';
import InvoicesComponent from './modules/invoices/invoices.component';
import AddInvoiceComponent from './modules/invoices/add-invoice/add-invoice.component';
import { AuthColaboradorGuard } from './guards/auth-colaborador.guard';
import { AuthAdmin2Guard } from './guards/auth-admin2.guard';
import { AuthSuperGuard } from './guards/auth-super.guard';
import { AuthTesoreroGuard } from './guards/auth-tesorero.guard';
import { AuthViaticosGuard } from './guards/auth-viaticos.guard';
import { defaultRedirectGuard } from './guards/default-redirect.guard';
import { authModuleGuard } from './guards/auth-module.guard';
import { MainComponent } from './layouts/main/main.component';
import AdminUsersComponent from './modules/admin-users/admin-users.component';
import { CreateUserComponent } from './modules/admin-users/create-user/create-user.component';
import { ConfiguracionComponent } from './modules/configuracion/configuracion.component';
import { ClientOnboardingComponent } from './modules/super-admin/client-onboarding/client-onboarding.component';
import { ClientsAdminComponent } from './modules/clients-admin/clients-admin.component';

export const routes: Routes = [
  {
    path: '',
    component: MainComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [defaultRedirectGuard],
        loadComponent: () =>
          import('./layouts/main/main.component').then((m) => m.MainComponent),
      },
      {
        path: 'invoices',
        component: InvoicesComponent,
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'invoices/add',
        component: AddInvoiceComponent,
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'invoices/edit/:id',
        component: AddInvoiceComponent,
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'invoices/:id/details',
        loadComponent: () =>
          import('./modules/invoices/invoice-detail/invoice-detail.component').then(
            (m) => m.InvoiceDetailComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./modules/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent
          ),
        canActivate: [authModuleGuard('consolidated-invoices')],
      },
      {
        path: 'consolidated-invoices',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'notificaciones',
        loadComponent: () =>
          import(
            './modules/notifications/notification-list.component'
          ).then((m) => m.NotificationListComponent),
      },
      {
        path: 'dashboard/add-category',
        loadComponent: () =>
          import(
            './modules/consolidated-invoices/add-category/add-category.component'
          ).then((m) => m.AddCategoryComponent),
        canActivate: [authModuleGuard('consolidated-invoices', true)],
      },
      {
        path: 'dashboard/edit-category/:id',
        loadComponent: () =>
          import(
            './modules/consolidated-invoices/add-category/add-category.component'
          ).then((m) => m.AddCategoryComponent),
        canActivate: [authModuleGuard('consolidated-invoices', true)],
      },
      {
        path: 'dashboard/add-project',
        loadComponent: () =>
          import(
            './modules/consolidated-invoices/add-project/add-project.component'
          ).then((m) => m.AddProjectComponent),
        canActivate: [authModuleGuard('consolidated-invoices', true)],
      },
      {
        path: 'dashboard/edit-project/:id',
        loadComponent: () =>
          import(
            './modules/consolidated-invoices/add-project/add-project.component'
          ).then((m) => m.AddProjectComponent),
        canActivate: [authModuleGuard('consolidated-invoices', true)],
      },
      {
        path: 'admin-users',
        component: AdminUsersComponent,
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'admin-users/create-user',
        component: CreateUserComponent,
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'admin-users/create-user/:id',
        component: CreateUserComponent,
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'admin-users/:id/details',
        loadComponent: () =>
          import('./modules/admin-users/user-details/user-details.component').then(
            (m) => m.UserDetailsComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'admin-users/:id/permisos',
        loadComponent: () =>
          import('./modules/admin-users/user-permissions/user-permissions.component').then(
            (m) => m.UserPermissionsComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'admin-users/bulk-import',
        loadComponent: () =>
          import('./modules/admin-users/bulk-import/admin-users-bulk-import.component').then(
            (m) => m.AdminUsersBulkImportComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'rendiciones',
        loadComponent: () =>
          import('./modules/admin-users/rendiciones-admin/rendiciones-tabs.component').then(
            (m) => m.RendicionesTabsComponent
          ),
        canActivate: [authModuleGuard('rendiciones')],
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./modules/configuracion/configuracion.component').then(
            (m) => m.ConfiguracionComponent
          ),
        canActivate: [authModuleGuard('configuracion')],
      },
      {
        path: 'lineas-negocio',
        loadComponent: () =>
          import('./modules/lineas-negocio/lineas-negocio.component').then(
            (m) => m.LineasNegocioComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'lineas-negocio/nueva',
        loadComponent: () =>
          import(
            './modules/lineas-negocio/form/lineas-negocio-form.component'
          ).then((m) => m.LineasNegocioFormComponent),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'lineas-negocio/:id/editar',
        loadComponent: () =>
          import(
            './modules/lineas-negocio/form/lineas-negocio-form.component'
          ).then((m) => m.LineasNegocioFormComponent),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'ordenes-trabajo',
        loadComponent: () =>
          import('./modules/ordenes-trabajo/ordenes-trabajo.component').then(
            (m) => m.OrdenesTrabajoComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'ordenes-trabajo/nueva',
        loadComponent: () =>
          import(
            './modules/ordenes-trabajo/form/ordenes-trabajo-form.component'
          ).then((m) => m.OrdenesTrabajoFormComponent),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'ordenes-trabajo/:id/editar',
        loadComponent: () =>
          import(
            './modules/ordenes-trabajo/form/ordenes-trabajo-form.component'
          ).then((m) => m.OrdenesTrabajoFormComponent),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'mi-perfil',
        loadComponent: () =>
          import('./modules/mi-perfil/mi-perfil.component').then(
            (m) => m.MiPerfilComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./modules/clients/clients.component').then(
            (m) => m.ClientsComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'inicio',
        loadComponent: () =>
          import('./modules/inicio/inicio.component').then(
            (m) => m.InicioComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mis-rendiciones',
        loadComponent: () =>
          import('./modules/mis-rendiciones/mis-rendiciones.component').then(
            (m) => m.MisRendicionesComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mis-rendiciones/nueva',
        loadComponent: () =>
          import('./modules/mis-rendiciones/nueva-rendicion-directa/nueva-rendicion-directa.component').then(
            (m) => m.NuevaRendicionDirectaComponent
          ),
        canActivate: [authModuleGuard('nueva-rendicion')],
      },
      {
        path: 'mis-rendiciones/gasto/:id',
        loadComponent: () =>
          import('./modules/mis-rendiciones/gasto-detalle/gasto-detalle.component').then(
            (m) => m.GastoDetalleComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mis-rendiciones/solicitud-viaticos/nueva',
        loadComponent: () =>
          import('./modules/mis-rendiciones/solicitud-viaticos/solicitud-viaticos.component').then(
            (m) => m.SolicitudViaticosComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mis-rendiciones/solicitud-viaticos/:id/editar',
        loadComponent: () =>
          import('./modules/mis-rendiciones/solicitud-viaticos/solicitud-viaticos.component').then(
            (m) => m.SolicitudViaticosComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mis-rendiciones/:id/detalle',
        loadComponent: () =>
          import('./modules/mis-rendiciones/rendicion-detail/rendicion-detail.component').then(
            (m) => m.RendicionDetailComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mi-firma',
        loadComponent: () =>
          import('./modules/firma-digital/firma-digital.component').then(
            (m) => m.FirmaDigitalComponent
          ),
      },
      {
        path: 'viaticos/:id',
        loadComponent: () =>
          import('./modules/viaticos/viaticos-detail/viaticos-detail.component').then(
            (m) => m.ViaticosDetailComponent
          ),
        canActivate: [AuthViaticosGuard],
      },
      {
        path: 'rendiciones-directas',
        redirectTo: '/rendiciones?tab=directas',
        pathMatch: 'full',
      },
      {
        path: 'tesoreria',
        loadComponent: () =>
          import('./modules/tesoreria/tesoreria.component').then(
            (m) => m.TesoreriaComponent
          ),
        canActivate: [AuthTesoreroGuard],
      },
      {
        path: 'tesoreria/rendicion-directa/nueva',
        loadComponent: () =>
          import('./modules/tesoreria/nueva-rendicion-directa-deposito/nueva-rendicion-directa-deposito.component').then(
            (m) => m.NuevaRendicionDirectaDepositoComponent
          ),
        canActivate: [AuthTesoreroGuard],
      },
      {
        path: 'tesoreria/:id',
        loadComponent: () =>
          import('./modules/tesoreria/tesoreria-detalle/tesoreria-detalle.component').then(
            (m) => m.TesoreriaDetalleComponent
          ),
        canActivate: [AuthTesoreroGuard],
      },
      {
        path: 'centros-de-costo',
        loadComponent: () =>
          import('./modules/centros-de-costo/centros-de-costo.component').then(
            (m) => m.CentrosDeCostoComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'centros-de-costo/form',
        loadComponent: () =>
          import('./modules/centros-de-costo/form/centros-de-costo-form.component').then(
            (m) => m.CentrosDeCostoFormComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'centros-de-costo/form/:id',
        loadComponent: () =>
          import('./modules/centros-de-costo/form/centros-de-costo-form.component').then(
            (m) => m.CentrosDeCostoFormComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'centros-de-costo/bulk-import',
        loadComponent: () =>
          import('./modules/centros-de-costo/bulk-import/centros-de-costo-bulk-import.component').then(
            (m) => m.CentrosDeCostoBulkImportComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'categorias',
        loadComponent: () =>
          import('./modules/categorias/categorias.component').then(
            (m) => m.CategoriasComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'categorias/nueva',
        loadComponent: () =>
          import('./modules/categorias/categoria-form/categoria-form.component').then(
            (m) => m.CategoriaFormComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'categorias/:id/editar',
        loadComponent: () =>
          import('./modules/categorias/categoria-form/categoria-form.component').then(
            (m) => m.CategoriaFormComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
      {
        path: 'audit-log',
        loadComponent: () =>
          import('./modules/audit-log/audit-log.component').then(
            (m) => m.AuditLogComponent
          ),
        canActivate: [authModuleGuard('audit-log', true)],
      },
      {
        path: 'caja-chica',
        loadComponent: () =>
          import('./modules/caja-chica/caja-chica.component').then(
            (m) => m.CajaChicaComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'mis-rendiciones/nueva-caja-chica',
        loadComponent: () =>
          import('./modules/mis-rendiciones/nueva-caja-chica/nueva-caja-chica.component').then(
            (m) => m.NuevaCajaChicaComponent
          ),
        canActivate: [AuthColaboradorGuard],
      },
      {
        path: 'rendiciones-caja-chica',
        redirectTo: '/rendiciones?tab=caja-chica',
        pathMatch: 'full',
      },
      {
        path: 'rendiciones-caja-chica/:id',
        loadComponent: () =>
          import('./modules/rendiciones-caja-chica/rendicion-caja-chica-detalle/rendicion-caja-chica-detalle.component').then(
            (m) => m.RendicionCajaChicaDetalleComponent
          ),
        canActivate: [AuthAdmin2Guard],
      },
    ],
  },
  {
    path: 'super/client-onboarding',
    component: ClientOnboardingComponent,
    canActivate: [AuthSuperGuard],
  },
  {
    path: 'clients-admin',
    component: ClientsAdminComponent,
    canActivate: [AuthSuperGuard],
  },
  {
    path: 'hub',
    loadComponent: () =>
      import('./modules/hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./modules/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'cambiar-contrasena',
    loadComponent: () =>
      import('./modules/cambiar-contrasena/cambiar-contrasena.component').then(
        (m) => m.CambiarContrasenaComponent
      ),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
