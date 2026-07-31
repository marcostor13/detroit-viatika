import {
  Component,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IInvoiceResponse } from '../../invoices/interfaces/invoices.interface';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { UserStateService } from '../../../services/user-state.service';
import { ExpenseService } from '../../../services/expense.service';
import { AdminUsersService } from '../../admin-users/services/admin-users.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

declare var Chart: any;

interface CollaboratorExpense {
  id: string;
  name: string;
  expenses: { [key: string]: number };
  color: string;
}

interface ProjectExpense {
  id: string;
  name: string;
  expenses: { [key: string]: number };
  color: string;
}

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './charts.component.html',
  styleUrls: ['./charts.component.scss'],
})
export class ChartsComponent implements OnInit, AfterViewInit {
  @ViewChild('projectsChart') projectsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoriesChart')
  categoriesChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('collaboratorsChart')
  collaboratorsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('collaboratorConsumptionChart')
  collaboratorConsumptionChartRef!: ElementRef<HTMLCanvasElement>;

  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);
  private expenseService = inject(ExpenseService);
  private adminUsersService = inject(AdminUsersService);
  private cdr = inject(ChangeDetectorRef);

  invoices: IInvoiceResponse[] = [];
  projects: IProject[] = [];
  categories: ICategory[] = [];
  users: IUserResponse[] = [];
  expenses: any[] = [];
  filteredExpenses: any[] = [];

  showCollaboratorsSection = true;
  showCollaboratorConsumptionSection = true;
  showProjectsSection = true;
  showCategoriesSection = true;
  showSummarySection = true;

  projectMap: Map<string, string> = new Map();
  categoryMap: Map<string, string> = new Map();

  dateFrom: string = this.getDefaultStartDate();
  dateTo: string = this.getDefaultEndDate();

  projectsChart: any = null;
  categoriesChart: any = null;
  collaboratorsChart: any = null;
  collaboratorConsumptionChart: any = null;

  chartLibraryLoaded = false;
  dataLoaded = false;

  chartColors = [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#8AC926',
    '#1982C4',
    '#FF595E',
    '#6A4C93',
    '#79C99E',
    '#C973FF',
    '#FFAA73',
    '#73B8FF',
    '#FF73A6',
  ];

  filterProject: string = '';
  filterCategory: string = '';
  filterCollaborator: string = '';

  get collaborators() {
    return this.users
      .filter((user) => user.role?.name === 'Colaborador')
      .map((user) => ({
        id: user._id || '',
        name: user.name || user.email || 'Usuario sin nombre',
      }));
  }

  ngOnInit() {
    this.loadData();
    this.loadChartLibrary();
  }

  ngAfterViewInit() {
    this.tryRenderCharts();
  }

  private tryRenderCharts() {
    if (
      this.chartLibraryLoaded &&
      this.dataLoaded &&
      this.projectsChartRef &&
      this.categoriesChartRef &&
      this.collaboratorsChartRef &&
      this.collaboratorConsumptionChartRef
    ) {
      this.updateCharts();
    }
  }

  getDefaultStartDate(): string {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return this.formatDateForInput(date);
  }

  getDefaultEndDate(): string {
    return this.formatDateForInput(new Date());
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateForDisplay(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  formatDateForInputDisplay(dateString: string): string {
    if (!dateString) return '';

    if (dateString.includes('-')) {
      const [year, month, day] = dateString.split('-').map(Number);
      return `${String(day).padStart(2, '0')}/${String(month).padStart(
        2,
        '0'
      )}/${year}`;
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  onDateInputChange(event: any, field: 'dateFrom' | 'dateTo') {
    const value = event.target.value;

    const dateRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
    const match = value.match(dateRegex);

    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);

      const date = new Date(year, month - 1, day);
      if (
        date.getDate() === day &&
        date.getMonth() === month - 1 &&
        date.getFullYear() === year
      ) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(
          day
        ).padStart(2, '0')}`;
        this[field] = isoDate;
        this.onFilterChange();
      }
    }
  }

  onDateBlur(event: any, field: 'dateFrom' | 'dateTo') {
    const value = event.target.value;
    if (value && this[field]) {
      event.target.value = this.formatDateForInputDisplay(this[field]);
    }
  }

  openDatePicker(field: 'dateFrom' | 'dateTo') {
    const pickerId = field === 'dateFrom' ? 'dateFromPicker' : 'dateToPicker';
    const buttonId = field === 'dateFrom' ? 'dateFromButton' : 'dateToButton';

    const picker = document.getElementById(pickerId) as HTMLInputElement;
    const button = document.getElementById(buttonId) as HTMLButtonElement;

    if (picker && button) {
      // Obtener la posición del botón
      const buttonRect = button.getBoundingClientRect();

      // Posicionar el input de fecha en la misma posición que el botón
      picker.style.position = 'fixed';
      picker.style.top = buttonRect.top + 'px';
      picker.style.left = buttonRect.left + 'px';
      picker.style.width = buttonRect.width + 'px';
      picker.style.height = buttonRect.height + 'px';
      picker.style.opacity = '0';
      picker.style.pointerEvents = 'auto';

      if (!picker.value) {
        picker.value = this[field] || new Date().toISOString().split('T')[0];
      }

      picker.focus();
      picker.showPicker ? picker.showPicker() : picker.click();
    }
  }

  onDatePickerChange(event: any, field: 'dateFrom' | 'dateTo') {
    const value = event.target.value;
    if (value) {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const isoDate = date.toISOString().split('T')[0];

      this[field] = isoDate;

      const textInputId = field;
      const textInput = document.getElementById(
        textInputId
      ) as HTMLInputElement;
      if (textInput) {
        textInput.value = this.formatDateForInputDisplay(isoDate);
      }
      this.onFilterChange();
    }
  }

  loadChartLibrary() {
    if (typeof Chart !== 'undefined') {
      this.chartLibraryLoaded = true;
      this.tryRenderCharts();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => {
      this.chartLibraryLoaded = true;
      this.tryRenderCharts();
    };
    document.body.appendChild(script);
  }

  loadData() {
    this.dataLoaded = false;

    const filters = {
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
      projectId: this.filterProject || undefined,
      categoryId: this.filterCategory || undefined,
      collaboratorId: this.filterCollaborator || undefined,
    };

    forkJoin([
      this.invoicesService.getProjects(),
      this.invoicesService.getCategories(),
      this.invoicesService.getInvoices(filters),
      this.adminUsersService.getUsers().pipe(
        catchError((error) => {
          console.warn(
            'Error al cargar usuarios, continuando sin filtro de colaboradores:',
            error
          );
          return of([]);
        })
      ),
    ]).subscribe(([projects, categories, expenses, users]) => {
      this.projects = projects;
      this.categories = categories;

      const rawExpenses = Array.isArray(expenses)
        ? expenses
        : (expenses as any)?.data;

      if (Array.isArray(rawExpenses)) {
        this.expenses = rawExpenses.map((invoice, index) => {
          let invoiceData: any = {};

          try {
            if (invoice.data) {
              if (typeof invoice.data === 'string') {
                try {
                  invoiceData = JSON.parse(invoice.data);
                } catch (parseError) { }
              } else if (typeof invoice.data === 'object') {
                invoiceData = invoice.data;
              }
            }
          } catch (error) { }

          let normalizedDate = null;
          if (invoiceData.fechaEmision) {
            const fechaStr = invoiceData.fechaEmision;
            if (fechaStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
              const [day, month, year] = fechaStr.split('-');
              normalizedDate = `${year}-${month}-${day}`;
            } else {
              normalizedDate = fechaStr;
            }
          } else if (invoice.date) {
            normalizedDate = invoice.date;
          } else if (invoice.createdAt) {
            normalizedDate = invoice.createdAt;
          } else {
            normalizedDate = new Date().toISOString();
          }

          const normalizedTotal =
            typeof invoice.total === 'string'
              ? parseFloat(invoice.total as any)
              : (invoice as any).total || 0;

          const transformedInvoice = {
            ...invoice,
            fechaEmision: normalizedDate,
            total: normalizedTotal,
            createdBy: (invoice as any).createdBy || (invoice as any).userId,
          };

          return transformedInvoice;
        });
      } else {
        this.expenses = [];
      }

      this.users = Array.isArray(users) ? users : [];

      this.projectMap.clear();
      this.projects.forEach((project) => {
        if (project._id) {
          this.projectMap.set(project._id, project.name);
        }
      });

      this.categoryMap.clear();
      this.categories.forEach((category) => {
        if (category._id) {
          this.categoryMap.set(category._id, category.name);
        }
      });

      this.updateFilteredExpenses();
      this.dataLoaded = true;
      this.cdr.detectChanges();
      this.tryRenderCharts();
    });
  }

  onFilterChange() {
    this.loadData();
  }

  updateCharts() {
    if (!this.chartLibraryLoaded || typeof Chart === 'undefined') {
      return;
    }
    if (
      !this.projectsChartRef ||
      !this.categoriesChartRef ||
      !this.collaboratorsChartRef ||
      !this.collaboratorConsumptionChartRef
    ) {
      return;
    }
    this.createProjectsChart();
    this.createCategoriesChart();
    this.createCollaboratorsChart();
    this.createCollaboratorConsumptionChart();
  }

  updateFilteredExpenses() {
    const dateFrom = this.dateFrom ? new Date(this.dateFrom) : null;
    const dateTo = this.dateTo ? new Date(this.dateTo) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    this.filteredExpenses = this.expenses.filter((expense) => {
      if (!expense.fechaEmision) {
        return false;
      }

      const expenseDate = new Date(expense.fechaEmision);

      if (isNaN(expenseDate.getTime())) {
        return false;
      }

      const isAfterFrom = dateFrom ? expenseDate >= dateFrom : true;
      const isBeforeTo = dateTo ? expenseDate <= dateTo : true;

      const projectMatches =
        !this.filterProject ||
        this.getProjectId(expense) === this.filterProject;

      const categoryMatches =
        !this.filterCategory ||
        this.getCategoryId(expense) === this.filterCategory;

      const collaboratorMatches =
        !this.filterCollaborator ||
        expense.createdBy === this.filterCollaborator;

      return (
        isAfterFrom &&
        isBeforeTo &&
        projectMatches &&
        categoryMatches &&
        collaboratorMatches
      );
    });
  }

  getFilteredInvoices(): any[] {
    return this.filteredExpenses;
  }

  getProjectId(expense: any): string {
    if (expense.proyectId && typeof expense.proyectId === 'object') {
      return expense.proyectId._id || '';
    }
    if (typeof expense.proyectId === 'string') {
      return expense.proyectId;
    }
    return '';
  }

  getCategoryId(expense: any): string {
    if (expense.categoryId && typeof expense.categoryId === 'object') {
      return expense.categoryId._id || '';
    }
    if (typeof expense.categoryId === 'string') {
      return expense.categoryId;
    }
    return '';
  }

  getProjectName(projectId: any): string {
    if (typeof projectId !== 'string') {
      if (
        projectId &&
        typeof projectId === 'object' &&
        (projectId as any)._id
      ) {
        projectId = (projectId as any)._id;
      } else {
        return 'Proyecto inválido';
      }
    }

    const projectName = this.projectMap.get(projectId);

    if (!projectName && projectId) {
      const project = this.projects.find((p) => p._id === projectId);
      if (project) {
        this.projectMap.set(projectId, project.name);
        return project.name;
      }
    }

    return projectName || projectId || 'Proyecto desconocido';
  }

  getCategoryName(categoryId: any): string {
    if (typeof categoryId !== 'string') {
      if (
        categoryId &&
        typeof categoryId === 'object' &&
        (categoryId as any)._id
      ) {
        categoryId = (categoryId as any)._id;
      } else {
        return 'Categoría inválida';
      }
    }

    const categoryName = this.categoryMap.get(categoryId);

    if (!categoryName && categoryId) {
      const category = this.categories.find((c) => c._id === categoryId);
      if (category) {
        this.categoryMap.set(categoryId, category.name);
        return category.name;
      }
    }

    return categoryName || categoryId || 'Categoría desconocida';
  }

  getTotalByProject(projectId: string): number {
    return this.getFilteredInvoices()
      .filter((expense) => this.getProjectId(expense) === projectId)
      .reduce((sum, expense) => {
        const total =
          typeof expense.total === 'string'
            ? parseFloat(expense.total)
            : expense.total || 0;
        return sum + total;
      }, 0);
  }

  getTotalByCategory(categoryId: string): number {
    return this.getFilteredInvoices()
      .filter((expense) => this.getCategoryId(expense) === categoryId)
      .reduce((sum, expense) => {
        const total =
          typeof expense.total === 'string'
            ? parseFloat(expense.total)
            : expense.total || 0;
        return sum + total;
      }, 0);
  }

  createProjectsChart() {
    if (
      !this.projectsChartRef ||
      !this.chartLibraryLoaded ||
      typeof Chart === 'undefined' ||
      !this.projectsChartRef.nativeElement ||
      !this.showProjectsSection
    ) {
      return;
    }

    if (this.projectsChart) {
      this.projectsChart.destroy();
    }

    const filteredExpenses = this.getFilteredInvoices();

    if (filteredExpenses.length === 0) {
      this.projectsChart = new Chart(this.projectsChartRef.nativeElement, {
        type: 'pie',
        data: {
          labels: ['Sin datos'],
          datasets: [
            {
              data: [1],
              backgroundColor: ['#e2e2e2'],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
            },
            title: {
              display: true,
              text: 'Gastos por Proyecto',
            },
          },
        },
      });
      return;
    }

    const projectTotals = new Map<string, number>();

    filteredExpenses.forEach((expense) => {
      const projectId = this.getProjectId(expense);
      if (projectId) {
        const currentTotal = projectTotals.get(projectId) || 0;
        const expenseTotal =
          typeof expense.total === 'string'
            ? parseFloat(expense.total)
            : expense.total || 0;
        projectTotals.set(projectId, currentTotal + expenseTotal);
      }
    });

    for (const [id, total] of projectTotals.entries()) {
      if (total === 0) {
        projectTotals.delete(id);
      }
    }

    const labels = Array.from(projectTotals.keys()).map((id) => {
      return this.getProjectName(id);
    });

    const data = Array.from(projectTotals.values());

    this.projectsChart = new Chart(this.projectsChartRef.nativeElement, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: this.chartColors.slice(0, data.length),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
          },
          title: {
            display: true,
            text: 'Gastos por Proyecto',
          },
        },
      },
    });
  }

  createCategoriesChart() {
    if (
      !this.categoriesChartRef ||
      !this.chartLibraryLoaded ||
      typeof Chart === 'undefined' ||
      !this.categoriesChartRef.nativeElement ||
      !this.showCategoriesSection
    ) {
      return;
    }

    if (this.categoriesChart) {
      this.categoriesChart.destroy();
    }

    const filteredExpenses = this.getFilteredInvoices();

    if (filteredExpenses.length === 0) {
      this.categoriesChart = new Chart(this.categoriesChartRef.nativeElement, {
        type: 'pie',
        data: {
          labels: ['Sin datos'],
          datasets: [
            {
              data: [1],
              backgroundColor: ['#e2e2e2'],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
            },
            title: {
              display: true,
              text: 'Gastos por Categoría',
            },
          },
        },
      });
      return;
    }

    const categoryTotals = new Map<string, number>();

    filteredExpenses.forEach((expense) => {
      const categoryId = this.getCategoryId(expense);
      if (categoryId) {
        const currentTotal = categoryTotals.get(categoryId) || 0;
        const expenseTotal =
          typeof expense.total === 'string'
            ? parseFloat(expense.total)
            : expense.total || 0;
        categoryTotals.set(categoryId, currentTotal + expenseTotal);
      }
    });

    for (const [id, total] of categoryTotals.entries()) {
      if (total === 0) {
        categoryTotals.delete(id);
      }
    }

    const labels = Array.from(categoryTotals.keys()).map((id) => {
      return this.getCategoryName(id);
    });

    const data = Array.from(categoryTotals.values());

    this.categoriesChart = new Chart(this.categoriesChartRef.nativeElement, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: this.chartColors.slice(0, data.length),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
          },
          title: {
            display: true,
            text: 'Gastos por Categoría',
          },
        },
      },
    });
  }

  createCollaboratorsChart() {
    if (
      !this.collaboratorsChartRef ||
      !this.chartLibraryLoaded ||
      typeof Chart === 'undefined' ||
      !this.collaboratorsChartRef.nativeElement ||
      !this.showCollaboratorsSection
    ) {
      return;
    }

    if (this.collaboratorsChart) {
      this.collaboratorsChart.destroy();
    }

    const filteredExpenses = this.getFilteredInvoices();

    if (filteredExpenses.length === 0) {
      this.collaboratorsChart = new Chart(
        this.collaboratorsChartRef.nativeElement,
        {
          type: 'bar',
          data: {
            labels: ['Sin datos'],
            datasets: [
              {
                label: 'Sin datos',
                data: [0],
                backgroundColor: '#e2e2e2',
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Importe (S/)',
                },
              },
              x: {
                title: {
                  display: true,
                  text: 'Mes',
                },
              },
            },
            plugins: {
              title: {
                display: true,
                text: 'Gastos por Proyecto en el Tiempo',
              },
              legend: {
                position: 'top',
              },
            },
          },
        }
      );
      return;
    }

    const months = this.getMonthsInRange();

    const projectsData = this.getProjectsData(filteredExpenses, months);

    const datasets = projectsData.map((project, index) => {
      const colorIndex = index % this.chartColors.length;
      return {
        label: project.name,
        data: months.map((month) => project.expenses[month] || 0),
        backgroundColor: this.chartColors[colorIndex],
        borderColor: this.chartColors[colorIndex],
        borderWidth: 1,
      };
    });

    this.collaboratorsChart = new Chart(
      this.collaboratorsChartRef.nativeElement,
      {
        type: 'bar',
        data: {
          labels: months.map((month) => this.formatMonthLabel(month)),
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Importe (S/)',
              },
            },
            x: {
              title: {
                display: true,
                text: 'Mes',
              },
            },
          },
          plugins: {
            title: {
              display: true,
              text: 'Gastos por Proyecto en el Tiempo',
            },
            legend: {
              position: 'top',
            },
          },
        },
      }
    );
  }

  createCollaboratorConsumptionChart() {
    if (
      !this.collaboratorConsumptionChartRef ||
      !this.chartLibraryLoaded ||
      typeof Chart === 'undefined' ||
      !this.collaboratorConsumptionChartRef.nativeElement ||
      !this.showCollaboratorConsumptionSection
    ) {
      return;
    }

    if (this.collaboratorConsumptionChart) {
      this.collaboratorConsumptionChart.destroy();
    }

    const filteredExpenses = this.getFilteredInvoices();

    if (filteredExpenses.length === 0) {
      this.collaboratorConsumptionChart = new Chart(
        this.collaboratorConsumptionChartRef.nativeElement,
        {
          type: 'bar',
          data: {
            labels: ['Sin datos'],
            datasets: [
              {
                label: 'Sin datos',
                data: [0],
                backgroundColor: '#e2e2e2',
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Importe (S/)',
                },
              },
              x: {
                title: {
                  display: true,
                  text: 'Colaborador',
                },
              },
            },
            plugins: {
              title: {
                display: true,
                text: 'Consumo Total por Colaborador',
              },
              legend: {
                display: false,
              },
            },
          },
        }
      );
      return;
    }

    const collaboratorConsumption = new Map<string, number>();
    const collaboratorNames = new Map<string, string>();

    filteredExpenses.forEach((expense) => {
      const collaboratorId = expense.createdBy || 'unknown';
      const collaboratorName = this.getCollaboratorName(collaboratorId);

      const total =
        typeof expense.total === 'string'
          ? parseFloat(expense.total)
          : expense.total || 0;

      collaboratorConsumption.set(
        collaboratorId,
        (collaboratorConsumption.get(collaboratorId) || 0) + total
      );

      collaboratorNames.set(collaboratorId, collaboratorName);
    });

    const sortedData = Array.from(collaboratorConsumption.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15);

    const labels = sortedData.map(([id]) => {
      const name = collaboratorNames.get(id) || 'Desconocido';
      return name.length > 20 ? name.substring(0, 20) + '...' : name;
    });
    const data = sortedData.map(([, total]) => total);
    const colors = sortedData.map(
      (_, index) => this.chartColors[index % this.chartColors.length]
    );

    this.collaboratorConsumptionChart = new Chart(
      this.collaboratorConsumptionChartRef.nativeElement,
      {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Consumo Total',
              data: data,
              backgroundColor: colors,
              borderColor: colors,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Importe (S/)',
              },
            },
            x: {
              title: {
                display: true,
                text: 'Colaborador',
              },
              ticks: {
                maxRotation: 45,
                minRotation: 0,
              },
            },
          },
          plugins: {
            title: {
              display: true,
              text: 'Consumo Total por Colaborador',
            },
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label: (context: any) => {
                  const value = context.parsed.y;
                  return `${context.label}: ${this.formatCurrency(value)}`;
                },
              },
            },
          },
        },
      }
    );
  }

  getMonthsInRange(): string[] {
    const months: string[] = [];
    const dateFrom = new Date(this.dateFrom);
    const dateTo = new Date(this.dateTo);

    const currentDate = new Date(dateFrom);

    currentDate.setDate(1);

    while (currentDate <= dateTo) {
      months.push(
        `${currentDate.getFullYear()}-${String(
          currentDate.getMonth() + 1
        ).padStart(2, '0')}`
      );
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return months;
  }

  formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);

    const monthNames = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];

    return `${monthNames[date.getMonth()]} ${year}`;
  }

  getProjectsData(expenses: any[], months: string[]): ProjectExpense[] {
    const projectsMap: Map<string, ProjectExpense> = new Map();

    expenses.forEach((expense) => {
      const projectId = this.getProjectId(expense);
      if (!projectId) return;

      const expenseDate = new Date(expense.fechaEmision);
      const monthKey = `${expenseDate.getFullYear()}-${String(
        expenseDate.getMonth() + 1
      ).padStart(2, '0')}`;

      if (!months.includes(monthKey)) {
        return;
      }

      if (!projectsMap.has(projectId)) {
        const projectExpense: ProjectExpense = {
          id: projectId,
          name: this.getProjectName(projectId),
          expenses: {},
          color: '',
        };

        months.forEach((month) => {
          projectExpense.expenses[month] = 0;
        });

        projectsMap.set(projectId, projectExpense);
      }

      const total =
        typeof expense.total === 'string'
          ? parseFloat(expense.total)
          : expense.total || 0;

      const project = projectsMap.get(projectId)!;
      project.expenses[monthKey] = (project.expenses[monthKey] || 0) + total;
    });

    const result = Array.from(projectsMap.values());

    result.slice(0, 10).forEach((project, index) => {
      project.color = this.chartColors[index % this.chartColors.length];
    });

    return result;
  }

  getCollaboratorsData(
    expenses: any[],
    months: string[]
  ): CollaboratorExpense[] {
    const collaboratorsMap: Map<string, CollaboratorExpense> = new Map();

    const getCollaboratorId = (expense: any): string => {
      return expense.createdBy || 'unknown';
    };

    expenses.forEach((expense) => {
      const collaboratorId = getCollaboratorId(expense) || 'unknown';
      const expenseDate = new Date(expense.fechaEmision);
      const monthKey = `${expenseDate.getFullYear()}-${String(
        expenseDate.getMonth() + 1
      ).padStart(2, '0')}`;

      if (!months.includes(monthKey)) {
        return;
      }

      if (!collaboratorsMap.has(collaboratorId)) {
        const collaboratorExpense: CollaboratorExpense = {
          id: collaboratorId,
          name: this.getCollaboratorName(collaboratorId),
          expenses: {},
          color: '',
        };

        months.forEach((month) => {
          collaboratorExpense.expenses[month] = 0;
        });

        collaboratorsMap.set(collaboratorId, collaboratorExpense);
      }

      const total =
        typeof expense.total === 'string'
          ? parseFloat(expense.total)
          : expense.total || 0;

      const collaborator = collaboratorsMap.get(collaboratorId)!;
      collaborator.expenses[monthKey] =
        (collaborator.expenses[monthKey] || 0) + total;
    });

    const result = Array.from(collaboratorsMap.values());

    result.slice(0, 10).forEach((collaborator, index) => {
      collaborator.color = this.chartColors[index % this.chartColors.length];
    });

    return result;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(value);
  }

  getProjectIdsWithExpenses(): string[] {
    const filteredExpenses = this.getFilteredInvoices();
    const projectIdsWithExpenses = new Set<string>();
    filteredExpenses.forEach((expense) => {
      const projectId = this.getProjectId(expense);
      if (projectId && this.getTotalByProject(projectId) > 0) {
        projectIdsWithExpenses.add(projectId);
      }
    });
    return Array.from(projectIdsWithExpenses);
  }

  getCategoryIdsWithExpenses(): string[] {
    const filteredExpenses = this.getFilteredInvoices();
    const categoryIdsWithExpenses = new Set<string>();
    filteredExpenses.forEach((expense) => {
      const categoryId = this.getCategoryId(expense);
      if (categoryId && this.getTotalByCategory(categoryId) > 0) {
        categoryIdsWithExpenses.add(categoryId);
      }
    });
    return Array.from(categoryIdsWithExpenses);
  }

  getCollaboratorIdsWithExpenses(): string[] {
    const filteredExpenses = this.getFilteredInvoices();
    const collaboratorIdsWithExpenses = new Set<string>();

    filteredExpenses.forEach((expense) => {
      const collaboratorId = this.getCollaboratorId(expense);
      const total = this.getTotalByCollaborator(collaboratorId);

      if (collaboratorId && total > 0) {
        collaboratorIdsWithExpenses.add(collaboratorId);
      }
    });

    return Array.from(collaboratorIdsWithExpenses);
  }

  getCollaboratorId(expense: any): string {
    return expense.createdBy || 'unknown';
  }

  getCollaboratorName(collaboratorId: string): string {
    if (!collaboratorId || collaboratorId === 'unknown') {
      return 'Sin asignar';
    }

    const user = this.users.find((u) => u._id === collaboratorId);
    if (user) {
      return user.name || user.email || 'Colaborador desconocido';
    }
    return 'Colaborador desconocido';
  }

  getTotalByCollaborator(collaboratorId: string): number {
    if (!collaboratorId) {
      return 0;
    }

    const filteredExpenses = this.getFilteredInvoices();
    const expensesForCollaborator = filteredExpenses.filter(
      (expense) => this.getCollaboratorId(expense) === collaboratorId
    );

    const total = expensesForCollaborator.reduce((total, expense) => {
      const expenseTotal =
        typeof expense.total === 'string'
          ? parseFloat(expense.total as any)
          : expense.total || 0;
      return total + expenseTotal;
    }, 0);

    return total;
  }

  getTotalExpenses(): number {
    const filteredExpenses = this.getFilteredInvoices();

    return filteredExpenses.reduce((total, expense) => {
      const expenseTotal =
        typeof expense.total === 'string'
          ? parseFloat(expense.total)
          : expense.total || 0;
      return total + expenseTotal;
    }, 0);
  }

  toggleSection(
    section:
      | 'collaborators'
      | 'collaborator-consumption'
      | 'projects'
      | 'categories'
      | 'summary'
  ) {
    switch (section) {
      case 'collaborators':
        this.showCollaboratorsSection = !this.showCollaboratorsSection;
        if (this.showCollaboratorsSection) {
          this.cdr.detectChanges();
          setTimeout(() => this.refreshChart('collaborators'), 100);
        }
        break;
      case 'collaborator-consumption':
        this.showCollaboratorConsumptionSection =
          !this.showCollaboratorConsumptionSection;
        if (this.showCollaboratorConsumptionSection) {
          this.cdr.detectChanges();
          setTimeout(() => this.refreshChart('collaborator-consumption'), 100);
        }
        break;
      case 'projects':
        this.showProjectsSection = !this.showProjectsSection;
        if (this.showProjectsSection) {
          this.cdr.detectChanges();
          setTimeout(() => this.refreshChart('projects'), 100);
        }
        break;
      case 'categories':
        this.showCategoriesSection = !this.showCategoriesSection;
        if (this.showCategoriesSection) {
          this.cdr.detectChanges();
          setTimeout(() => this.refreshChart('categories'), 100);
        }
        break;
      case 'summary':
        this.showSummarySection = !this.showSummarySection;
        break;
    }
  }

  refreshChart(
    chartType:
      | 'collaborators'
      | 'collaborator-consumption'
      | 'projects'
      | 'categories'
  ) {
    if (
      !this.chartLibraryLoaded ||
      !this.dataLoaded ||
      typeof Chart === 'undefined'
    ) {
      return;
    }

    switch (chartType) {
      case 'collaborators':
        if (
          this.collaboratorsChartRef &&
          this.collaboratorsChartRef.nativeElement
        ) {
          if (this.collaboratorsChart) {
            this.collaboratorsChart.destroy();
            this.collaboratorsChart = null;
          }
          setTimeout(() => this.createCollaboratorsChart(), 50);
        }
        break;
      case 'collaborator-consumption':
        if (
          this.collaboratorConsumptionChartRef &&
          this.collaboratorConsumptionChartRef.nativeElement
        ) {
          if (this.collaboratorConsumptionChart) {
            this.collaboratorConsumptionChart.destroy();
            this.collaboratorConsumptionChart = null;
          }
          setTimeout(() => this.createCollaboratorConsumptionChart(), 50);
        }
        break;
      case 'projects':
        if (this.projectsChartRef && this.projectsChartRef.nativeElement) {
          if (this.projectsChart) {
            this.projectsChart.destroy();
            this.projectsChart = null;
          }
          setTimeout(() => this.createProjectsChart(), 50);
        }
        break;
      case 'categories':
        if (this.categoriesChartRef && this.categoriesChartRef.nativeElement) {
          if (this.categoriesChart) {
            this.categoriesChart.destroy();
            this.categoriesChart = null;
          }
          setTimeout(() => this.createCategoriesChart(), 50);
        }
        break;
    }
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
