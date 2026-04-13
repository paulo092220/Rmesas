import { Injectable, signal, computed, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface CurrencyPair {
  id: string;
  base: string;
  quote: string;
  rate: number;
  isFavorite?: boolean;
  history: { date: string; rate: number }[];
}

export interface Transaction {
  id: string;
  date: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'REMITTANCE_IN' | 'REMITTANCE_OUT';
  currency: string;
  amount: number;
  description: string;
}

export interface Remittance {
  id: string;
  date: string;
  senderFirstName: string;
  senderLastName: string;
  agentName: string;
  pairId: string;
  amountSent: number;
  amountReceived: number;
  rate: number;
  profitInBase?: number;
}

export interface Exchange {
  id: string;
  date: string;
  fromCurrency: string;
  toCurrency: string;
  amountSold: number;
  amountReceived: number;
  rate: number;
  costRate?: number;
  profit?: number;
}

export interface LocalUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: 'admin' | 'user';
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  user = signal<LocalUser | null>(null);
  isAuthReady = signal(false);
  isLoggingIn = signal(false);
  isAdmin = signal(false);

  pairs = signal<CurrencyPair[]>([]);
  currencies = signal<string[]>([
    'USD', 'EUR', 'MXN', 'GBP', 'CAD', 'JPY', 'AUD', 'CHF', 'CNY', 'COP', 'ARS', 'BRL', 'CLP', 'PEN'
  ]);
  telegramToken = signal<string>('');
  telegramChatId = signal<string>('');
  telegramBotActive = signal<boolean>(false);

  transactions = signal<Transaction[]>([]);
  remittances = signal<Remittance[]>([]);
  exchanges = signal<Exchange[]>([]);

  balances = computed(() => {
    const bals: Record<string, number> = {};
    for (const p of this.pairs()) {
      if (bals[p.base] === undefined) bals[p.base] = 0;
      if (bals[p.quote] === undefined) bals[p.quote] = 0;
    }
    for (const t of this.transactions()) {
      if (bals[t.currency] === undefined) bals[t.currency] = 0;
      bals[t.currency] += t.amount;
    }
    return bals;
  });

  constructor() {
    if (this.isBrowser) {
      this.loadFromLocal();
    }
    this.isAuthReady.set(true);

    effect(() => {
      if (this.isBrowser) {
        this.saveToLocal();
      }
    });
  }

  private loadFromLocal() {
    if (!this.isBrowser) return;
    const storedUser = localStorage.getItem('rf_user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      this.user.set(u);
      this.isAdmin.set(u.role === 'admin');
    }

    const storedPairs = localStorage.getItem('rf_pairs');
    if (storedPairs) this.pairs.set(JSON.parse(storedPairs));

    const storedCurrencies = localStorage.getItem('rf_currencies');
    if (storedCurrencies) this.currencies.set(JSON.parse(storedCurrencies));

    const storedTransactions = localStorage.getItem('rf_transactions');
    if (storedTransactions) this.transactions.set(JSON.parse(storedTransactions));

    const storedRemittances = localStorage.getItem('rf_remittances');
    if (storedRemittances) this.remittances.set(JSON.parse(storedRemittances));

    const storedExchanges = localStorage.getItem('rf_exchanges');
    if (storedExchanges) this.exchanges.set(JSON.parse(storedExchanges));

    const storedTelegram = localStorage.getItem('rf_telegram');
    if (storedTelegram) {
      const t = JSON.parse(storedTelegram);
      this.telegramToken.set(t.token || '');
      this.telegramChatId.set(t.chatId || '');
      this.telegramBotActive.set(t.active || false);
    }
  }

  private saveToLocal() {
    if (!this.isBrowser) return;
    localStorage.setItem('rf_user', JSON.stringify(this.user()));
    localStorage.setItem('rf_pairs', JSON.stringify(this.pairs()));
    localStorage.setItem('rf_currencies', JSON.stringify(this.currencies()));
    localStorage.setItem('rf_transactions', JSON.stringify(this.transactions()));
    localStorage.setItem('rf_remittances', JSON.stringify(this.remittances()));
    localStorage.setItem('rf_exchanges', JSON.stringify(this.exchanges()));
    localStorage.setItem('rf_telegram', JSON.stringify({
      token: this.telegramToken(),
      chatId: this.telegramChatId(),
      active: this.telegramBotActive()
    }));
  }

  async login() {
    this.isLoggingIn.set(true);
    // Mock local login
    setTimeout(() => {
      const mockUser: LocalUser = {
        uid: 'local-user-id',
        displayName: 'Usuario Local',
        email: 'local@example.com',
        role: 'admin'
      };
      this.user.set(mockUser);
      this.isAdmin.set(true);
      this.isLoggingIn.set(false);
    }, 500);
  }

  async logout() {
    this.user.set(null);
    this.isAdmin.set(false);
    if (this.isBrowser) {
      localStorage.removeItem('rf_user');
    }
  }

  getRate(from: string, to: string): number | null {
    if (from === to) return 1;
    const pairs = this.pairs();
    
    let pair = pairs.find(p => p.base === from && p.quote === to);
    if (pair) return pair.rate;
    pair = pairs.find(p => p.quote === from && p.base === to);
    if (pair) return 1 / pair.rate;

    for (const p1 of pairs) {
      const intermediate = p1.base === from ? p1.quote : (p1.quote === from ? p1.base : null);
      if (intermediate) {
        const rate1 = p1.base === from ? p1.rate : 1 / p1.rate;
        
        let p2 = pairs.find(p => p.base === intermediate && p.quote === to);
        if (p2) return rate1 * p2.rate;
        p2 = pairs.find(p => p.quote === intermediate && p.base === to);
        if (p2) return rate1 * (1 / p2.rate);
      }
    }
    
    return null;
  }

  async addPair(base: string, quote: string, rate: number) {
    const id = `${base}-${quote}`;
    const pair: CurrencyPair = { id, base, quote, rate, isFavorite: false, history: [{ date: new Date().toISOString(), rate }] };
    this.pairs.update(p => [...p, pair]);
  }

  async toggleFavoritePair(id: string) {
    this.pairs.update(pairs => pairs.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p));
  }

  async addCurrency(code: string) {
    const upperCode = code.toUpperCase().trim();
    if (upperCode && !this.currencies().includes(upperCode)) {
      this.currencies.update(c => [...c, upperCode].sort());
    }
  }

  async removeCurrency(code: string) {
    this.currencies.update(c => c.filter(x => x !== code));
  }

  async updateTelegramConfig(token: string, chatId: string, active: boolean) {
    this.telegramToken.set(token);
    this.telegramChatId.set(chatId);
    this.telegramBotActive.set(active);
  }

  async updateRate(id: string, newRate: number) {
    this.pairs.update(pairs => pairs.map(p => p.id === id ? { 
      ...p, 
      rate: newRate, 
      history: [...p.history, { date: new Date().toISOString(), rate: newRate }] 
    } : p));
  }

  async deletePair(id: string) {
    this.pairs.update(p => p.filter(x => x.id !== id));
  }

  async addTransaction(type: Transaction['type'], currency: string, amount: number, description: string) {
    const id = Math.random().toString(36).substring(2, 9);
    const t: Transaction = {
      id,
      date: new Date().toISOString(),
      type,
      currency,
      amount,
      description
    };
    this.transactions.update(txs => [t, ...txs]);
  }

  async addRemittance(rem: Omit<Remittance, 'id' | 'date' | 'profitInBase'>) {
    const id = Math.random().toString(36).substring(2, 9);
    const date = new Date().toISOString();
    
    const [base, quote] = rem.pairId.split('-');
    const marketRate = this.getRate(base, quote);
    let profitInBase = 0;
    if (marketRate !== null) {
      profitInBase = rem.amountSent - (rem.amountReceived / marketRate);
    }

    const newRem: Remittance = { ...rem, id, date, profitInBase };
    this.remittances.update(rems => [newRem, ...rems]);
    
    const pair = this.pairs().find(p => p.id === rem.pairId);
    if (pair) {
      await this.addTransaction('REMITTANCE_IN', pair.base, rem.amountSent, `Remesa de ${rem.senderFirstName} ${rem.senderLastName}`);
      await this.addTransaction('REMITTANCE_OUT', pair.quote, -rem.amountReceived, `Pago de remesa ${rem.senderFirstName} ${rem.senderLastName}`);
    }
  }

  async addExchange(fromCurrency: string, toCurrency: string, amountSold: number, rate: number, costRate: number) {
    const id = Math.random().toString(36).substring(2, 9);
    const date = new Date().toISOString();
    const amountReceived = amountSold * rate;
    const profit = amountSold * (rate - costRate);

    const newExchange: Exchange = { id, date, fromCurrency, toCurrency, amountSold, amountReceived, rate, costRate, profit };
    this.exchanges.update(exs => [newExchange, ...exs]);
    
    await this.addTransaction('WITHDRAWAL', fromCurrency, -amountSold, `Intercambio a ${toCurrency} (Tasa: ${rate})`);
    await this.addTransaction('DEPOSIT', toCurrency, amountReceived, `Intercambio desde ${fromCurrency} (Tasa: ${rate})`);
  }

  exportData() {
    const data = {
      pairs: this.pairs(),
      transactions: this.transactions(),
      remittances: this.remittances(),
      exchanges: this.exchanges(),
      currencies: this.currencies()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async importData(json: string): Promise<boolean> {
    try {
      const data = JSON.parse(json);
      if (data.currencies) this.currencies.set(data.currencies);
      if (data.pairs) this.pairs.set(data.pairs);
      if (data.transactions) this.transactions.set(data.transactions);
      if (data.remittances) this.remittances.set(data.remittances);
      if (data.exchanges) this.exchanges.set(data.exchanges);
      return true;
    } catch (error) {
      console.error('Import error', error);
      return false;
    }
  }

  async resetData() {
    this.pairs.set([]);
    this.transactions.set([]);
    this.remittances.set([]);
    this.exchanges.set([]);
    this.currencies.set(['USD', 'VES', 'COP', 'BRL']);
    if (this.isBrowser) {
      localStorage.clear();
    }
  }

  async loadAdminData() {
    return {
      remittances: this.remittances(),
      transactions: this.transactions()
    };
  }
}
