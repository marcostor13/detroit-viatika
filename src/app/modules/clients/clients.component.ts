import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ClientService } from '../../services/client.service';
import { IClient } from '../../interfaces/user.interface';
import { NotificationService } from '../../services/notification.service';

@Component({
    selector: 'app-clients',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './clients.component.html',
})
export class ClientsComponent implements OnInit {
    private clientService = inject(ClientService);
    private notificationService = inject(NotificationService);

    clients = signal<IClient[]>([]);
    loading = signal(false);
    showForm = signal(false);
    editingClient = signal<IClient | null>(null);

    newClient: Partial<IClient> = {
        codigo: '',
        comercialName: '',
        businessName: '',
        businessId: '',
        address: '',
        phone: '',
        email: '',
        logo: ''
    };

    ngOnInit() {
        this.loadClients();
    }

    loadClients() {
        this.loading.set(true);
        this.clientService.getClients().subscribe({
            next: (data) => {
                this.clients.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                this.notificationService.show('Error al cargar clientes', 'error');
                this.loading.set(false);
            }
        });
    }

    saveClient() {
        if (this.editingClient()) {
            this.clientService.updateClient(this.editingClient()!._id, this.newClient).subscribe({
                next: () => {
                    this.notificationService.show('Cliente actualizado', 'success');
                    this.loadClients();
                    this.closeForm();
                }
            });
        } else {
            this.clientService.createClient(this.newClient).subscribe({
                next: () => {
                    this.notificationService.show('Cliente creado', 'success');
                    this.loadClients();
                    this.closeForm();
                }
            });
        }
    }

    editClient(client: IClient) {
        this.editingClient.set(client);
        this.newClient = { ...client };
        this.showForm.set(true);
    }

    openNewForm() {
        this.editingClient.set(null);
        this.newClient = {
            codigo: '',
            comercialName: '',
            businessName: '',
            businessId: '',
            address: '',
            phone: '',
            email: '',
            logo: ''
        };
        this.showForm.set(true);
    }

    closeForm() {
        this.showForm.set(false);
        this.editingClient.set(null);
    }
}
