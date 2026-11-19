import { defineConfig } from 'orval'

export default defineConfig({
  tasky: {
    input: './openapi.json',
    output: {
      mode: 'single',
      target: './src/api/generated/client.ts',
      client: 'fetch',
      clean: true,
      override: {
        mutator: {
          path: './src/api/http.ts',
          name: 'apiFetch',
        },
        // The built-in serialiser writes a null parameter as the text "null".
        paramsSerializer: {
          path: './src/api/query.ts',
          name: 'toQueryString',
        },
        fetch: {
          // apiFetch resolves with the parsed body and throws ApiError, so there is no status wrapper.
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
})
