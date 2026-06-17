const BASE_URL = 'http://localhost:8080'

const buildUrl = (path) => {
  if (path.startsWith('/')) {
    return `${BASE_URL}${path}`
  }
  return `${BASE_URL}/${path}`
}

const withQuery = (path, params) => {
  if (!params || Object.keys(params).length === 0) {
    return buildUrl(path)
  }

  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    query.set(key, String(value))
  })

  return `${buildUrl(path)}?${query.toString()}`
}

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    ...options
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export const apiService = {
  get(path, params) {
    return request(withQuery(path, params), { method: 'GET' })
  },

  post(path, body) {
    return request(buildUrl(path), {
      method: 'POST',
      body: JSON.stringify(body)
    })
  },

  put(path, body) {
    return request(buildUrl(path), {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  },

  delete(path) {
    return request(buildUrl(path), { method: 'DELETE' })
  }
}
