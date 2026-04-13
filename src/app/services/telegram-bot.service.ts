import { Injectable, inject, signal, effect } from '@angular/core';
import { DataService } from './data.service';

@Injectable({ providedIn: 'root' })
export class TelegramBotService {
  dataService = inject(DataService);
  
  private token = '';
  private chatId = '';
  private offset = 0;
  private isPolling = false;
  private pollingTimeout: ReturnType<typeof setTimeout> | null = null;

  botStatus = signal<'disconnected' | 'connected' | 'error'>('disconnected');
  botName = signal<string>('');

  constructor() {
    effect(() => {
      const active = this.dataService.telegramBotActive();
      const token = this.dataService.telegramToken();
      const chatId = this.dataService.telegramChatId();

      if (active && token && token.trim() !== '') {
        this.token = token.trim();
        this.chatId = chatId ? chatId.trim() : '';
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });
  }

  async startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${this.token}/getMe`);
      const meData = await meRes.json();
      if (meData.ok) {
        this.botName.set(meData.result.username);
        this.botStatus.set('connected');
      } else {
        this.botStatus.set('error');
        this.isPolling = false;
        return;
      }
    } catch {
      this.botStatus.set('error');
      this.isPolling = false;
      return;
    }

    this.poll();
  }

  stopPolling() {
    this.isPolling = false;
    this.botStatus.set('disconnected');
    this.botName.set('');
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
  }

  private async poll() {
    if (!this.isPolling) return;
    
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=10`);
      if (!res.ok) {
        this.botStatus.set('error');
        this.pollingTimeout = setTimeout(() => this.poll(), 5000);
        return;
      }
      const data = await res.json();
      
      if (data.ok) {
        this.botStatus.set('connected');
        if (data.result.length > 0) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            if (update.message && update.message.text) {
              await this.handleMessage(update.message);
            }
          }
        }
      } else {
        this.botStatus.set('error');
      }
    } catch (e) {
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        // This is normal for long polling timeouts or network interruptions.
        // We shouldn't spam the console or set it to error immediately.
      } else {
        console.error('Telegram polling error:', e);
        this.botStatus.set('error');
      }
    }
    
    if (this.isPolling) {
      this.pollingTimeout = setTimeout(() => this.poll(), 1000);
    }
  }

  private async handleMessage(message: { chat: { id: number }, text: string }) {
    const chatId = message.chat.id;
    const text = message.text.trim();
    const args = text.split(' ');
    const command = args[0].toLowerCase().split('@')[0]; // Handle /start@botname

    if (!this.chatId || this.chatId.trim() === '') {
      await this.sendMessage(chatId, `👋 ¡Hola! Tu Chat ID es:\n\n\`${chatId}\`\n\nCópialo y pégalo en la configuración de RemesaFlow para habilitar el bot.`);
      return;
    }

    if (chatId.toString() !== this.chatId.trim()) {
      return; // Ignore messages from other chats
    }

    if (command === '/start' || command === '/help') {
      await this.sendMessage(chatId, `¡Hola! Soy el bot de RemesaFlow. 🚀\n\nPuedes usar los siguientes comandos:\n/wallet - Revisar tus balances\n/depositar <monto> <moneda> - Ejemplo: /depositar 100 USD\n/remesa <monto_env> <moneda_env> <monto_rec> <moneda_rec> - Ejemplo: /remesa 100 USD 380000 COP\n/ganancias - Ver tus ganancias`);
    } else if (command === '/wallet') {
      const balances = this.dataService.balances();
      let msg = '💰 *Tu Wallet*\n\n';
      let hasBalances = false;
      for (const [currency, amount] of Object.entries(balances)) {
        if (amount !== 0) {
          msg += `- ${currency}: ${amount.toFixed(2)}\n`;
          hasBalances = true;
        }
      }
      if (!hasBalances) {
        msg += 'Tu wallet está vacía.';
      }
      await this.sendMessage(chatId, msg);
    } else if (command === '/depositar') {
      if (args.length === 3) {
        const amount = parseFloat(args[1]);
        const currency = args[2].toUpperCase();
        if (!isNaN(amount) && amount > 0) {
          await this.dataService.addTransaction('DEPOSIT', currency, amount, 'Depósito vía Telegram');
          await this.sendMessage(chatId, `✅ Depósito de ${amount} ${currency} registrado exitosamente.`);
        } else {
          await this.sendMessage(chatId, `❌ Monto inválido. Uso: /depositar 100 USD`);
        }
      } else {
        await this.sendMessage(chatId, `❌ Formato incorrecto. Uso: /depositar <monto> <moneda>`);
      }
    } else if (command === '/ganancias') {
      const remittances = this.dataService.remittances();
      const exchanges = this.dataService.exchanges();
      
      let totalProfit = 0;
      remittances.forEach(r => totalProfit += (r.profitInBase || 0));
      exchanges.forEach(e => totalProfit += (e.profit || 0));
      
      let msg = '📈 *Tus Ganancias*\n\n';
      msg += `Aprox: ${totalProfit.toFixed(2)} (en moneda base de cada operación)\n`;
      
      await this.sendMessage(chatId, msg);
    } else if (command === '/remesa') {
      if (args.length === 5) {
        const amountSent = parseFloat(args[1]);
        const currencySent = args[2].toUpperCase();
        const amountReceived = parseFloat(args[3]);
        const currencyReceived = args[4].toUpperCase();
        
        if (!isNaN(amountSent) && !isNaN(amountReceived) && amountSent > 0 && amountReceived > 0) {
          const pairId = `${currencySent}-${currencyReceived}`;
          const rate = amountReceived / amountSent;
          
          await this.dataService.addRemittance({
            senderFirstName: 'Telegram',
            senderLastName: 'Bot',
            agentName: 'Bot',
            pairId,
            amountSent,
            amountReceived,
            rate
          });
          
          await this.sendMessage(chatId, `✅ *Remesa Registrada*\n\nEnviado: ${amountSent} ${currencySent}\nRecibido: ${amountReceived} ${currencyReceived}\nTasa: ${rate.toFixed(4)}`);
        } else {
          await this.sendMessage(chatId, `❌ Montos inválidos.`);
        }
      } else {
        await this.sendMessage(chatId, `❌ Formato incorrecto. Uso: /remesa 100 USD 380000 COP`);
      }
    } else {
      await this.sendMessage(chatId, `❌ Comando no reconocido. Usa /help para ver las opciones.`);
    }
  }

  private async sendMessage(chatId: number, text: string) {
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.error('Error sending message:', e);
    }
  }
}
