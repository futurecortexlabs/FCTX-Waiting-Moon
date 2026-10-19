import { Audio, AudioListener, AudioLoader } from 'three';

/**
 * 音楽（public/audio/ にユーザーが置く）。
 * 音が鳴っている間は AudioContext の時刻を作品の時計にして映像と同期させる。
 * ファイルが無い・自動再生がブロックされている場合は無音のまま映像だけ進む。
 */
export class Soundtrack {
  readonly listener = new AudioListener();
  private readonly audio = new Audio(this.listener);
  private ready = false;
  private duration = 0;
  private active = false;
  private startCtx = 0;
  private startOffset = 0;

  constructor(private readonly muted: boolean) {
    const resume = () => {
      if (this.listener.context.state !== 'running') void this.listener.context.resume();
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  async load(urls: string[]) {
    if (this.muted) return;
    const loader = new AudioLoader();
    for (const url of urls) {
      try {
        const buffer = await loader.loadAsync(url);
        this.audio.setBuffer(buffer);
        this.duration = buffer.duration;
        this.ready = true;
        return;
      } catch {
        // 次の候補へ
      }
    }
  }

  /** 再生可能なら offset 秒から鳴らし始める */
  tryStart(offset: number) {
    if (!this.ready || this.active) return;
    if (this.listener.context.state !== 'running') return;
    if (offset >= this.duration - 0.05) return;
    if (this.audio.isPlaying) this.audio.stop();
    this.audio.offset = offset;
    this.audio.play();
    this.startCtx = this.listener.context.currentTime;
    this.startOffset = offset;
    this.active = true;
  }

  stop() {
    if (this.audio.isPlaying) this.audio.stop();
    this.active = false;
  }

  /** 鳴っていれば音楽の現在位置（秒）、鳴っていなければ null */
  time(): number | null {
    if (!this.active) return null;
    const t = this.startOffset + (this.listener.context.currentTime - this.startCtx);
    if (t >= this.duration) {
      this.active = false;
      return null;
    }
    return t;
  }
}
