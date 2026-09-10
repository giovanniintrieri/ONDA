// Conserva in anticipo solo il prossimo brano.
export class AudioSourceBuffer {
  private generation = 0;
  private prepared: { id: string; url: string } | null = null;
  private pendingId: string | null = null;
  private read: (id: string) => Promise<Blob>;

  constructor(read: (id: string) => Promise<Blob>) {
    this.read = read;
  }

  async load(id: string): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const blob = await Promise.race([
        this.read(id),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(
              new Error(
                'Il file locale non risponde. Premi Riproduci per riprovare.'
              )
            ),
            15000
          );
        }),
      ]);

      return URL.createObjectURL(blob);
    } finally {
      clearTimeout(timer);
    }
  }

  take(id: string): string | null {
    if (this.prepared?.id !== id) return null;

    const url = this.prepared.url;
    this.prepared = null;

    // Da questo momento il lettore gestisce la durata dell'URL.
    return url;
  }

  prepare(id: string | null) {
    if (
      id &&
      (this.prepared?.id === id || this.pendingId === id)
    ) {
      return;
    }

    this.clear();
    if (!id) return;

    const generation = this.generation;
    this.pendingId = id;

    void this.load(id)
      .then(url => {
        if (generation !== this.generation) {
          URL.revokeObjectURL(url);
          return;
        }

        this.pendingId = null;
        this.prepared = { id, url };
      })
      .catch(() => {
        if (generation === this.generation) {
          this.pendingId = null;
        }

        // Un errore di precaricamento non interrompe il brano attuale.
      });
  }

  clear() {
    this.generation++;
    this.pendingId = null;

    if (this.prepared) {
      URL.revokeObjectURL(this.prepared.url);
    }

    this.prepared = null;
  }
}

// Un solo tentativo di recupero per sorgente.
// Una pausa dell'utente o del sistema annulla il recupero.
export function connectStallRecovery(
  audio: HTMLAudioElement,
  loading: () => boolean,
  report: () => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let source = '';
  let attempted = false;
  let recovery = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const paused = () => {
    if (audio.paused) {
      recovery++;
      cancel();
    }
  };

  function waiting() {
    const src = audio.getAttribute('src');

    if (
      !src ||
      audio.paused ||
      audio.ended ||
      audio.seeking ||
      loading()
    ) {
      return;
    }

    if (source !== src) {
      source = src;
      attempted = false;
    }

    if (attempted || timer) return;

    const position = audio.currentTime;

    timer = setTimeout(() => {
      timer = undefined;

      if (
        audio.getAttribute('src') !== src ||
        audio.paused ||
        audio.ended ||
        audio.seeking ||
        audio.currentTime !== position ||
        loading()
      ) {
        return;
      }

      attempted = true;
      const token = ++recovery;

      const failed = () => {
        if (
          token !== recovery ||
          audio.getAttribute('src') !== src
        ) {
          return;
        }

        audio.pause();
        report();
      };

      try {
        audio.load();
        audio.currentTime = position;

        void audio.play().catch(error => {
          if (
            !(error instanceof DOMException &&
              error.name === 'AbortError')
          ) {
            failed();
          }
        });
      } catch {
        failed();
      }
    }, 8000);
  }

  const resets = [
    'playing',
    'seeking',
    'ended',
    'emptied',
    'error',
  ];

  audio.addEventListener('waiting', waiting);
  audio.addEventListener('stalled', waiting);
  audio.addEventListener('pause', paused);

  for (const event of resets) {
    audio.addEventListener(event, cancel);
  }

  return () => {
    recovery++;
    cancel();

    audio.removeEventListener('waiting', waiting);
    audio.removeEventListener('stalled', waiting);
    audio.removeEventListener('pause', paused);

    for (const event of resets) {
      audio.removeEventListener(event, cancel);
    }
  };
}