import { normalizeApiError, uploadSourceToSignedUrl } from '../utils/api';

jest.mock('axios', () => ({
  create: () => ({
    interceptors: {
      response: {
        use: jest.fn()
      }
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  })
}));

describe('normalizeApiError', () => {
  test('preserves the application contract and request context', () => {
    const normalized = normalizeApiError({
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 409',
      config: {
        method: 'put',
        url: '/photos/42'
      },
      response: {
        status: 409,
        headers: {},
        data: {
          success: false,
          code: 'VERSION_CONFLICT',
          message: 'Foto modificata',
          details: {
            expectedVersion: 2,
            actualVersion: 3
          }
        }
      }
    });

    expect(normalized).toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Foto modificata',
      details: {
        expectedVersion: 2,
        actualVersion: 3
      },
      method: 'PUT',
      url: '/photos/42',
      retryable: false,
      isAxiosError: true
    });
  });

  test('marks network and retryable server failures correctly', () => {
    expect(normalizeApiError({
      code: 'ERR_NETWORK',
      message: 'Network Error',
      config: { method: 'post', url: '/photos' }
    })).toMatchObject({
      status: null,
      code: 'ERR_NETWORK',
      retryable: true
    });

    expect(normalizeApiError({
      message: 'Service unavailable',
      response: {
        status: 503,
        headers: { 'retry-after': '30' },
        data: { code: 'METADATA_READ_ONLY', message: 'Read only' }
      }
    })).toMatchObject({
      status: 503,
      retryAfter: '30',
      retryable: true
    });
  });
});

describe('uploadSourceToSignedUrl', () => {
  test('uses the canonical content type returned by the backend for the signed PUT', async () => {
    const requests = [];
    class FakeXMLHttpRequest {
      constructor() {
        this.headers = {};
        this.upload = {};
        requests.push(this);
      }

      open(method, url) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(name, value) {
        this.headers[name] = value;
      }

      send(file) {
        this.file = file;
        this.status = 200;
        this.onload();
      }
    }
    const previousXMLHttpRequest = global.XMLHttpRequest;
    global.XMLHttpRequest = FakeXMLHttpRequest;
    const file = { type: 'image/jpg', size: 1024 };

    try {
      await uploadSourceToSignedUrl({
        uploadUrl: 'https://r2.example.test/signed',
        file,
        contentType: 'image/jpeg'
      });
    } finally {
      global.XMLHttpRequest = previousXMLHttpRequest;
    }

    expect(requests).toHaveLength(1);
    expect(requests[0].headers['Content-Type']).toBe('image/jpeg');
    expect(requests[0].headers['Content-Type']).not.toBe(file.type);
  });
});
