import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';
import iconv from 'iconv-lite';
import config from '../config.js';

const { userAgent, encoding } = config.site;
const TIMEOUT_MS = 20_000;

/*
 * 이 사이트는 Apache 2.2.20(2011년) + PHP 5.3 위에서 돌아가며,
 * 헤더 이름과 콜론 사이에 공백을 넣은 "P3P : CP=..." 를 내려보냅니다.
 * RFC 7230이 거부하도록 규정한 형태라 Node 내장 fetch(undici)는 물론
 * node:http의 insecureHTTPParser로도 통과하지 못하고
 * "Invalid header token"으로 실패합니다.
 * 그래서 소켓 위에 관대한 최소 HTTP 클라이언트를 직접 두었습니다.
 */

const cookieJar = new Map();

function storeCookies(setCookie = []) {
  for (const line of setCookie) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader() {
  if (cookieJar.size === 0) return undefined;
  return [...cookieJar].map(([k, v]) => `${k}=${v}`).join('; ');
}

export function clearCookies() {
  cookieJar.clear();
}

function dechunk(buf) {
  const out = [];
  let off = 0;
  while (off < buf.length) {
    const nl = buf.indexOf('\r\n', off);
    if (nl < 0) break;
    const size = parseInt(buf.subarray(off, nl).toString('latin1').split(';')[0].trim(), 16);
    if (!Number.isInteger(size) || size <= 0) break;
    const start = nl + 2;
    out.push(buf.subarray(start, start + size));
    off = start + size + 2;
  }
  return Buffer.concat(out);
}

// 헤더 이름을 trim해서 규격 위반 헤더도 그대로 받아들입니다.
function parseResponse(buf) {
  const sep = buf.indexOf('\r\n\r\n');
  if (sep < 0) throw new Error('응답 헤더를 찾지 못했습니다');

  const lines = buf.subarray(0, sep).toString('latin1').split('\r\n');
  const status = Number(lines[0].match(/^HTTP\/[\d.]+\s+(\d{3})/)?.[1]);
  if (!status) throw new Error(`상태줄 해석 실패: ${lines[0]}`);

  const headers = {};
  const setCookie = [];
  for (const line of lines.slice(1)) {
    const c = line.indexOf(':');
    if (c < 0) continue;
    const name = line.slice(0, c).trim().toLowerCase();
    const value = line.slice(c + 1).trim();
    if (name === 'set-cookie') setCookie.push(value);
    else headers[name] = value;
  }

  let body = buf.subarray(sep + 4);
  if ((headers['transfer-encoding'] ?? '').toLowerCase().includes('chunked')) {
    body = dechunk(body);
  } else if (headers['content-length']) {
    body = body.subarray(0, Number(headers['content-length']));
  }
  return { status, headers, setCookie, body };
}

function socketRequest(urlStr, { method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isTls = u.protocol === 'https:';
    const port = Number(u.port) || (isTls ? 443 : 80);

    const head =
      `${method} ${u.pathname}${u.search} HTTP/1.1\r\n` +
      `Host: ${u.hostname}\r\n` +
      Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\nConnection: close\r\n\r\n';

    const onConnect = () => {
      sock.write(head);
      if (body) sock.write(body);
    };
    const sock = isTls
      ? tls.connect({ host: u.hostname, port, servername: u.hostname }, onConnect)
      : net.connect({ host: u.hostname, port }, onConnect);

    const chunks = [];
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      if (err) reject(err);
      else resolve(val);
    };

    sock.setTimeout(TIMEOUT_MS, () => finish(new Error(`타임아웃(${TIMEOUT_MS / 1000}초)`)));
    sock.on('data', (c) => chunks.push(c));
    sock.on('error', (e) => finish(e));

    // Connection: close로 요청하므로 서버가 끊는 시점이 곧 응답 완료 시점입니다.
    const done = () => {
      if (settled) return;
      if (chunks.length === 0) return finish(new Error('빈 응답'));
      try {
        finish(null, parseResponse(Buffer.concat(chunks)));
      } catch (e) {
        finish(e);
      }
    };
    sock.on('end', done);
    sock.on('close', done);
  });
}

function baseHeaders() {
  const h = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Accept-Encoding': 'identity',
  };
  const c = cookieHeader();
  if (c) h.Cookie = c;
  return h;
}

async function requestFollow(urlStr, opts, maxHops = 5) {
  let current = urlStr;
  let o = opts;
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await socketRequest(current, {
      ...o,
      headers: { ...baseHeaders(), ...(o.headers ?? {}) },
    });
    storeCookies(res.setCookie);

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.location;
      if (!loc) return { ...res, url: current };
      current = new URL(loc, current).toString();
      // WAF에 걸리면 se-cu.com/error.html로 튕깁니다. UA 누락 시의 대표 증상.
      if (current.includes('se-cu.com')) {
        throw new Error('WAF 차단(se-cu.com으로 리다이렉트) — User-Agent 확인 필요');
      }
      if (res.status === 303 || o.method === 'POST') {
        o = { ...o, method: 'GET', body: null, headers: {} };
      }
      continue;
    }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return { ...res, url: current };
  }
  throw new Error('리다이렉트가 너무 많습니다');
}

async function withRetry(fn, { attempts = 3, label = 'request' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const wait = 1000 * 2 ** i;
        console.warn(`[http] ${label} 실패 (${i + 1}/${attempts}): ${err.message} → ${wait}ms 후 재시도`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`${label} 최종 실패: ${lastErr.message}`);
}

export async function getHtml(url, { label = url } = {}) {
  return withRetry(async () => {
    const res = await requestFollow(url, { method: 'GET' });
    return iconv.decode(res.body, encoding);
  }, { label });
}

// EUC-KR 사이트이므로 폼 값도 EUC-KR로 퍼센트 인코딩해 보냅니다.
function encodeFormEucKr(fields) {
  return Object.entries(fields)
    .map(([k, v]) => {
      const enc = iconv.encode(String(v), encoding);
      const pct = [...enc].map((b) => '%' + b.toString(16).padStart(2, '0').toUpperCase()).join('');
      return `${encodeURIComponent(k)}=${pct}`;
    })
    .join('&');
}

export async function postForm(url, fields, { label = url } = {}) {
  const body = encodeFormEucKr(fields);
  return withRetry(async () => {
    const res = await requestFollow(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': `application/x-www-form-urlencoded; charset=${encoding}`,
        'Content-Length': String(Buffer.byteLength(body)),
        'Referer': config.site.base + '/',
      },
    });
    return iconv.decode(res.body, encoding);
  }, { label });
}

// 카카오/텔레그램은 정상 규격 서버이므로 내장 fetch를 그대로 씁니다.
export async function postJsonApi(url, { headers = {}, body, form } = {}) {
  const init = { method: 'POST', headers: { ...headers }, signal: AbortSignal.timeout(15_000) };
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  } else if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}
