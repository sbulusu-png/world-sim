const BASE = '/api'

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (err) {
    throw new Error('Network error — is the server running?')
  }
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server returned non-JSON response (HTTP ${res.status})`)
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function getWorldState() {
  return request('/state')
}

export function triggerEvent(payload) {
  return request('/event', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function resetWorld() {
  return request('/reset', { method: 'POST' })
}

export function startSimulation() {
  return request('/simulation/start', { method: 'POST' })
}

export function pauseSimulation() {
  return request('/simulation/pause', { method: 'POST' })
}

export function getSimulationStatus() {
  return request('/simulation/status')
}
