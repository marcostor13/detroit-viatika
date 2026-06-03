export type PettyCashStatus = 'pending_funding' | 'active' | 'closed';

export interface IPettyCashExpense {
  expenseId: string;
  amount: number;
  category?: string;
  registeredAt: string;
}

export interface IPettyCashFunding {
  transferDate: string;
  amount: number;
  operationNumber: string;
  receiptUrl: string;
  registeredBy: string;
  registeredAt: string;
}

export interface IPettyCash {
  _id: string;
  code: string;
  responsibleId: { _id: string; name: string; email: string } | string;
  clientId: string;
  period: string;
  fundAmount: number;
  spentAmount: number;
  status: PettyCashStatus;
  maxPerExpense?: number;
  maxPerDay?: number;
  allowedCategories: string[];
  funding?: IPettyCashFunding;
  expenses: IPettyCashExpense[];
  createdAt: string;
  updatedAt: string;
}

export interface ICreatePettyCashPayload {
  responsibleId: string;
  clientId?: string;
  period: string;
  fundAmount: number;
  maxPerExpense?: number;
  maxPerDay?: number;
  allowedCategories?: string[];
}

export const PETTY_CASH_STATUS_LABELS: Record<PettyCashStatus, string> = {
  pending_funding: 'Pendiente fondeo',
  active: 'Activa',
  closed: 'Cerrada',
};

export const PETTY_CASH_STATUS_COLORS: Record<PettyCashStatus, string> = {
  pending_funding: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
};
