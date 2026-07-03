import { IExpenseReport } from './expense-report.interface';

export interface ISelectedReport {
  expenseReportId: string | IExpenseReport;
  colaboradorId: string;
  colaboradorName: string;
  expenseReport?: IExpenseReport;
}

export interface ICajaChicaReport {
  _id: string;
  codigo: string;
  title: string;
  clientId: string;
  createdBy: any;
  status: 'draft' | 'finalized';
  selectedReports: ISelectedReport[];
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}
