import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DataService, Remittance, Transaction } from '../../services/data.service';

@Component({
  selector: 'app-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  templateUrl: './admin.html'
})
export class AdminDashboardComponent implements OnInit {
  dataService = inject(DataService);
  
  remittances = signal<Remittance[]>([]);
  transactions = signal<Transaction[]>([]);
  isLoading = signal(true);

  async ngOnInit() {
    if (this.dataService.isAdmin()) {
      const data = await this.dataService.loadAdminData();
      this.remittances.set(data.remittances);
      this.transactions.set(data.transactions);
      this.isLoading.set(false);
    }
  }

  getTotalCapital() {
    // Sum of all DEPOSITs minus WITHDRAWALs across all users?
    // Or just sum of all remittances amounts?
    // The user asked for "entradas totales de todos los usuarios y llevar el control de todas las remesas para saber mi capital total"
    
    // Let's sum all DEPOSITs and REMITTANCE_INs as total capital in base currency (assuming USD or just raw sum if mixed)
    // For simplicity, we can group by currency
    const capitalByCurrency: Record<string, number> = {};
    
    for (const tx of this.transactions()) {
      if (!capitalByCurrency[tx.currency]) capitalByCurrency[tx.currency] = 0;
      if (tx.type === 'DEPOSIT' || tx.type === 'REMITTANCE_IN') {
        capitalByCurrency[tx.currency] += tx.amount;
      } else if (tx.type === 'WITHDRAWAL' || tx.type === 'REMITTANCE_OUT') {
        capitalByCurrency[tx.currency] -= tx.amount;
      }
    }
    
    return Object.entries(capitalByCurrency).filter((cap) => cap[1] !== 0);
  }

  getTotalRemittancesSent() {
    return this.remittances().reduce((acc, r) => acc + r.amountSent, 0);
  }
}
