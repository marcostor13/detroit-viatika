import { Component, ElementRef, signal, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AiChatService, ChatMessage } from './services/ai-chat.service';

interface DisplayMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  streaming?: boolean;
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.component.html',
  styleUrl: './ai-assistant.component.scss',
})
export class AiAssistantComponent implements OnDestroy {
  @ViewChild('messagesEnd') private messagesEnd!: ElementRef;

  isOpen = signal(false);
  userInput = signal('');
  loading = signal(false);
  messages = signal<DisplayMessage[]>([]);

  private sub: Subscription | null = null;

  constructor(private readonly chatService: AiChatService) {}

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  toggle() {
    this.isOpen.update((v) => !v);
  }

  sendMessage() {
    const text = this.userInput().trim();
    if (!text || this.loading()) return;

    this.userInput.set('');
    this.loading.set(true);

    this.messages.update((msgs) => [...msgs, { role: 'user', content: text }]);

    const history: ChatMessage[] = this.messages()
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    this.sub = this.chatService.streamChat(history).subscribe({
      next: (chunk) => {
        if (chunk.type === 'tool_call') {
          this.messages.update((msgs) => [
            ...msgs,
            { role: 'tool', content: '', toolName: chunk.toolName, streaming: true },
          ]);
          this.scrollToBottom();
        } else if (chunk.type === 'text' && chunk.content) {
          const msgs = this.messages();
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant' && last.streaming) {
            this.messages.update((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + chunk.content,
              };
              return updated;
            });
          } else {
            this.messages.update((prev) => [
              ...prev,
              { role: 'assistant', content: chunk.content!, streaming: true },
            ]);
          }
          this.scrollToBottom();
        } else if (chunk.type === 'done' || chunk.type === 'error') {
          this.messages.update((prev) => prev.map((m) => ({ ...m, streaming: false })));
          this.loading.set(false);
          if (chunk.type === 'error') {
            this.messages.update((prev) => [
              ...prev,
              { role: 'assistant', content: 'Ocurrió un error. Intenta de nuevo.' },
            ]);
          }
        }
      },
      error: () => {
        this.loading.set(false);
        this.messages.update((prev) => [
          ...prev,
          { role: 'assistant', content: 'Error de conexión. Verifica tu red.' },
        ]);
      },
    });
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  clearChat() {
    this.messages.set([]);
  }

  toolLabel(toolName?: string): string {
    const labels: Record<string, string> = {
      get_my_expense_reports: 'Consultando rendiciones...',
      get_my_advances: 'Consultando viáticos...',
      get_pending_approvals: 'Consultando aprobaciones pendientes...',
      get_expense_summary: 'Analizando gastos...',
    };
    return labels[toolName ?? ''] ?? 'Procesando...';
  }

  private scrollToBottom() {
    setTimeout(() => {
      this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }
}
