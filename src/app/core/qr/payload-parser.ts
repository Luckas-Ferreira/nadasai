export type QrPayloadType =
  | 'url'
  | 'wifi'
  | 'pix'
  | 'vcard'
  | 'email'
  | 'phone'
  | 'whatsapp'
  | 'text';

export interface ParsedWifi {
  readonly type: 'wifi';
  readonly ssid: string;
  readonly password?: string;
  readonly encryption: string;
  readonly hidden: boolean;
}

export interface ParsedPix {
  readonly type: 'pix';
  readonly key: string;
  readonly name?: string;
  readonly city?: string;
  readonly amount?: number;
  readonly txId?: string;
  readonly raw: string;
}

export interface ParsedVCard {
  readonly type: 'vcard';
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  readonly organization?: string;
  readonly raw: string;
}

export interface ParsedUrl {
  readonly type: 'url';
  readonly url: string;
}

export interface ParsedEmail {
  readonly type: 'email';
  readonly email: string;
  readonly subject?: string;
  readonly body?: string;
}

export interface ParsedPhone {
  readonly type: 'phone';
  readonly phone: string;
}

export interface ParsedWhatsapp {
  readonly type: 'whatsapp';
  readonly phone: string;
  readonly message?: string;
}

export interface ParsedText {
  readonly type: 'text';
  readonly text: string;
}

export type ParsedQrPayload =
  | ParsedWifi
  | ParsedPix
  | ParsedVCard
  | ParsedUrl
  | ParsedEmail
  | ParsedPhone
  | ParsedWhatsapp
  | ParsedText;

export function parseQrPayload(raw: string): ParsedQrPayload {
  const text = raw.trim();

  // 1. Wi-Fi: WIFI:S:...;T:...;P:...;
  if (/^WIFI:/i.test(text)) {
    const unescape = (s: string) => s.replace(/\\([\\;,:"])/g, '$1');
    const getField = (field: string) => {
      const match = text.match(new RegExp(`(?:^|;)${field}:([^;]*)(?:;|$)`, 'i'));
      return match ? unescape(match[1]) : undefined;
    };
    const ssid = getField('S') || '';
    const password = getField('P');
    const encryption = getField('T') || 'WPA';
    const hidden = getField('H')?.toLowerCase() === 'true';

    return {
      type: 'wifi',
      ssid,
      password,
      encryption,
      hidden,
    };
  }

  // 2. Pix: 00020126...br.gov.bcb.pix...6304...
  if (text.startsWith('000201') && text.includes('br.gov.bcb.pix')) {
    let key = '';
    let name = '';
    let city = '';
    let amount: number | undefined;
    let txId = '';

    // Quick EMV field extract
    const extractField = (id: string, src: string): string | null => {
      let idx = 0;
      while (idx < src.length - 4) {
        const tag = src.substring(idx, idx + 2);
        const len = parseInt(src.substring(idx + 2, idx + 4), 10);
        if (isNaN(len) || idx + 4 + len > src.length) break;
        const val = src.substring(idx + 4, idx + 4 + len);
        if (tag === id) return val;
        idx += 4 + len;
      }
      return null;
    };

    const acc = extractField('26', text);
    if (acc) {
      const k = extractField('01', acc);
      if (k) key = k;
    }
    const valStr = extractField('54', text);
    if (valStr) amount = parseFloat(valStr);
    name = extractField('59', text) || '';
    city = extractField('60', text) || '';
    const additional = extractField('62', text);
    if (additional) {
      txId = extractField('05', additional) || '';
    }

    return {
      type: 'pix',
      key: key || text,
      name,
      city,
      amount,
      txId,
      raw: text,
    };
  }

  // 3. vCard
  if (/^BEGIN:VCARD/i.test(text)) {
    const getVCardField = (field: string) => {
      const match = text.match(new RegExp(`(?:^|\\n)${field}(?:;[^:]*)?:([^\\r\\n]+)`, 'i'));
      return match ? match[1].trim() : undefined;
    };
    const fn = getVCardField('FN') || getVCardField('N') || 'Contato';
    const phone = getVCardField('TEL');
    const email = getVCardField('EMAIL');
    const org = getVCardField('ORG');

    return {
      type: 'vcard',
      name: fn.replace(/;/g, ' ').trim(),
      phone,
      email,
      organization: org,
      raw: text,
    };
  }

  // 4. WhatsApp: https://wa.me/...
  if (/^https?:\/\/wa\.me\//i.test(text)) {
    const url = new URL(text);
    const phone = url.pathname.replace(/\//g, '');
    const message = url.searchParams.get('text') || undefined;
    return {
      type: 'whatsapp',
      phone,
      message,
    };
  }

  // 5. Mailto:
  if (/^mailto:/i.test(text)) {
    const mailto = text.substring(7);
    const parts = mailto.split('?');
    const email = parts[0];
    const params = new URLSearchParams(parts[1] || '');
    return {
      type: 'email',
      email,
      subject: params.get('subject') || undefined,
      body: params.get('body') || undefined,
    };
  }

  // 6. Tel:
  if (/^tel:/i.test(text)) {
    return {
      type: 'phone',
      phone: text.substring(4),
    };
  }

  // 7. URL (http:// or https://)
  if (/^https?:\/\//i.test(text)) {
    return {
      type: 'url',
      url: text,
    };
  }

  // Default: Plain text
  return {
    type: 'text',
    text,
  };
}
