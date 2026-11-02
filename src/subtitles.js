export function validSegments(segments) {
  return Array.isArray(segments) && segments.length > 0 && segments.every(segment =>
    segment && Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
    segment.start >= 0 && segment.end > segment.start &&
    typeof segment.text === 'string' && segment.text.trim().length > 0
  );
}

function appendText(base, addition) {
  const text = addition.trim();
  if (!base) return text;
  return /^[,.;:!?%)}\]]/.test(text) ? `${base}${text}` : `${base} ${text}`;
}

export function recoverTimedSegments(segments) {
  if (!Array.isArray(segments)) return [];
  const recovered = [];
  let leadingText = '';
  for (const segment of segments) {
    const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
    if (!text) continue;
    if (validSegments([segment])) {
      recovered.push({ ...segment, text: appendText(leadingText, text) });
      leadingText = '';
    } else if (recovered.length) {
      const previous = recovered[recovered.length - 1];
      previous.text = appendText(previous.text, text);
    } else {
      leadingText = appendText(leadingText, text);
    }
  }
  return validSegments(recovered) ? recovered : [];
}

function wrapCaption(text) {
  const lines = [''];
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + word.length + 1 > 42) lines.push(word);
    else lines[last] = lines[last] ? `${lines[last]} ${word}` : word;
  }
  return lines.join('\n');
}

export function groupCaptionSegments(segments) {
  if (!validSegments(segments)) return [];
  const captions = [];
  let current = null;
  let wordCount = 0;
  const flush = () => {
    if (current) captions.push({ ...current, text: wrapCaption(current.text) });
  };
  for (const segment of segments) {
    const text = segment.text.trim();
    const addedWords = text.split(/\s+/).length;
    if (current) {
      const combined = appendText(current.text, text);
      const sentenceEnd = /[.!?…]["'”’)]?$/.test(current.text) && wordCount >= 4;
      const pause = segment.start - current.end > 0.75;
      const tooLong = segment.end - current.start > 5 || combined.length > 84 ||
        wrapCaption(combined).split('\n').length > 2 ||
        wordCount + addedWords > 12;
      if (sentenceEnd || pause || tooLong) {
        flush();
        current = null;
      }
    }
    if (!current) {
      current = { start: segment.start, end: segment.end, text };
      wordCount = addedWords;
    } else {
      current.end = Math.max(current.end, segment.end);
      current.text = appendText(current.text, text);
      wordCount += addedWords;
    }
  }
  flush();
  return captions;
}

export function validSrt(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const cues = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  const time = '(\\d{2,}):(\\d{2}):(\\d{2}),(\\d{3})';
  const timing = new RegExp(`^${time} --> ${time}$`);
  const millis = parts => ((Number(parts[0]) * 60 + Number(parts[1])) * 60 +
    Number(parts[2])) * 1000 + Number(parts[3]);
  return cues.every((cue, index) => {
    const [number, range, ...lines] = cue.split('\n');
    const match = timing.exec(range || '');
    return number === String(index + 1) && match &&
      Number(match[2]) < 60 && Number(match[3]) < 60 &&
      Number(match[6]) < 60 && Number(match[7]) < 60 &&
      millis(match.slice(1, 5)) < millis(match.slice(5, 9)) &&
      lines.some(line => line.trim());
  });
}

function timestamp(seconds) {
  const total = Math.round(seconds * 1000);
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor(total / 60000) % 60;
  const secs = Math.floor(total / 1000) % 60;
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function buildSrt(segments) {
  if (!validSegments(segments)) {
    const error = new Error('Segmentos de legenda inválidos ou vazios.');
    error.code = 'INVALID_SEGMENTS';
    throw error;
  }
  return segments.map((segment, index) =>
    `${index + 1}\n${timestamp(segment.start)} --> ${timestamp(segment.end)}\n${segment.text.trim()}`
  ).join('\n\n');
}
