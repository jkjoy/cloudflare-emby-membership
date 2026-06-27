import { describe, expect, it } from 'vitest';
import { validateEmbyBaseUrl } from '../src/emby.js';

describe('Emby URL validation', () => {
  it('allows http and https public-looking URLs', () => {
    expect(validateEmbyBaseUrl('https://emby.example.com')).toBe('https://emby.example.com');
    expect(validateEmbyBaseUrl('http://emby.example.com:8096/')).toBe('http://emby.example.com:8096');
  });

  it('rejects unsupported protocols and localhost/private addresses', () => {
    expect(() => validateEmbyBaseUrl('file:///etc/passwd')).toThrow('仅支持 HTTP/HTTPS');
    expect(() => validateEmbyBaseUrl('http://localhost:8096')).toThrow('不允许使用内网或本机地址');
    expect(() => validateEmbyBaseUrl('http://127.0.0.1:8096')).toThrow('不允许使用内网或本机地址');
    expect(() => validateEmbyBaseUrl('http://192.168.1.10:8096')).toThrow('不允许使用内网或本机地址');
    expect(() => validateEmbyBaseUrl('http://10.0.0.2:8096')).toThrow('不允许使用内网或本机地址');
  });
});
