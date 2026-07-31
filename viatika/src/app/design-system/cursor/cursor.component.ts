import { Component, OnInit, OnDestroy, inject, Renderer2, ElementRef, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-cursor',
  standalone: true,
  template: '<div class="custom-cursor" #cursor></div>',
  styles: [`
    .custom-cursor {
      position: fixed;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: #D31212;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      transition: width 0.2s ease, height 0.2s ease, opacity 0.2s ease;
      mix-blend-mode: difference;
    }
    
    .custom-cursor.hover {
      width: 40px;
      height: 40px;
      opacity: 0.3;
      background-color: #D31212;
    }
    
    .custom-cursor.text {
      width: 2px;
      height: 20px;
      border-radius: 0;
      background-color: #D31212;
    }
    
    .custom-cursor.hidden {
      opacity: 0;
    }
  `],
})
export class CursorComponent implements OnInit, OnDestroy {
  private document = inject(DOCUMENT);
  private renderer = inject(Renderer2);
  private cursorElement!: HTMLElement;
  
  private mouseMoveListener?: () => void;
  private mouseEnterListener?: () => void;
  private mouseLeaveListener?: () => void;
  private mouseOverListener?: () => void;

  ngOnInit(): void {
    // Hide default cursor
    this.renderer.setStyle(this.document.body, 'cursor', 'none');
    
    // Create cursor element
    this.cursorElement = this.document.querySelector('.custom-cursor') as HTMLElement;
    
    if (!this.cursorElement) {
      this.cursorElement = this.renderer.createElement('div');
      this.renderer.addClass(this.cursorElement, 'custom-cursor');
      this.renderer.appendChild(this.document.body, this.cursorElement);
    }
    
    this.setupEventListeners();
  }

  ngOnDestroy(): void {
    // Restore default cursor
    this.renderer.removeStyle(this.document.body, 'cursor');
    
    // Remove event listeners
    if (this.mouseMoveListener) {
      this.mouseMoveListener();
    }
    if (this.mouseEnterListener) {
      this.mouseEnterListener();
    }
    if (this.mouseLeaveListener) {
      this.mouseLeaveListener();
    }
    if (this.mouseOverListener) {
      this.mouseOverListener();
    }
    
    // Remove cursor element
    if (this.cursorElement) {
      this.renderer.removeChild(this.document.body, this.cursorElement);
    }
  }

  private setupEventListeners(): void {
    // Track mouse movement
    this.mouseMoveListener = this.renderer.listen(
      this.document,
      'mousemove',
      (event: MouseEvent) => {
        this.updateCursorPosition(event.clientX, event.clientY);
      }
    );

    // Hide cursor when mouse leaves window
    this.mouseLeaveListener = this.renderer.listen(
      this.document,
      'mouseleave',
      () => {
        this.renderer.addClass(this.cursorElement, 'hidden');
      }
    );

    // Show cursor when mouse enters window
    this.mouseEnterListener = this.renderer.listen(
      this.document,
      'mouseenter',
      () => {
        this.renderer.removeClass(this.cursorElement, 'hidden');
      }
    );

    // Handle hover states
    this.mouseOverListener = this.renderer.listen(
      this.document,
      'mouseover',
      (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        this.handleHover(target);
      }
    );
  }

  private updateCursorPosition(x: number, y: number): void {
    this.renderer.setStyle(this.cursorElement, 'left', `${x}px`);
    this.renderer.setStyle(this.cursorElement, 'top', `${y}px`);
  }

  private handleHover(element: HTMLElement): void {
    // Check if element is interactive
    const isInteractive = 
      element.tagName === 'BUTTON' ||
      element.tagName === 'A' ||
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.getAttribute('role') === 'button' ||
      element.classList.contains('cursor-pointer') ||
      element.closest('button, a, [role="button"]');

    // Check if element is text input
    const isTextInput = 
      element.tagName === 'INPUT' && 
      (element.getAttribute('type') === 'text' || 
       element.getAttribute('type') === 'email' || 
       element.getAttribute('type') === 'password' ||
       !element.getAttribute('type'));

    // Remove all state classes
    this.renderer.removeClass(this.cursorElement, 'hover');
    this.renderer.removeClass(this.cursorElement, 'text');

    if (isTextInput) {
      this.renderer.addClass(this.cursorElement, 'text');
    } else if (isInteractive) {
      this.renderer.addClass(this.cursorElement, 'hover');
    }
  }
}

