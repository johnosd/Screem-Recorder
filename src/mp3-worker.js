// Worker de codificação MP3: mantém a janela responsiva em gravações longas.
import { encodePcmToMp3 } from './mp3-encode.js';

importScripts('../lib/lame.min.js');

self.onmessage = (event) => {
  try {
    const parts = encodePcmToMp3(self.lamejs.Mp3Encoder, event.data,
      progress => self.postMessage({ type: 'progress', progress }));
    self.postMessage({ type: 'done', blob: new Blob(parts, { type: 'audio/mpeg' }) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
