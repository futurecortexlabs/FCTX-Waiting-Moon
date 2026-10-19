import type { Params } from './params';

/** 黒フェードと、作品に出る唯一の文字（最後の一行とタイトル） */
export class Overlay {
  private readonly fade = document.getElementById('fade') as HTMLElement;
  private readonly line = document.getElementById('line') as HTMLElement;
  private readonly title = document.getElementById('title') as HTMLElement;
  private last = { fade: -1, line: -1, title: -1 };

  apply(p: Params) {
    this.set(this.fade, 'fade', p.fade);
    this.set(this.line, 'line', p.line);
    this.set(this.title, 'title', p.title);
  }

  private set(el: HTMLElement, key: 'fade' | 'line' | 'title', v: number) {
    const q = Math.round(v * 1000) / 1000;
    if (q === this.last[key]) return;
    this.last[key] = q;
    el.style.opacity = String(q);
  }
}
