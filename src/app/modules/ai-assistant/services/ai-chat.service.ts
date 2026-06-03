import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { UserStateService } from '../../../services/user-state.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolName?: string;
}

@Injectable({ providedIn: 'root' })
export class AiChatService {
  private readonly apiUrl = `${environment.api}/ai/chat`;

  constructor(private readonly userState: UserStateService) {}

  streamChat(messages: ChatMessage[]): Observable<StreamChunk> {
    return new Observable((observer) => {
      const token = this.userState.getToken();
      let aborted = false;
      const controller = new AbortController();

      fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            observer.error(new Error(`HTTP ${response.status}`));
            return;
          }
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';
            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith('data: ')) continue;
              try {
                const chunk: StreamChunk = JSON.parse(line.slice(6));
                observer.next(chunk);
                if (chunk.type === 'done') {
                  observer.complete();
                  return;
                }
              } catch {
                // ignorar chunk malformado
              }
            }
          }
          observer.complete();
        })
        .catch((err) => {
          if (!aborted) observer.error(err);
        });

      return () => {
        aborted = true;
        controller.abort();
      };
    });
  }
}
