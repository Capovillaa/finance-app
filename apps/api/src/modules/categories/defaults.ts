import type { CategoryKind } from '../../db/types.js';

export interface CategoryTemplateNode {
  name: string;
  /** Brazilian Portuguese label, used when the workspace locale is pt-BR. */
  namePtBr: string;
  kind: CategoryKind;
  color: string;
  icon?: string;
  children?: CategoryTemplateNode[];
}

/**
 * The starter tree applied to every new workspace. Three levels deep at most,
 * matching the schema constraint (Food > Groceries > Supermarket).
 *
 * Users can rename, archive or extend anything here; nothing is immutable.
 */
export const DEFAULT_CATEGORY_TEMPLATE: CategoryTemplateNode[] = [
  {
    name: 'Food',
    namePtBr: 'Alimentação',
    kind: 'expense',
    color: '#E8590C',
    icon: 'utensils',
    children: [
      {
        name: 'Groceries',
        namePtBr: 'Mercado',
        kind: 'expense',
        color: '#F08C00',
        children: [
          { name: 'Supermarket', namePtBr: 'Supermercado', kind: 'expense', color: '#F59F00' },
          { name: 'Farmers Market', namePtBr: 'Feira', kind: 'expense', color: '#FAB005' },
        ],
      },
      { name: 'Restaurants', namePtBr: 'Restaurantes', kind: 'expense', color: '#FD7E14' },
      { name: 'Delivery', namePtBr: 'Delivery', kind: 'expense', color: '#FFA94D' },
    ],
  },
  {
    name: 'Housing',
    namePtBr: 'Moradia',
    kind: 'expense',
    color: '#1971C2',
    icon: 'home',
    children: [
      { name: 'Rent', namePtBr: 'Aluguel', kind: 'expense', color: '#1C7ED6' },
      { name: 'Condo Fee', namePtBr: 'Condomínio', kind: 'expense', color: '#228BE6' },
      {
        name: 'Utilities',
        namePtBr: 'Contas de Casa',
        kind: 'expense',
        color: '#339AF0',
        children: [
          { name: 'Electricity', namePtBr: 'Energia', kind: 'expense', color: '#4DABF7' },
          { name: 'Water', namePtBr: 'Água', kind: 'expense', color: '#74C0FC' },
          { name: 'Internet', namePtBr: 'Internet', kind: 'expense', color: '#A5D8FF' },
        ],
      },
      { name: 'Maintenance', namePtBr: 'Manutenção', kind: 'expense', color: '#4DABF7' },
    ],
  },
  {
    name: 'Transport',
    namePtBr: 'Transporte',
    kind: 'expense',
    color: '#2F9E44',
    icon: 'car',
    children: [
      { name: 'Fuel', namePtBr: 'Combustível', kind: 'expense', color: '#37B24D' },
      { name: 'Public Transport', namePtBr: 'Transporte Público', kind: 'expense', color: '#40C057' },
      { name: 'Ride Hailing', namePtBr: 'Aplicativos de Transporte', kind: 'expense', color: '#51CF66' },
      { name: 'Vehicle Maintenance', namePtBr: 'Manutenção do Veículo', kind: 'expense', color: '#69DB7C' },
      { name: 'Parking & Tolls', namePtBr: 'Estacionamento e Pedágios', kind: 'expense', color: '#8CE99A' },
    ],
  },
  {
    name: 'Health',
    namePtBr: 'Saúde',
    kind: 'expense',
    color: '#E03131',
    icon: 'heart-pulse',
    children: [
      { name: 'Health Insurance', namePtBr: 'Plano de Saúde', kind: 'expense', color: '#F03E3E' },
      { name: 'Pharmacy', namePtBr: 'Farmácia', kind: 'expense', color: '#FA5252' },
      { name: 'Doctors', namePtBr: 'Consultas', kind: 'expense', color: '#FF6B6B' },
      { name: 'Fitness', namePtBr: 'Academia', kind: 'expense', color: '#FF8787' },
    ],
  },
  {
    name: 'Education',
    namePtBr: 'Educação',
    kind: 'expense',
    color: '#7048E8',
    icon: 'graduation-cap',
    children: [
      { name: 'Tuition', namePtBr: 'Mensalidade', kind: 'expense', color: '#7950F2' },
      { name: 'Courses', namePtBr: 'Cursos', kind: 'expense', color: '#845EF7' },
      { name: 'Books', namePtBr: 'Livros', kind: 'expense', color: '#9775FA' },
    ],
  },
  {
    name: 'Entertainment',
    namePtBr: 'Lazer',
    kind: 'expense',
    color: '#C2255C',
    icon: 'party-popper',
    children: [
      { name: 'Streaming', namePtBr: 'Streaming', kind: 'expense', color: '#D6336C' },
      { name: 'Travel', namePtBr: 'Viagens', kind: 'expense', color: '#E64980' },
      { name: 'Events', namePtBr: 'Eventos', kind: 'expense', color: '#F06595' },
      { name: 'Hobbies', namePtBr: 'Hobbies', kind: 'expense', color: '#FAA2C1' },
    ],
  },
  {
    name: 'Shopping',
    namePtBr: 'Compras',
    kind: 'expense',
    color: '#0C8599',
    icon: 'shopping-bag',
    children: [
      { name: 'Clothing', namePtBr: 'Vestuário', kind: 'expense', color: '#1098AD' },
      { name: 'Electronics', namePtBr: 'Eletrônicos', kind: 'expense', color: '#15AABF' },
      { name: 'Home Goods', namePtBr: 'Casa e Decoração', kind: 'expense', color: '#22B8CF' },
    ],
  },
  {
    name: 'Financial',
    namePtBr: 'Financeiro',
    kind: 'expense',
    color: '#495057',
    icon: 'landmark',
    children: [
      { name: 'Bank Fees', namePtBr: 'Tarifas Bancárias', kind: 'expense', color: '#5C7CFA' },
      { name: 'Interest', namePtBr: 'Juros', kind: 'expense', color: '#748FFC' },
      { name: 'Taxes', namePtBr: 'Impostos', kind: 'expense', color: '#91A7FF' },
      { name: 'Insurance', namePtBr: 'Seguros', kind: 'expense', color: '#BAC8FF' },
    ],
  },
  {
    name: 'Family',
    namePtBr: 'Família',
    kind: 'expense',
    color: '#AE3EC9',
    icon: 'users',
    children: [
      { name: 'Childcare', namePtBr: 'Creche e Babá', kind: 'expense', color: '#BE4BDB' },
      { name: 'Pets', namePtBr: 'Pets', kind: 'expense', color: '#CC5DE8' },
      { name: 'Gifts', namePtBr: 'Presentes', kind: 'expense', color: '#DA77F2' },
    ],
  },
  {
    name: 'Other Expenses',
    namePtBr: 'Outras Despesas',
    kind: 'expense',
    color: '#868E96',
    icon: 'ellipsis',
  },
  {
    name: 'Income',
    namePtBr: 'Receitas',
    kind: 'income',
    color: '#087F5B',
    icon: 'wallet',
    children: [
      { name: 'Salary', namePtBr: 'Salário', kind: 'income', color: '#099268' },
      { name: 'Bonus', namePtBr: 'Bônus', kind: 'income', color: '#0CA678' },
      { name: 'Freelance', namePtBr: 'Freelance', kind: 'income', color: '#12B886' },
      { name: 'Investments', namePtBr: 'Rendimentos', kind: 'income', color: '#20C997' },
      { name: 'Rental Income', namePtBr: 'Aluguéis Recebidos', kind: 'income', color: '#38D9A9' },
      { name: 'Refunds', namePtBr: 'Reembolsos', kind: 'income', color: '#63E6BE' },
      { name: 'Other Income', namePtBr: 'Outras Receitas', kind: 'income', color: '#96F2D7' },
    ],
  },
];

export function templateLabel(node: CategoryTemplateNode, locale: string): string {
  return locale.toLowerCase().startsWith('pt') ? node.namePtBr : node.name;
}

export function countTemplateNodes(nodes: CategoryTemplateNode[] = DEFAULT_CATEGORY_TEMPLATE): number {
  return nodes.reduce((total, node) => total + 1 + countTemplateNodes(node.children ?? []), 0);
}
